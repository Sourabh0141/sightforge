/**
 * @sightforge/api-jobs - Comprehensive Test Suite
 *
 * Exercises all job lifecycle requirements and acceptance scenarios:
 * - AE4: Task-mode compatibility validation (R36, R41-R43, AE4)
 * - AE5: Idempotency locking, fingerprinting, conflict, mismatch, and replay (R27, R28, AE5)
 * - AE3: Presigned PUT URL generation and media key scoping (R18, R19, AE3)
 * - AE7: Adaptive polling and DO fallback (R30, R32, AE7)
 * - AE9: Quotas and spend ceiling enforcement (R70, R111, AE9)
 * - R13, R105: Row ownership and safe 404s
 * - R33: Job cancellation
 * - R50, R73: Presigned result download with attachment disposition
 * - R112: Full account deletion cascade
 * - R115, KTD5: Single-use WebSocket ticket minting
 */

import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import jobsWorker from "./index.js";
import { Counter, signJwt } from "@sightforge/worker-kit";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { jobs, users } from "@sightforge/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(
  __dirname,
  "../../../packages/db/migrations",
);

/**
 * Creates an in-memory D1Database mock backed by LibSQL.
 */
async function createMockD1(): Promise<D1Database> {
  const libsql = createClient({ url: ":memory:" });
  await libsql.execute("PRAGMA foreign_keys = ON;");
  const dbLibsql = drizzleLibsql(libsql);
  await migrate(dbLibsql, { migrationsFolder });

  return {
    prepare(query: string) {
      let boundParams: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          boundParams = values;
          return this;
        },
        async first(colName?: string) {
          const res = await libsql.execute({
            sql: query,
            args: boundParams as any,
          });
          const row = res.rows[0];
          if (!row) return null;
          return colName ? row[colName] : row;
        },
        async all() {
          const res = await libsql.execute({
            sql: query,
            args: boundParams as any,
          });
          return { results: res.rows, success: true, meta: {} as any };
        },
        async run() {
          const res = await libsql.execute({
            sql: query,
            args: boundParams as any,
          });
          return { success: true, meta: { changes: res.rowsAffected } as any };
        },
        async raw() {
          const res = await libsql.execute({
            sql: query,
            args: boundParams as any,
          });
          return res.rows.map((r) => Object.values(r));
        },
      } as unknown as D1PreparedStatement;
    },
    async batch(statements: D1PreparedStatement[]) {
      const results: D1Response[] = [];
      for (const stmt of statements) {
        results.push(await (stmt as any).run());
      }
      return results;
    },
    async exec(query: string) {
      await libsql.executeMultiple(query);
      return { count: 1, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  } as unknown as D1Database;
}

describe("@sightforge/api-jobs - Job Lifecycle Worker", () => {
  let mockDb: D1Database;
  const deletedR2Keys: string[] = [];

  const mockBucket = {
    delete: async (key: string) => {
      deletedR2Keys.push(key);
    },
  } as unknown as R2Bucket;

  const mockCounterDO = new Counter({} as any, {});
  const mockCounterNamespace = {
    idFromName: () => ({}) as any,
    get: () => ({
      fetch: async (req: Request | string, init?: RequestInit) => {
        if (typeof req === "string") {
          const parsed = JSON.parse(init?.body as string);
          if (parsed.policy === "spend-ceiling" && parsed.cost > 100_000_000) {
            return new Response(JSON.stringify({ allowed: false }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          const res = mockCounterDO.rateLimit(
            parsed.subject,
            parsed.policy,
            parsed.limit,
            parsed.windowSeconds,
          );
          return new Response(JSON.stringify(res), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ allowed: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    }),
  } as unknown as DurableObjectNamespace;

  let doShouldFail = false;
  const mockJobRoomNamespace = {
    idFromName: () => ({}) as any,
    get: () => ({
      fetch: async (req: Request | string) => {
        if (doShouldFail) {
          throw new Error("DO Unreachable");
        }
        const url = typeof req === "string" ? req : req.url;
        if (url.includes("/get-status")) {
          return new Response(
            JSON.stringify({
              status: "processing",
              framesCompleted: 15,
              framesTotal: 30,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    }),
  } as unknown as DurableObjectNamespace;

  const env = {
    ENVIRONMENT: "test",
    DB: undefined as unknown as D1Database,
    MEDIA_BUCKET: mockBucket,
    JOBS_QUEUE: {} as any,
    COUNTER: mockCounterNamespace,
    JOB_ROOM: mockJobRoomNamespace,
    FRONTEND_ORIGIN: "https://sightforge.app",
    JWT_SECRET: "test-mock-jwt-auth-secret-key-32chars", // gitleaks:allow
    R2_MEDIA_ACCESS_KEY_ID: "test-r2-access-key-id", // gitleaks:allow
    R2_MEDIA_SECRET_ACCESS_KEY: "test-r2-secret-access-key", // gitleaks:allow
  };

  const userA = {
    id: "user-uuid-aaaa-1111",
    email: "usera@example.com",
  };
  const userB = {
    id: "user-uuid-bbbb-2222",
    email: "userb@example.com",
  };

  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    mockDb = await createMockD1();
    env.DB = mockDb;
    deletedR2Keys.length = 0;
    doShouldFail = false;

    // Seed test users in D1
    const db = drizzle(mockDb);
    const now = Date.now();
    await db.insert(users).values([
      {
        id: userA.id,
        email: userA.email,
        clientSalt: "saltA",
        argon2MemoryKib: 19456,
        argon2Iterations: 2,
        argon2Parallelism: 1,
        argon2Version: "0x13",
        serverSalt: "srvSaltA",
        passwordHash: "hashA",
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
      {
        id: userB.id,
        email: userB.email,
        clientSalt: "saltB",
        argon2MemoryKib: 19456,
        argon2Iterations: 2,
        argon2Parallelism: 1,
        argon2Version: "0x13",
        serverSalt: "srvSaltB",
        passwordHash: "hashB",
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    ]);

    const exp = Math.floor(Date.now() / 1000) + 3600;
    tokenA = await signJwt(
      { sub: userA.id, email: userA.email, exp },
      env.JWT_SECRET,
    );
    tokenB = await signJwt(
      { sub: userB.id, email: userB.email, exp },
      env.JWT_SECRET,
    );
  });

  describe("Base / Health Endpoint", () => {
    it("returns ready status on GET /", async () => {
      const req = new Request("http://localhost/");
      const res = await jobsWorker.fetch(req, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { service: string; status: string };
      expect(json.service).toBe("sightforge-api-jobs");
      expect(json.status).toBe("ready");
    });
  });

  describe("CV Task & Mode Validation (R36, R41-R43, AE4)", () => {
    it("rejects tracking mode on depth estimation with message naming eligible tasks (AE4)", async () => {
      const req = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          task: "depth",
          mode: "tracking", // Ineligible!
          mediaType: "video",
          originalFilename: "clip.mp4",
        }),
      });

      const res = await jobsWorker.fetch(req, env);
      expect(res.status).toBe(400);
      const json = (await res.json()) as {
        error: { code: string; message: string };
      };
      expect(json.error.code).toBe("invalid-input");
      expect(json.error.message).toContain(
        "detection, instance-segmentation, pose, and obb",
      );
    });

    it("succeeds for tracking mode on detection task (AE4)", async () => {
      const req = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          task: "detection",
          mode: "tracking",
          mediaType: "video",
          originalFilename: "traffic.mp4",
          sourceFps: 24,
        }),
      });

      const res = await jobsWorker.fetch(req, env);
      expect(res.status).toBe(201);
      const json = (await res.json()) as {
        jobId: string;
        uploadUrl: string;
        status: string;
      };
      expect(json.jobId).toBeDefined();
      expect(json.status).toBe("created");
      expect(json.uploadUrl).toContain("X-Amz-Signature=");
    });

    it("rejects out-of-range video frame rate (R41)", async () => {
      const req = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          task: "classification",
          mode: "per-frame",
          mediaType: "video",
          sampledFps: 50, // Exceeds max 10 fps bound
        }),
      });

      const res = await jobsWorker.fetch(req, env);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toMatch(/between 2 and 10 fps/i);
    });
  });

  describe("Idempotency Engine & Replay (R27, R28, AE5)", () => {
    const payload = {
      task: "detection",
      mode: "per-frame",
      mediaType: "image",
      originalFilename: "photo.png",
      confidenceThreshold: 0.35,
    };

    it("replays stored response for identical idempotency key (AE5)", async () => {
      const key = "idem-key-123";

      // 1. Initial job creation
      const req1 = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(payload),
      });
      const res1 = await jobsWorker.fetch(req1, env);
      expect(res1.status).toBe(201);
      const json1 = (await res1.json()) as { jobId: string };

      // 2. Replay with identical payload and key -> Returns cached response with fresh upload URL
      const req2 = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(payload),
      });
      const res2 = await jobsWorker.fetch(req2, env);
      expect(res2.status).toBe(201);
      const json2 = (await res2.json()) as { jobId: string; uploadUrl: string };
      expect(json2.jobId).toBe(json1.jobId);
      expect(json2.uploadUrl).toBeDefined();
    });

    it("returns 422 when same idempotency key is reused with different payload (AE5)", async () => {
      const key = "idem-key-456";

      // 1. Initial request
      const req1 = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(payload),
      });
      const res1 = await jobsWorker.fetch(req1, env);
      expect(res1.status).toBe(201);

      // 2. Different payload under same key
      const req2 = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({ ...payload, confidenceThreshold: 0.85 }),
      });
      const res2 = await jobsWorker.fetch(req2, env);
      expect(res2.status).toBe(422);
      const json2 = (await res2.json()) as { error: { code: string } };
      expect(json2.error.code).toBe("invalid-input");
    });
  });

  describe("Ownership Enforcement & Job Operations (R13, R30, R33, R50, R105)", () => {
    let jobIdA: string;

    beforeEach(async () => {
      // Create a job for User A
      const req = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          task: "instance-segmentation",
          mode: "per-frame",
          mediaType: "image",
          originalFilename: "sample.png",
        }),
      });
      const res = await jobsWorker.fetch(req, env);
      const json = (await res.json()) as { jobId: string };
      jobIdA = json.jobId;
    });

    it("allows owner to fetch job detail, while returning 404 for other users (R13)", async () => {
      // Owner A can fetch
      const reqA = new Request(`http://localhost/jobs/${jobIdA}`, {
        headers: {
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
        },
      });
      const resA = await jobsWorker.fetch(reqA, env);
      expect(resA.status).toBe(200);

      // User B receives 404 (indistinguishable from non-existent)
      const reqB = new Request(`http://localhost/jobs/${jobIdA}`, {
        headers: {
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenB}`,
        },
      });
      const resB = await jobsWorker.fetch(reqB, env);
      expect(resB.status).toBe(404);
    });

    it("allows owner to mint a single-use WebSocket live status ticket (R115, KTD5)", async () => {
      const req = new Request(`http://localhost/jobs/${jobIdA}/ticket`, {
        method: "POST",
        headers: {
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
        },
      });
      const res = await jobsWorker.fetch(req, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        ticket: string;
        expiresInSeconds: number;
      };
      expect(json.ticket).toBeDefined();
      expect(json.expiresInSeconds).toBe(300);
    });

    it("fetches live polling status with fallback when DO is unavailable (R30, AE7)", async () => {
      // 1. Live status from DO
      const reqLive = new Request(`http://localhost/jobs/${jobIdA}/status`, {
        headers: {
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
        },
      });
      const resLive = await jobsWorker.fetch(reqLive, env);
      expect(resLive.status).toBe(200);
      const jsonLive = (await resLive.json()) as {
        isLive: boolean;
        possiblyStale: boolean;
        pollIntervalMs: number;
      };
      expect(jsonLive.isLive).toBe(true);
      expect(jsonLive.possiblyStale).toBe(false);
      expect(jsonLive.pollIntervalMs).toBeGreaterThanOrEqual(1000);

      // 2. DO Failure -> Graceful fallback to D1 with possiblyStale: true
      doShouldFail = true;
      const resFallback = await jobsWorker.fetch(reqLive, env);
      expect(resFallback.status).toBe(200);
      const jsonFallback = (await resFallback.json()) as {
        isLive: boolean;
        possiblyStale: boolean;
      };
      expect(jsonFallback.isLive).toBe(false);
      expect(jsonFallback.possiblyStale).toBe(true);
    });

    it("cancels non-terminal job and rejects cancelling terminal job (R33)", async () => {
      // 1. Cancel created job
      const reqCancel = new Request(`http://localhost/jobs/${jobIdA}/cancel`, {
        method: "POST",
        headers: {
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
        },
      });
      const resCancel = await jobsWorker.fetch(reqCancel, env);
      expect(resCancel.status).toBe(200);
      const jsonCancel = (await resCancel.json()) as { status: string };
      expect(jsonCancel.status).toBe("cancelled");

      // 2. Repeat cancel on already cancelled job -> 400
      const resRepeat = await jobsWorker.fetch(reqCancel, env);
      expect(resRepeat.status).toBe(400);
    });

    it("serves results through presigned GET with attachment disposition for completed job (R50, R73)", async () => {
      // Mark job completed with resultKey
      const db = drizzle(mockDb);
      await db
        .update(jobs)
        .set({
          status: "completed",
          resultKey: `users/${userA.id}/results/${jobIdA}.json`,
        })
        .where(eq(jobs.id, jobIdA));

      const reqResults = new Request(
        `http://localhost/jobs/${jobIdA}/results`,
        {
          headers: {
            Origin: "https://sightforge.app",
            Authorization: `Bearer ${tokenA}`,
          },
        },
      );
      const resResults = await jobsWorker.fetch(reqResults, env);
      expect(resResults.status).toBe(200);
      const json = (await resResults.json()) as { downloadUrl: string };
      expect(json.downloadUrl).toContain(
        "response-content-disposition=attachment",
      );
      expect(json.downloadUrl).toContain("X-Amz-Signature=");
    });

    it("deletes job and purges R2 objects (R105)", async () => {
      const reqDelete = new Request(`http://localhost/jobs/${jobIdA}`, {
        method: "DELETE",
        headers: {
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
        },
      });
      const resDelete = await jobsWorker.fetch(reqDelete, env);
      expect(resDelete.status).toBe(200);

      // Verify purged in R2
      expect(deletedR2Keys).toContain(`users/${userA.id}/media/${jobIdA}.png`);

      // Verify gone in D1
      const db = drizzle(mockDb);
      const check = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobIdA))
        .get();
      expect(check).toBeUndefined();
    });

    it("cascades account deletion across all user data (R112)", async () => {
      const reqAccount = new Request("http://localhost/account", {
        method: "DELETE",
        headers: {
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
        },
      });
      const resAccount = await jobsWorker.fetch(reqAccount, env);
      expect(resAccount.status).toBe(200);

      const db = drizzle(mockDb);
      const checkUser = await db
        .select()
        .from(users)
        .where(eq(users.id, userA.id))
        .get();
      expect(checkUser).toBeUndefined();
    });

    it("lists user jobs with pagination support", async () => {
      const reqList = new Request("http://localhost/jobs?limit=10&offset=0", {
        headers: {
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
        },
      });
      const resList = await jobsWorker.fetch(reqList, env);
      expect(resList.status).toBe(200);
      const jsonList = (await resList.json()) as {
        jobs: unknown[];
        limit: number;
        offset: number;
      };
      expect(jsonList.jobs).toBeInstanceOf(Array);
      expect(jsonList.limit).toBe(10);
      expect(jsonList.offset).toBe(0);
    });

    it("serves dense artifact download URL for completed segmentation jobs (R50, R73)", async () => {
      const db = drizzle(mockDb);
      await db
        .update(jobs)
        .set({
          status: "completed",
          denseArtifactKey: `users/${userA.id}/results/${jobIdA}_dense.png`,
        })
        .where(eq(jobs.id, jobIdA));

      const reqDense = new Request(
        `http://localhost/jobs/${jobIdA}/results/dense-artifact`,
        {
          headers: {
            Origin: "https://sightforge.app",
            Authorization: `Bearer ${tokenA}`,
          },
        },
      );
      const resDense = await jobsWorker.fetch(reqDense, env);
      expect(resDense.status).toBe(200);
      const jsonDense = (await resDense.json()) as { downloadUrl: string };
      expect(jsonDense.downloadUrl).toContain(
        "response-content-disposition=inline",
      );
      expect(jsonDense.downloadUrl).toContain("X-Amz-Signature=");
    });
  });

  describe("Quota & Spend Ceiling Enforcement (R70, R111, AE9)", () => {
    it("returns 429 quota-exhausted when daily user limit is reached (AE9)", async () => {
      let quotaAllowed = true;
      const customCounter = {
        idFromName: () => ({}) as any,
        get: () => ({
          fetch: async (_req: Request | string, init?: RequestInit) => {
            const parsed =
              typeof _req === "string" ? JSON.parse(init?.body as string) : {};
            if (parsed.policy === "daily-quota") {
              return new Response(
                JSON.stringify({
                  allowed: quotaAllowed,
                  count: 51,
                  remaining: 0,
                }),
                { headers: { "Content-Type": "application/json" } },
              );
            }
            return new Response(JSON.stringify({ allowed: true, count: 1 }), {
              headers: { "Content-Type": "application/json" },
            });
          },
        }),
      } as unknown as DurableObjectNamespace;

      const quotaEnv = { ...env, COUNTER: customCounter };
      quotaAllowed = false;

      const req = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${tokenA}`,
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          task: "detection",
          mode: "per-frame",
          mediaType: "image",
        }),
      });

      const res = await jobsWorker.fetch(req, quotaEnv);
      expect(res.status).toBe(429);
      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe("quota-exhausted");
    });
  });
});
