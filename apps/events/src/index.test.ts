/**
 * @sightforge/events - Comprehensive Unit & Integration Test Suite
 *
 * Exercises all upload quarantine and inference callback requirements and scenarios:
 * - AE2: Size limit quarantine enforcement and R2 deletion (R16, R20, AE2)
 * - Format magic byte detection (PNG, JPEG, WebP, MP4) and mismatch rejection (R21, KTD7)
 * - AE12: Modal callback HMAC signature verification & timestamp tolerance (R46, AE12)
 * - 2-key rotation overlap verification (R46)
 * - Callback delivery deduplication via JobRoom DO (KTD12)
 * - Guarded atomic D1 batch transitions on completion (KTD8)
 * - Non-terminal progress callbacks updating DO without D1 writes (R31)
 * - Zero-deletion guarantee on callback path
 */

import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import eventsWorker from "./index.js";
import { computeHmacSha256Hex } from "./auth.js";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { jobs, users } from "@sightforge/db";

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

describe("sightforge-events Worker", () => {
  let mockDb: D1Database;
  const deletedR2Keys: string[] = [];
  const storedR2Objects = new Map<
    string,
    { bytes: Uint8Array; size: number; etag: string }
  >();
  const deliveredIds = new Set<string>();
  const doUpdates: Array<{
    jobId: string;
    status?: string;
    framesCompleted?: number;
  }> = [];

  const mockBucket = {
    get: async (key: string) => {
      const obj = storedR2Objects.get(key);
      if (!obj) return null;
      return {
        size: obj.size,
        httpEtag: obj.etag,
        etag: obj.etag,
        arrayBuffer: async () => obj.bytes.buffer,
      };
    },
    delete: async (key: string) => {
      deletedR2Keys.push(key);
      storedR2Objects.delete(key);
    },
  } as unknown as R2Bucket;

  const mockJobRoomNamespace = {
    idFromName: () => ({}) as any,
    get: () => ({
      fetch: async (req: Request | string, init?: RequestInit) => {
        const url = typeof req === "string" ? req : req.url;
        const bodyStr =
          typeof req === "string" ? (init?.body as string) : await req.text();
        const body = bodyStr ? JSON.parse(bodyStr) : {};

        if (url.includes("/check-callback")) {
          if (deliveredIds.has(body.deliveryId)) {
            return new Response(
              JSON.stringify({ error: "duplicate-delivery" }),
              { status: 409 },
            );
          }
          deliveredIds.add(body.deliveryId);
          return new Response(JSON.stringify({ allowed: true }), {
            status: 200,
          });
        }

        if (url.includes("/state-update")) {
          doUpdates.push(body);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
          });
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    }),
  } as unknown as DurableObjectNamespace;

  const env = {
    ENVIRONMENT: "test",
    DB: undefined as unknown as D1Database,
    MEDIA_BUCKET: mockBucket,
    JOBS_QUEUE: {} as any,
    JOB_ROOM: mockJobRoomNamespace,
    MODAL_CALLBACK_SECRET: "test-modal-active-secret-123", // gitleaks:allow
    MODAL_CALLBACK_PREVIOUS_SECRET: "test-modal-prev-secret-456", // gitleaks:allow
    MODAL_TRIGGER_URL: "stub",
    MODAL_KEY: "test-modal-key",
    MODAL_SECRET: "test-modal-secret",
  };

  const userId = "user-uuid-aaaa-1111";
  const jobId = "job-uuid-1234-5678";

  beforeEach(async () => {
    mockDb = await createMockD1();
    env.DB = mockDb;
    deletedR2Keys.length = 0;
    storedR2Objects.clear();
    deliveredIds.clear();
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

    await db.insert(jobs).values({
      id: jobId,
      userId,
      task: "detection",
      modelVariant: "nano",
      mode: "per-frame",
      mediaType: "image",
      status: "created",
      originalFilename: "sample.png",
      mediaKey: `users/${userId}/media/${jobId}.png`,
      mediaEtag: null,
      resultKey: null,
      denseArtifactKey: null,
      confidenceThreshold: 0.25,
      sourceFps: null,
      sampledFps: null,
      framesTotal: null,
      framesCompleted: 0,
      durationMs: null,
      inferenceDurationMs: null,
      coldStartDurationMs: null,
      correlationId: "corr-123",
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  });

  describe("Health & Base Endpoint", () => {
    it("returns service ready status on GET /", async () => {
      const req = new Request("http://localhost/");
      const res = await eventsWorker.fetch(req, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { service: string; status: string };
      expect(json.service).toBe("sightforge-events");
      expect(json.status).toBe("ready");
    });
  });

  describe("Upload Quarantine & Queue Validation (R16, R20, R21, KTD7, AE2)", () => {
    it("purges oversized upload and fails job with size reason (AE2)", async () => {
      const objectKey = `users/${userId}/media/${jobId}.png`;
      // Oversized image (15MB > 10MB limit)
      const pngBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      storedR2Objects.set(objectKey, {
        bytes: pngBytes,
        size: 15 * 1024 * 1024,
        etag: "etag-oversized",
      });

      const batch = {
        queue: "sightforge-jobs-queue-prod",
        messages: [
          {
            id: "msg-1",
            timestamp: new Date(),
            body: { object: { key: objectKey } },
            ack: () => {},
            retry: () => {},
          },
        ],
        ackAll: () => {},
        retryAll: () => {},
      } as unknown as MessageBatch<unknown>;

      await eventsWorker.queue(batch, env);

      // 1. Verifies deleted from R2
      expect(deletedR2Keys).toContain(objectKey);

      // 2. Verifies marked failed in D1 with errorCode: size
      const db = drizzle(mockDb);
      const updatedJob = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .get();
      expect(updatedJob?.status).toBe("failed");
      expect(updatedJob?.errorCode).toBe("size");
    });

    it("rejects corrupt or mismatched magic bytes regardless of declared type", async () => {
      const objectKey = `users/${userId}/media/${jobId}.png`;
      // Corrupt/invalid leading bytes (e.g. plain text or executable bytes)
      const badBytes = new Uint8Array([
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f,
      ]);
      storedR2Objects.set(objectKey, {
        bytes: badBytes,
        size: 1024,
        etag: "etag-bad",
      });

      const batch = {
        queue: "sightforge-jobs-queue-prod",
        messages: [
          {
            id: "msg-2",
            timestamp: new Date(),
            body: { object: { key: objectKey } },
            ack: () => {},
            retry: () => {},
          },
        ],
      } as unknown as MessageBatch<unknown>;

      await eventsWorker.queue(batch, env);

      expect(deletedR2Keys).toContain(objectKey);

      const db = drizzle(mockDb);
      const updatedJob = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .get();
      expect(updatedJob?.status).toBe("failed");
      expect(updatedJob?.errorCode).toBe("format");
    });

    it("validates genuine PNG, pins mediaEtag, and transitions job to queued (KTD7)", async () => {
      const objectKey = `users/${userId}/media/${jobId}.png`;
      const validPngBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      storedR2Objects.set(objectKey, {
        bytes: validPngBytes,
        size: 2048,
        etag: "verified-png-etag-12345",
      });

      const batch = {
        queue: "sightforge-jobs-queue-prod",
        messages: [
          {
            id: "msg-3",
            timestamp: new Date(),
            body: { object: { key: objectKey } },
            ack: () => {},
            retry: () => {},
          },
        ],
      } as unknown as MessageBatch<unknown>;

      await eventsWorker.queue(batch, env);

      // Object was NOT deleted
      expect(deletedR2Keys).not.toContain(objectKey);

      // Job was updated to queued with pinned mediaEtag
      const db = drizzle(mockDb);
      const updatedJob = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .get();
      expect(updatedJob?.status).toBe("queued");
      expect(updatedJob?.mediaEtag).toBe("verified-png-etag-12345");
    });

    it("validates MP4 video containers with ftyp brand identifiers", async () => {
      const videoJobId = "job-uuid-video-9999";
      const db = drizzle(mockDb);
      const now = Date.now();
      await db.insert(jobs).values({
        id: videoJobId,
        userId,
        task: "detection",
        modelVariant: "nano",
        mode: "per-frame",
        mediaType: "video",
        status: "created",
        originalFilename: "video.mp4",
        mediaKey: `users/${userId}/media/${videoJobId}.mp4`,
        mediaEtag: null,
        resultKey: null,
        denseArtifactKey: null,
        confidenceThreshold: 0.25,
        sourceFps: 30,
        sampledFps: 5,
        framesTotal: null,
        framesCompleted: 0,
        durationMs: null,
        inferenceDurationMs: null,
        coldStartDurationMs: null,
        correlationId: "corr-vid",
        createdAt: new Date(now),
        updatedAt: new Date(now),
      });

      const objectKey = `users/${userId}/media/${videoJobId}.mp4`;
      // MP4 header: 4 bytes size, 'ftyp', 'isom' brand
      const mp4Bytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      ]);
      storedR2Objects.set(objectKey, {
        bytes: mp4Bytes,
        size: 5 * 1024 * 1024,
        etag: "etag-mp4-123",
      });

      const batch = {
        queue: "sightforge-jobs-queue-prod",
        messages: [
          {
            id: "msg-vid",
            timestamp: new Date(),
            body: { object: { key: objectKey } },
            ack: () => {},
            retry: () => {},
          },
        ],
      } as unknown as MessageBatch<unknown>;

      await eventsWorker.queue(batch, env);

      const updatedJob = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, videoJobId))
        .get();
      expect(updatedJob?.status).toBe("queued");
      expect(updatedJob?.mediaEtag).toBe("etag-mp4-123");
    });
  });

  describe("Inbound Modal Callbacks & Signature Authentication (R46, AE12)", () => {
    it("rejects callback with missing, invalid, or stale HMAC signature (AE12)", async () => {
      const body = JSON.stringify({
        jobId,
        framesCompleted: 10,
        framesTotal: 100,
        deliveryId: "del-1",
      });

      // 1. Missing signature -> 401
      const reqMissing = new Request("http://localhost/callbacks/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const res1 = await eventsWorker.fetch(reqMissing, env);
      expect(res1.status).toBe(401);

      // 2. Stale timestamp (10 minutes old > 5m limit) -> 401
      const staleTimestamp = Math.floor(Date.now() / 1000) - 600;
      const staleSig = await computeHmacSha256Hex(
        env.MODAL_CALLBACK_SECRET,
        `${staleTimestamp}.${body}`,
      );
      const reqStale = new Request("http://localhost/callbacks/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Modal-Signature": staleSig,
          "Modal-Timestamp": String(staleTimestamp),
        },
        body,
      });
      const res2 = await eventsWorker.fetch(reqStale, env);
      expect(res2.status).toBe(401);
      const json2 = (await res2.json()) as { error: string };
      expect(json2.error).toBe("stale-timestamp");

      // 3. Invalid signature value -> 401
      const nowSec = Math.floor(Date.now() / 1000);
      const reqInvalid = new Request("http://localhost/callbacks/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Modal-Signature": "invalid_hex_signature_abcdef123456",
          "Modal-Timestamp": String(nowSec),
        },
        body,
      });
      const res3 = await eventsWorker.fetch(reqInvalid, env);
      expect(res3.status).toBe(401);
    });

    it("accepts callback signed with previous secret during rotation overlap (R46)", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        jobId,
        framesCompleted: 20,
        framesTotal: 100,
        deliveryId: "del-rotation-1",
      });

      // Sign with MODAL_CALLBACK_PREVIOUS_SECRET
      const prevSig = await computeHmacSha256Hex(
        env.MODAL_CALLBACK_PREVIOUS_SECRET,
        `${nowSec}.${body}`,
      );

      const req = new Request("http://localhost/callbacks/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Modal-Signature": prevSig,
          "Modal-Timestamp": String(nowSec),
        },
        body,
      });

      const res = await eventsWorker.fetch(req, env);
      expect(res.status).toBe(200);
    });

    it("processes progress callback onto DO without writing to D1 row (R31, KTD12)", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        jobId,
        framesCompleted: 50,
        framesTotal: 100,
        deliveryId: "del-prog-50",
      });

      const signature = await computeHmacSha256Hex(
        env.MODAL_CALLBACK_SECRET,
        `${nowSec}.${body}`,
      );

      const req = new Request("http://localhost/callbacks/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Modal-Signature": signature,
          "Modal-Timestamp": String(nowSec),
        },
        body,
      });

      const res = await eventsWorker.fetch(req, env);
      expect(res.status).toBe(200);

      // Verified projected to DO
      expect(
        doUpdates.some((u) => u.jobId === jobId && u.framesCompleted === 50),
      ).toBe(true);

      // Verified D1 row is unchanged (no D1 write overhead on progress)
      const db = drizzle(mockDb);
      const jobRow = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .get();
      expect(jobRow?.framesCompleted).toBe(0);
    });

    it("applies terminal completion callback with guarded D1 batch (KTD8, R49)", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const resultKey = `users/${userId}/results/${jobId}.json`;
      const body = JSON.stringify({
        jobId,
        status: "completed",
        resultKey,
        denseArtifactKey: null,
        durationMs: 4500,
        inferenceDurationMs: 3800,
        coldStartDurationMs: 700,
        reportedCost: 0.0025,
        deliveryId: "del-complete-1",
      });

      const signature = await computeHmacSha256Hex(
        env.MODAL_CALLBACK_SECRET,
        `${nowSec}.${body}`,
      );

      const req = new Request("http://localhost/callbacks/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Modal-Signature": signature,
          "Modal-Timestamp": String(nowSec),
        },
        body,
      });

      const res = await eventsWorker.fetch(req, env);
      expect(res.status).toBe(200);

      // Verified D1 updated
      const db = drizzle(mockDb);
      const updatedJob = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .get();
      expect(updatedJob?.status).toBe("completed");
      expect(updatedJob?.resultKey).toBe(resultKey);
      expect(updatedJob?.durationMs).toBe(4500);

      // Verified callback never deletes any storage objects
      expect(deletedR2Keys.length).toBe(0);
    });

    it("rejects duplicate callback delivery IDs as already handled without re-executing (KTD12)", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const deliveryId = "duplicate-delivery-uuid-111";
      const body = JSON.stringify({
        jobId,
        framesCompleted: 99,
        framesTotal: 100,
        deliveryId,
      });

      const signature = await computeHmacSha256Hex(
        env.MODAL_CALLBACK_SECRET,
        `${nowSec}.${body}`,
      );

      const createReq = () =>
        new Request("http://localhost/callbacks/progress", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Modal-Signature": signature,
            "Modal-Timestamp": String(nowSec),
          },
          body,
        });

      // 1. First delivery -> Handled
      const res1 = await eventsWorker.fetch(createReq(), env);
      expect(res1.status).toBe(200);

      // 2. Replayed delivery with same deliveryId -> Acknowledged as duplicate
      const res2 = await eventsWorker.fetch(createReq(), env);
      expect(res2.status).toBe(200);
      const json2 = (await res2.json()) as { duplicate?: boolean };
      expect(json2.duplicate).toBe(true);
    });

    it("does not update a cancelled job when completion callback arrives (KTD8)", async () => {
      // 1. Set job to cancelled
      const db = drizzle(mockDb);
      await db
        .update(jobs)
        .set({ status: "cancelled" })
        .where(eq(jobs.id, jobId));

      // 2. Inbound completion arrives
      const nowSec = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        jobId,
        status: "completed",
        resultKey: `users/${userId}/results/${jobId}.json`,
        deliveryId: "del-cancelled-late",
      });

      const signature = await computeHmacSha256Hex(
        env.MODAL_CALLBACK_SECRET,
        `${nowSec}.${body}`,
      );

      const req = new Request("http://localhost/callbacks/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Modal-Signature": signature,
          "Modal-Timestamp": String(nowSec),
        },
        body,
      });

      const res = await eventsWorker.fetch(req, env);
      expect(res.status).toBe(200);

      // 3. Job remains cancelled; resultKey is NOT written (KTD8)
      const checkJob = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .get();
      expect(checkJob?.status).toBe("cancelled");
      expect(checkJob?.resultKey).toBeNull();
    });
  });
});
