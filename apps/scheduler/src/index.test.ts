/**
 * @sightforge/scheduler - Scheduled Maintenance Test Suite
 *
 * Exercises all retention and sweeper requirements:
 * - AE8: Stuck job timeout failure and DO projection (R103, AE8)
 * - R100: Completed input media retention (7 days)
 * - R101: Failed input media retention (14 days)
 * - R102: Completed result documents and dense masks retention (30 days)
 * - R104: Quarantined upload reconciliation (24 hours)
 * - Cancelled job late results reclamation
 * - Auth and idempotency records hygiene (R9, R27)
 * - R112: Account deletion backstop
 * - Fault isolation across sweeps
 */

import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import schedulerWorker, { runAllMaintenanceSweeps } from "./index.js";
import {
  sweepStuckJobs,
  sweepCompletedMedia,
  sweepFailedMedia,
  sweepCompletedResults,
  sweepQuarantinedUploads,
  sweepCancelledResults,
  sweepAuthAndIdempotency,
  sweepAccountDeletionBackstop,
} from "./sweepers.js";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { jobs, users, refreshTokens, idempotencyKeys } from "@sightforge/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(
  __dirname,
  "../../../packages/db/migrations",
);

/**
 * Creates in-memory D1 database mock.
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

describe("sightforge-scheduler Worker", () => {
  let mockDb: D1Database;
  const deletedR2Keys: string[] = [];
  const doUpdates: Array<{
    jobId: string;
    status?: string;
    errorCode?: string;
  }> = [];

  const mockBucket = {
    delete: async (key: string) => {
      deletedR2Keys.push(key);
    },
  } as unknown as R2Bucket;

  const mockJobRoomNamespace = {
    idFromName: () => ({}) as any,
    get: () => ({
      fetch: async (req: Request | string, init?: RequestInit) => {
        const bodyStr =
          typeof req === "string" ? (init?.body as string) : await req.text();
        const body = bodyStr ? JSON.parse(bodyStr) : {};
        doUpdates.push(body);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      },
    }),
  } as unknown as DurableObjectNamespace;

  const env = {
    ENVIRONMENT: "test",
    DB: undefined as unknown as D1Database,
    MEDIA_BUCKET: mockBucket,
    JOB_ROOM: mockJobRoomNamespace,
  };

  const userId = "user-uuid-aaaa-1111";

  beforeEach(async () => {
    mockDb = await createMockD1();
    env.DB = mockDb;
    deletedR2Keys.length = 0;
    doUpdates.length = 0;

    const db = drizzle(mockDb);
    const now = Date.now();

    await db.insert(users).values({
      id: userId,
      email: "tester@example.com",
      clientSalt: "salt1",
      argon2MemoryKib: 19456,
      argon2Iterations: 2,
      argon2Parallelism: 1,
      argon2Version: "0x13",
      serverSalt: "srv1",
      passwordHash: "hash1",
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  });

  describe("Health & Trigger Endpoints", () => {
    it("responds with ready status on GET /", async () => {
      const req = new Request("http://localhost/");
      const res = await schedulerWorker.fetch(req, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { service: string; status: string };
      expect(json.service).toBe("sightforge-scheduler");
      expect(json.status).toBe("ready");
    });

    it("runs sweeps via scheduled cron event", async () => {
      const event = {
        cron: "*/15 * * * *",
        scheduledTime: Date.now(),
        type: "scheduled",
      } as ScheduledEvent;

      await expect(
        schedulerWorker.scheduled(event, env),
      ).resolves.toBeUndefined();
    });
  });

  describe("Stuck Job Timeout Sweep (R103, AE8)", () => {
    it("fails stuck processing job and projects failure to JobRoom DO (AE8)", async () => {
      const db = drizzle(mockDb);
      const stuckJobId = "job-stuck-123";
      const sixMinutesAgo = Date.now() - 6 * 60_000;

      await db.insert(jobs).values({
        id: stuckJobId,
        userId,
        task: "detection",
        modelVariant: "nano",
        mode: "per-frame",
        mediaType: "video",
        status: "processing",
        mediaKey: `users/${userId}/media/${stuckJobId}.mp4`,
        correlationId: "corr-stuck",
        createdAt: new Date(sixMinutesAgo),
        updatedAt: new Date(sixMinutesAgo),
      });

      const summary = await sweepStuckJobs(env, 10, 300_000, Date.now());
      expect(summary.success).toBe(true);
      expect(summary.itemsProcessed).toBe(1);

      // Verified D1 row is marked failed with timeout code
      const updated = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, stuckJobId))
        .get();
      expect(updated?.status).toBe("failed");
      expect(updated?.errorCode).toBe("timeout");

      // Verified projected to JobRoom DO
      expect(
        doUpdates.some(
          (u) =>
            u.jobId === stuckJobId &&
            u.status === "failed" &&
            u.errorCode === "timeout",
        ),
      ).toBe(true);
    });
  });

  describe("Completed & Failed Media Retention (R100, R101)", () => {
    it("deletes completed job media older than 7 days and nullifies mediaKey (R100)", async () => {
      const db = drizzle(mockDb);
      const oldJobId = "job-completed-old-8d";
      const freshJobId = "job-completed-fresh-3d";

      const eightDaysAgo = Date.now() - 8 * 86_400_000;
      const threeDaysAgo = Date.now() - 3 * 86_400_000;

      await db.insert(jobs).values([
        {
          id: oldJobId,
          userId,
          task: "detection",
          modelVariant: "nano",
          mode: "per-frame",
          mediaType: "image",
          status: "completed",
          mediaKey: `users/${userId}/media/${oldJobId}.png`,
          resultKey: `users/${userId}/results/${oldJobId}.json`,
          correlationId: "corr-old",
          createdAt: new Date(eightDaysAgo),
          updatedAt: new Date(eightDaysAgo),
        },
        {
          id: freshJobId,
          userId,
          task: "detection",
          modelVariant: "nano",
          mode: "per-frame",
          mediaType: "image",
          status: "completed",
          mediaKey: `users/${userId}/media/${freshJobId}.png`,
          resultKey: `users/${userId}/results/${freshJobId}.json`,
          correlationId: "corr-fresh",
          createdAt: new Date(threeDaysAgo),
          updatedAt: new Date(threeDaysAgo),
        },
      ]);

      const summary = await sweepCompletedMedia(env, 10, 7, Date.now());
      expect(summary.success).toBe(true);
      expect(summary.itemsProcessed).toBe(1);

      // 8-day old media deleted from R2
      expect(deletedR2Keys).toContain(`users/${userId}/media/${oldJobId}.png`);
      // 3-day fresh media preserved
      expect(deletedR2Keys).not.toContain(
        `users/${userId}/media/${freshJobId}.png`,
      );

      // D1 row updated (mediaKey nullified, resultKey preserved)
      const oldJob = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, oldJobId))
        .get();
      expect(oldJob?.mediaKey).toBeNull();
      expect(oldJob?.resultKey).toBe(
        `users/${userId}/results/${oldJobId}.json`,
      );
    });

    it("deletes failed job media older than 14 days and preserves younger failed media (R101)", async () => {
      const db = drizzle(mockDb);
      const oldFailedId = "job-failed-old-15d";
      const freshFailedId = "job-failed-fresh-5d";

      const fifteenDaysAgo = Date.now() - 15 * 86_400_000;
      const fiveDaysAgo = Date.now() - 5 * 86_400_000;

      await db.insert(jobs).values([
        {
          id: oldFailedId,
          userId,
          task: "detection",
          modelVariant: "nano",
          mode: "per-frame",
          mediaType: "image",
          status: "failed",
          mediaKey: `users/${userId}/media/${oldFailedId}.png`,
          correlationId: "corr-fail-old",
          createdAt: new Date(fifteenDaysAgo),
          updatedAt: new Date(fifteenDaysAgo),
        },
        {
          id: freshFailedId,
          userId,
          task: "detection",
          modelVariant: "nano",
          mode: "per-frame",
          mediaType: "image",
          status: "failed",
          mediaKey: `users/${userId}/media/${freshFailedId}.png`,
          correlationId: "corr-fail-fresh",
          createdAt: new Date(fiveDaysAgo),
          updatedAt: new Date(fiveDaysAgo),
        },
      ]);

      const summary = await sweepFailedMedia(env, 10, 14, Date.now());
      expect(summary.success).toBe(true);
      expect(summary.itemsProcessed).toBe(1);

      expect(deletedR2Keys).toContain(
        `users/${userId}/media/${oldFailedId}.png`,
      );
      expect(deletedR2Keys).not.toContain(
        `users/${userId}/media/${freshFailedId}.png`,
      );
    });
  });

  describe("Completed Results Retention (R102)", () => {
    it("deletes result documents and dense masks older than 30 days while preserving job row (R102)", async () => {
      const db = drizzle(mockDb);
      const oldJobId = "job-results-old-35d";
      const thirtyFiveDaysAgo = Date.now() - 35 * 86_400_000;

      await db.insert(jobs).values({
        id: oldJobId,
        userId,
        task: "instance-segmentation",
        modelVariant: "nano",
        mode: "per-frame",
        mediaType: "image",
        status: "completed",
        mediaKey: null,
        resultKey: `users/${userId}/results/${oldJobId}.json`,
        denseArtifactKey: `users/${userId}/dense/${oldJobId}.png`,
        correlationId: "corr-res-old",
        createdAt: new Date(thirtyFiveDaysAgo),
        updatedAt: new Date(thirtyFiveDaysAgo),
      });

      const summary = await sweepCompletedResults(env, 10, 30, Date.now());
      expect(summary.success).toBe(true);
      expect(summary.itemsProcessed).toBe(1);

      expect(deletedR2Keys).toContain(
        `users/${userId}/results/${oldJobId}.json`,
      );
      expect(deletedR2Keys).toContain(`users/${userId}/dense/${oldJobId}.png`);

      const jobRow = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, oldJobId))
        .get();
      expect(jobRow?.resultKey).toBeNull();
      expect(jobRow?.denseArtifactKey).toBeNull();
      expect(jobRow?.status).toBe("completed");
    });
  });

  describe("Quarantined Uploads Reconciler (R104)", () => {
    it("fails quarantined uploads in created state older than 24h and deletes R2 media (R104)", async () => {
      const db = drizzle(mockDb);
      const staleQuarantineId = "job-quarantine-26h";
      const twentySixHoursAgo = Date.now() - 26 * 3600_000;

      await db.insert(jobs).values({
        id: staleQuarantineId,
        userId,
        task: "detection",
        modelVariant: "nano",
        mode: "per-frame",
        mediaType: "image",
        status: "created",
        mediaKey: `users/${userId}/media/${staleQuarantineId}.png`,
        correlationId: "corr-quarantine",
        createdAt: new Date(twentySixHoursAgo),
        updatedAt: new Date(twentySixHoursAgo),
      });

      const summary = await sweepQuarantinedUploads(env, 10, 24, Date.now());
      expect(summary.success).toBe(true);
      expect(summary.itemsProcessed).toBe(1);

      expect(deletedR2Keys).toContain(
        `users/${userId}/media/${staleQuarantineId}.png`,
      );

      const updated = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, staleQuarantineId))
        .get();
      expect(updated?.status).toBe("failed");
      expect(updated?.errorCode).toBe("timeout");
    });
  });

  describe("Cancelled Job Results Reclaimer", () => {
    it("deletes result objects for cancelled jobs", async () => {
      const db = drizzle(mockDb);
      const cancelledId = "job-cancelled-late-result";

      await db.insert(jobs).values({
        id: cancelledId,
        userId,
        task: "detection",
        modelVariant: "nano",
        mode: "per-frame",
        mediaType: "image",
        status: "cancelled",
        resultKey: `users/${userId}/results/${cancelledId}.json`,
        denseArtifactKey: `users/${userId}/dense/${cancelledId}.png`,
        correlationId: "corr-cancelled",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const summary = await sweepCancelledResults(env, 10, Date.now());
      expect(summary.success).toBe(true);
      expect(summary.itemsProcessed).toBe(1);

      expect(deletedR2Keys).toContain(
        `users/${userId}/results/${cancelledId}.json`,
      );
      expect(deletedR2Keys).toContain(
        `users/${userId}/dense/${cancelledId}.png`,
      );
    });
  });

  describe("Auth & Idempotency Hygiene (R9, R27)", () => {
    it("reaps expired refresh tokens and expired idempotency keys", async () => {
      const db = drizzle(mockDb);
      const now = Date.now();
      const pastTime = new Date(now - 10_000);

      await db.insert(refreshTokens).values({
        id: "tok-expired",
        userId,
        hashedToken: "hash-tok-exp",
        familyId: "fam-1",
        isConsumed: false,
        expiresAt: pastTime,
        familyExpiresAt: new Date(now + 60_000),
        createdAt: pastTime,
      });

      await db.insert(idempotencyKeys).values({
        id: "idem-expired",
        userId,
        key: "key-exp",
        requestFingerprint: "fp123",
        lockedUntil: pastTime,
        createdAt: pastTime,
      });

      const summary = await sweepAuthAndIdempotency(env, now);
      expect(summary.success).toBe(true);

      const remainingTokens = await db.select().from(refreshTokens).all();
      expect(remainingTokens.length).toBe(0);

      const remainingIdem = await db.select().from(idempotencyKeys).all();
      expect(remainingIdem.length).toBe(0);
    });
  });

  describe("Account Deletion Backstop (R112)", () => {
    it("reclaims orphaned jobs and media for users no longer in database", async () => {
      const db = drizzle(mockDb);
      const orphanedUserId = "deleted-user-uuid-9999";
      const orphanedJobId = "job-orphaned-user-1";

      // 1. Insert user and job
      await db.insert(users).values({
        id: orphanedUserId,
        email: "to-delete@example.com",
        clientSalt: "s",
        argon2MemoryKib: 19456,
        argon2Iterations: 2,
        argon2Parallelism: 1,
        argon2Version: "0x13",
        serverSalt: "ss",
        passwordHash: "ph",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(jobs).values({
        id: orphanedJobId,
        userId: orphanedUserId,
        task: "detection",
        modelVariant: "nano",
        mode: "per-frame",
        mediaType: "image",
        status: "completed",
        mediaKey: `users/${orphanedUserId}/media/${orphanedJobId}.png`,
        resultKey: `users/${orphanedUserId}/results/${orphanedJobId}.json`,
        correlationId: "corr-orphan",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Delete user with FK disabled to simulate orphaned state
      await mockDb.exec("PRAGMA foreign_keys = OFF;");
      await db.delete(users).where(eq(users.id, orphanedUserId));
      await mockDb.exec("PRAGMA foreign_keys = ON;");

      const summary = await sweepAccountDeletionBackstop(env, 10);
      expect(summary.success).toBe(true);
      expect(summary.itemsProcessed).toBe(1);

      expect(deletedR2Keys).toContain(
        `users/${orphanedUserId}/media/${orphanedJobId}.png`,
      );
      expect(deletedR2Keys).toContain(
        `users/${orphanedUserId}/results/${orphanedJobId}.json`,
      );

      const remaining = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, orphanedJobId))
        .get();
      expect(remaining).toBeUndefined();
    });
  });

  describe("Fault Isolation & Diagnostics", () => {
    it("runs all sweeps via runAllMaintenanceSweeps", async () => {
      const summaries = await runAllMaintenanceSweeps(env, Date.now());
      expect(summaries.length).toBe(8);
      expect(summaries.every((s) => s.success)).toBe(true);
    });
  });
});
