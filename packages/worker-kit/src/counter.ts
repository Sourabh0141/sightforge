/**
 * @sightforge/worker-kit - Counter Durable Object
 *
 * Implements atomic sliding-window rate limiting and daily user quotas
 * with SQLite-backed storage per KTD6, R70, and R111.
 */

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  reset: number;
}

export interface QuotaResult {
  allowed: boolean;
  used: number;
  remaining: number;
  reset: number;
}

export class Counter {
  private sql?: any;
  private memoryHits: Map<string, number[]> = new Map();
  private memoryQuotas: Map<string, number> = new Map();

  constructor(
    public state: DurableObjectState,
    public env: unknown,
  ) {
    // If state.storage.sql is available (Cloudflare SQLite Durable Object), initialize table schemas
    if ((state.storage as any)?.sql) {
      this.sql = (state.storage as any).sql;
      this.initSqliteSchema();
    }
  }

  private initSqliteSchema(): void {
    if (!this.sql) return;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS sliding_window_hits (
        subject TEXT NOT NULL,
        policy TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hits_lookup ON sliding_window_hits(subject, policy, timestamp);

      CREATE TABLE IF NOT EXISTS daily_quotas (
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, date)
      );
    `);
  }

  /**
   * Atomic sliding-window rate limit evaluation.
   */
  public rateLimit(
    subject: string,
    policy: string,
    limit: number,
    windowSeconds: number,
  ): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const reset = Math.ceil((now + windowSeconds * 1000) / 1000);

    if (this.sql) {
      // 1. Clean expired hits
      this.sql.exec(
        "DELETE FROM sliding_window_hits WHERE timestamp < ?",
        windowStart,
      );

      // 2. Count current hits in the sliding window
      const countResult = this.sql
        .exec(
          "SELECT COUNT(*) as count FROM sliding_window_hits WHERE subject = ? AND policy = ? AND timestamp >= ?",
          subject,
          policy,
          windowStart,
        )
        .toArray();

      const currentHits = countResult[0]?.count || 0;

      if (currentHits >= limit) {
        return {
          allowed: false,
          count: currentHits,
          remaining: 0,
          reset,
        };
      }

      // 3. Record new hit
      this.sql.exec(
        "INSERT INTO sliding_window_hits (subject, policy, timestamp) VALUES (?, ?, ?)",
        subject,
        policy,
        now,
      );

      return {
        allowed: true,
        count: currentHits + 1,
        remaining: Math.max(0, limit - (currentHits + 1)),
        reset,
      };
    }

    // In-Memory Fallback for test harness without native Workers SQLite
    const key = `${subject}:${policy}`;
    const hits = (this.memoryHits.get(key) || []).filter(
      (t) => t >= windowStart,
    );

    if (hits.length >= limit) {
      this.memoryHits.set(key, hits);
      return {
        allowed: false,
        count: hits.length,
        remaining: 0,
        reset,
      };
    }

    hits.push(now);
    this.memoryHits.set(key, hits);

    return {
      allowed: true,
      count: hits.length,
      remaining: Math.max(0, limit - hits.length),
      reset,
    };
  }

  /**
   * Checks or consumes the user's daily job quota.
   */
  public quota(userId: string, limit: number, consume = false): QuotaResult {
    const today = new Date().toISOString().substring(0, 10);
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);
    const reset = Math.ceil(endOfDay.getTime() / 1000);

    if (this.sql) {
      const rows = this.sql
        .exec(
          "SELECT count FROM daily_quotas WHERE user_id = ? AND date = ?",
          userId,
          today,
        )
        .toArray();

      const used = rows[0]?.count || 0;

      if (used >= limit) {
        return {
          allowed: false,
          used,
          remaining: 0,
          reset,
        };
      }

      if (consume) {
        this.sql.exec(
          `INSERT INTO daily_quotas (user_id, date, count) VALUES (?, ?, 1)
           ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1`,
          userId,
          today,
        );
        return {
          allowed: true,
          used: used + 1,
          remaining: Math.max(0, limit - (used + 1)),
          reset,
        };
      }

      return {
        allowed: true,
        used,
        remaining: Math.max(0, limit - used),
        reset,
      };
    }

    // In-memory fallback
    const key = `${userId}:${today}`;
    const used = this.memoryQuotas.get(key) || 0;

    if (used >= limit) {
      return {
        allowed: false,
        used,
        remaining: 0,
        reset,
      };
    }

    if (consume) {
      const newUsed = used + 1;
      this.memoryQuotas.set(key, newUsed);
      return {
        allowed: true,
        used: newUsed,
        remaining: Math.max(0, limit - newUsed),
        reset,
      };
    }

    return {
      allowed: true,
      used,
      remaining: Math.max(0, limit - used),
      reset,
    };
  }

  /**
   * HTTP endpoint handler for cross-worker RPC invocation.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/rate-limit") {
      const body = (await request.json()) as {
        subject: string;
        policy: string;
        limit: number;
        windowSeconds: number;
      };
      const result = this.rateLimit(
        body.subject,
        body.policy,
        body.limit,
        body.windowSeconds,
      );
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/quota/check") {
      const body = (await request.json()) as {
        userId: string;
        limit: number;
      };
      const result = this.quota(body.userId, body.limit, false);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/quota/consume") {
      const body = (await request.json()) as {
        userId: string;
        limit: number;
      };
      const result = this.quota(body.userId, body.limit, true);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}
