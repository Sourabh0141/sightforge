import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DB_PACKAGE_VERSION,
  idempotencyKeys,
  JOB_STATUSES,
  JobStatus,
  jobs,
  MEDIA_TYPES,
  PROCESSING_MODES,
  refreshTokens,
  schemaVersion,
  users,
  VISION_TASKS,
  VisionTask,
} from "./index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, "../migrations");

async function createTestDatabase() {
  const client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON;");
  const db = drizzle(client);
  return { client, db };
}

describe("@sightforge/db - Package & Schema Verification", () => {
  it("exports db package version and schema version", () => {
    expect(DB_PACKAGE_VERSION).toBe("0.1.0");
    expect(schemaVersion).toBe("1.0.0");
    expect(VISION_TASKS).toHaveLength(7);
    expect(JOB_STATUSES).toHaveLength(7);
    expect(PROCESSING_MODES).toHaveLength(2);
    expect(MEDIA_TYPES).toHaveLength(2);
  });

  it("applies migrations cleanly to an empty database and is idempotent on re-run", async () => {
    const { client, db } = await createTestDatabase();

    // 1. Initial migration run
    await expect(migrate(db, { migrationsFolder })).resolves.not.toThrow();

    // Verify all 4 tables exist in sqlite_master
    const tablesResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
    );
    const tableNames = tablesResult.rows.map((row) => row.name as string);
    expect(tableNames).toEqual([
      "idempotency_keys",
      "jobs",
      "refresh_tokens",
      "users",
    ]);

    // 2. Idempotent re-run
    await expect(migrate(db, { migrationsFolder })).resolves.not.toThrow();
  });

  it("verifies all expected indexes exist after migration", async () => {
    const { client, db } = await createTestDatabase();
    await migrate(db, { migrationsFolder });

    const indexesResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const indexNames = indexesResult.rows.map((row) => row.name as string);

    expect(indexNames).toContain("users_email_idx");
    expect(indexNames).toContain("refresh_tokens_hashed_token_idx");
    expect(indexNames).toContain("refresh_tokens_family_id_idx");
    expect(indexNames).toContain("refresh_tokens_user_id_idx");
    expect(indexNames).toContain("refresh_tokens_expires_at_idx");
    expect(indexNames).toContain("jobs_user_id_created_at_idx");
    expect(indexNames).toContain("jobs_status_created_at_idx");
    expect(indexNames).toContain("jobs_correlation_id_idx");
    expect(indexNames).toContain("idempotency_user_key_idx");
    expect(indexNames).toContain("idempotency_locked_until_idx");
  });

  it("Covers AE5: enforces unique idempotency key per user while allowing same key for different users", async () => {
    const { db } = await createTestDatabase();
    await migrate(db, { migrationsFolder });

    const now = new Date();

    // Seed two distinct users
    await db.insert(users).values([
      {
        id: "user-1",
        email: "alice@example.com",
        clientSalt: "salt-alice",
        argon2MemoryKib: 19456,
        argon2Iterations: 2,
        argon2Parallelism: 1,
        argon2Version: "0x13",
        serverSalt: "srv-salt-alice",
        passwordHash: "hash-alice",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "user-2",
        email: "bob@example.com",
        clientSalt: "salt-bob",
        argon2MemoryKib: 19456,
        argon2Iterations: 2,
        argon2Parallelism: 1,
        argon2Version: "0x13",
        serverSalt: "srv-salt-bob",
        passwordHash: "hash-bob",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const idempotencyKey = "idemp-key-xyz";

    // Insert idempotency key for user 1
    await db.insert(idempotencyKeys).values({
      id: "key-rec-1",
      userId: "user-1",
      key: idempotencyKey,
      requestFingerprint: "fp-1",
      lockedUntil: new Date(now.getTime() + 60000),
      createdAt: now,
    });

    // Inserting identical key for same user MUST fail unique constraint
    await expect(
      db.insert(idempotencyKeys).values({
        id: "key-rec-2",
        userId: "user-1",
        key: idempotencyKey,
        requestFingerprint: "fp-2",
        lockedUntil: new Date(now.getTime() + 60000),
        createdAt: now,
      }),
    ).rejects.toThrow();

    // Inserting same key for different user MUST succeed
    await expect(
      db.insert(idempotencyKeys).values({
        id: "key-rec-3",
        userId: "user-2",
        key: idempotencyKey,
        requestFingerprint: "fp-3",
        lockedUntil: new Date(now.getTime() + 60000),
        createdAt: now,
      }),
    ).resolves.not.toThrow();
  });

  it("Covers AE6: revoking a refresh-token family marks every token in the family consumed in one statement", async () => {
    const { db } = await createTestDatabase();
    await migrate(db, { migrationsFolder });

    const now = new Date();
    const familyId = "fam-token-999";

    await db.insert(users).values({
      id: "user-token-owner",
      email: "charlie@example.com",
      clientSalt: "salt-c",
      argon2MemoryKib: 19456,
      argon2Iterations: 2,
      argon2Parallelism: 1,
      argon2Version: "0x13",
      serverSalt: "srv-salt-c",
      passwordHash: "hash-c",
      createdAt: now,
      updatedAt: now,
    });

    // Insert 3 tokens rotated within the same family
    await db.insert(refreshTokens).values([
      {
        id: "token-1",
        userId: "user-token-owner",
        hashedToken: "hash-tok-1",
        familyId,
        isConsumed: true,
        expiresAt: new Date(now.getTime() + 86400000),
        familyExpiresAt: new Date(now.getTime() + 86400000 * 30),
        createdAt: new Date(now.getTime() - 2000),
      },
      {
        id: "token-2",
        userId: "user-token-owner",
        hashedToken: "hash-tok-2",
        familyId,
        isConsumed: false,
        expiresAt: new Date(now.getTime() + 86400000),
        familyExpiresAt: new Date(now.getTime() + 86400000 * 30),
        createdAt: new Date(now.getTime() - 1000),
      },
      {
        id: "token-3",
        userId: "user-token-owner",
        hashedToken: "hash-tok-3",
        familyId,
        isConsumed: false,
        expiresAt: new Date(now.getTime() + 86400000),
        familyExpiresAt: new Date(now.getTime() + 86400000 * 30),
        createdAt: now,
      },
    ]);

    // Revoke the entire family in a single statement
    const updateResult = await db
      .update(refreshTokens)
      .set({ isConsumed: true })
      .where(eq(refreshTokens.familyId, familyId));

    expect(updateResult.rowsAffected).toBe(3);

    const activeTokens = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.familyId, familyId));

    expect(activeTokens.every((t) => t.isConsumed)).toBe(true);
  });

  it("round-trips every job status and vision task accurately", async () => {
    const { db } = await createTestDatabase();
    await migrate(db, { migrationsFolder });

    const now = new Date();

    await db.insert(users).values({
      id: "user-job-tester",
      email: "tester@example.com",
      clientSalt: "salt-t",
      argon2MemoryKib: 19456,
      argon2Iterations: 2,
      argon2Parallelism: 1,
      argon2Version: "0x13",
      serverSalt: "srv-salt-t",
      passwordHash: "hash-t",
      createdAt: now,
      updatedAt: now,
    });

    // Test each of the 7 statuses
    for (let i = 0; i < JOB_STATUSES.length; i++) {
      const status = JOB_STATUSES[i] as JobStatus;
      const task = VISION_TASKS[i % VISION_TASKS.length] as VisionTask;
      const jobId = `job-${status}-${i}`;

      await db.insert(jobs).values({
        id: jobId,
        userId: "user-job-tester",
        task,
        modelVariant: "yolo26n",
        mode: "per-frame",
        mediaType: "image",
        status,
        originalFilename: `sample_${status}.jpg`,
        mediaKey: `users/user-job-tester/media/${jobId}.jpg`,
        mediaEtag: "etag-12345",
        resultKey: `users/user-job-tester/results/${jobId}.json`,
        confidenceThreshold: 0.25,
        sourceFps: 30,
        sampledFps: 5,
        framesTotal: 10,
        framesCompleted: 10,
        durationMs: 120.5,
        inferenceDurationMs: 45.2,
        coldStartDurationMs: 15.0,
        correlationId: `corr-${jobId}`,
        createdAt: new Date(now.getTime() + i),
        updatedAt: new Date(now.getTime() + i),
      });

      const [storedJob] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId));

      expect(storedJob).toBeDefined();
      expect(storedJob?.status).toBe(status);
      expect(storedJob?.task).toBe(task);
      expect(storedJob?.mediaEtag).toBe("etag-12345");
      expect(storedJob?.correlationId).toBe(`corr-${jobId}`);
      expect(storedJob?.createdAt).toBeInstanceOf(Date);
    }
  });

  it("Covers R112: cascades user deletion to jobs, refresh tokens, and idempotency keys", async () => {
    const { db } = await createTestDatabase();
    await migrate(db, { migrationsFolder });

    const now = new Date();
    const userId = "user-to-delete";

    await db.insert(users).values({
      id: userId,
      email: "delete-me@example.com",
      clientSalt: "salt-d",
      argon2MemoryKib: 19456,
      argon2Iterations: 2,
      argon2Parallelism: 1,
      argon2Version: "0x13",
      serverSalt: "srv-salt-d",
      passwordHash: "hash-d",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(jobs).values({
      id: "job-cascade-1",
      userId,
      task: "detection",
      modelVariant: "yolo26n",
      mode: "per-frame",
      mediaType: "image",
      status: "created",
      correlationId: "corr-del-1",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(refreshTokens).values({
      id: "token-cascade-1",
      userId,
      hashedToken: "hash-del-1",
      familyId: "fam-del-1",
      isConsumed: false,
      expiresAt: new Date(now.getTime() + 86400000),
      familyExpiresAt: new Date(now.getTime() + 86400000 * 30),
      createdAt: now,
    });

    await db.insert(idempotencyKeys).values({
      id: "idemp-cascade-1",
      userId,
      key: "key-del-1",
      requestFingerprint: "fp-del-1",
      lockedUntil: new Date(now.getTime() + 60000),
      createdAt: now,
    });

    // Delete user
    await db.delete(users).where(eq(users.id, userId));

    // Verify all child rows are cascaded
    const remainingJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.userId, userId));
    const remainingTokens = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, userId));
    const remainingKeys = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.userId, userId));

    expect(remainingJobs).toHaveLength(0);
    expect(remainingTokens).toHaveLength(0);
    expect(remainingKeys).toHaveLength(0);
  });
});
