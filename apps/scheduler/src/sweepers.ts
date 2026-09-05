/**
 * @sightforge/scheduler - Maintenance Sweepers & Retention Enforcers
 *
 * Implements authoritative state-dependent retention policies, stuck job timeout sweepers,
 * orphan storage reclaimers, and account deletion cascades (R100–R104, R112, KTD8, AE8).
 */

import { and, eq, inArray, isNotNull, lte, or, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  jobs,
  refreshTokens,
  idempotencyKeys,
  users,
  JobStatus,
} from "@sightforge/db";
import defaultsConfig from "../../../config/defaults.json";

export interface SchedulerWorkerEnv {
  ENVIRONMENT: string;
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  JOB_ROOM?: DurableObjectNamespace;
}

export interface SweepSummary {
  sweepName: string;
  itemsProcessed: number;
  success: boolean;
  error?: string;
}

export const COMPLETED_MEDIA_RETENTION_DAYS =
  defaultsConfig.retention.completedInputMediaDays; // 7 days (R100)
export const FAILED_MEDIA_RETENTION_DAYS =
  defaultsConfig.retention.failedInputMediaDays; // 14 days (R101)
export const COMPLETED_RESULTS_RETENTION_DAYS =
  defaultsConfig.retention.completedResultsDays; // 30 days (R102)
export const QUARANTINE_EXPIRY_HOURS = 24; // 24 hours (R104)
export const STUCK_JOB_TIMEOUT_MS = 300_000; // 5 minutes (R103, AE8)

/**
 * 1. Sweeps stuck non-terminal jobs past timeout threshold and projects to JobRoom DO (R103, AE8).
 */
export async function sweepStuckJobs(
  env: SchedulerWorkerEnv,
  maxItems = 10,
  timeoutMs = STUCK_JOB_TIMEOUT_MS,
  nowMs = Date.now(),
): Promise<SweepSummary> {
  const db = drizzle(env.DB);
  const cutoff = new Date(nowMs - timeoutMs);
  const stuckStatuses: JobStatus[] = ["uploading", "queued", "processing"];

  try {
    const stuckJobs = await db
      .select()
      .from(jobs)
      .where(
        and(inArray(jobs.status, stuckStatuses), lte(jobs.updatedAt, cutoff)),
      )
      .limit(maxItems)
      .all();

    let processed = 0;

    for (const job of stuckJobs) {
      const now = new Date(nowMs);

      // Guarded transition to failed
      await db
        .update(jobs)
        .set({
          status: "failed",
          errorCode: "timeout",
          errorMessage: "Job timed out in processing state.",
          updatedAt: now,
        })
        .where(and(eq(jobs.id, job.id), inArray(jobs.status, stuckStatuses)));

      // Project terminal transition to JobRoom DO so attached WebSockets fail immediately (AE8)
      if (env.JOB_ROOM) {
        const roomStub = env.JOB_ROOM.get(env.JOB_ROOM.idFromName(job.id));
        await roomStub
          .fetch("http://job-room/state-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId: job.id,
              status: "failed",
              errorCode: "timeout",
              errorMessage: "Job timed out in processing state.",
              updatedAt: nowMs,
            }),
          })
          .catch(() => {});
      }

      processed++;
    }

    return {
      sweepName: "stuck-jobs",
      itemsProcessed: processed,
      success: true,
    };
  } catch (err) {
    return {
      sweepName: "stuck-jobs",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 2. Sweeps and deletes completed job input media older than 7 days (R100).
 */
export async function sweepCompletedMedia(
  env: SchedulerWorkerEnv,
  maxItems = 10,
  retentionDays = COMPLETED_MEDIA_RETENTION_DAYS,
  nowMs = Date.now(),
): Promise<SweepSummary> {
  const db = drizzle(env.DB);
  const cutoff = new Date(nowMs - retentionDays * 86_400_000);

  try {
    const expiredJobs = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "completed"),
          isNotNull(jobs.mediaKey),
          lte(jobs.updatedAt, cutoff),
        ),
      )
      .limit(maxItems)
      .all();

    let processed = 0;

    for (const job of expiredJobs) {
      if (job.mediaKey) {
        await env.MEDIA_BUCKET.delete(job.mediaKey).catch(() => {});
      }

      await db
        .update(jobs)
        .set({
          mediaKey: null,
          updatedAt: new Date(nowMs),
        })
        .where(eq(jobs.id, job.id));

      processed++;
    }

    return {
      sweepName: "completed-media",
      itemsProcessed: processed,
      success: true,
    };
  } catch (err) {
    return {
      sweepName: "completed-media",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 3. Sweeps and deletes failed job input media older than 14 days (R101).
 */
export async function sweepFailedMedia(
  env: SchedulerWorkerEnv,
  maxItems = 10,
  retentionDays = FAILED_MEDIA_RETENTION_DAYS,
  nowMs = Date.now(),
): Promise<SweepSummary> {
  const db = drizzle(env.DB);
  const cutoff = new Date(nowMs - retentionDays * 86_400_000);

  try {
    const expiredJobs = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "failed"),
          isNotNull(jobs.mediaKey),
          lte(jobs.updatedAt, cutoff),
        ),
      )
      .limit(maxItems)
      .all();

    let processed = 0;

    for (const job of expiredJobs) {
      if (job.mediaKey) {
        await env.MEDIA_BUCKET.delete(job.mediaKey).catch(() => {});
      }

      await db
        .update(jobs)
        .set({
          mediaKey: null,
          updatedAt: new Date(nowMs),
        })
        .where(eq(jobs.id, job.id));

      processed++;
    }

    return {
      sweepName: "failed-media",
      itemsProcessed: processed,
      success: true,
    };
  } catch (err) {
    return {
      sweepName: "failed-media",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 4. Sweeps and deletes completed result documents and dense masks older than 30 days (R102).
 */
export async function sweepCompletedResults(
  env: SchedulerWorkerEnv,
  maxItems = 10,
  retentionDays = COMPLETED_RESULTS_RETENTION_DAYS,
  nowMs = Date.now(),
): Promise<SweepSummary> {
  const db = drizzle(env.DB);
  const cutoff = new Date(nowMs - retentionDays * 86_400_000);

  try {
    const expiredJobs = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "completed"),
          or(isNotNull(jobs.resultKey), isNotNull(jobs.denseArtifactKey)),
          lte(jobs.updatedAt, cutoff),
        ),
      )
      .limit(maxItems)
      .all();

    let processed = 0;

    for (const job of expiredJobs) {
      if (job.resultKey) {
        await env.MEDIA_BUCKET.delete(job.resultKey).catch(() => {});
      }
      if (job.denseArtifactKey) {
        await env.MEDIA_BUCKET.delete(job.denseArtifactKey).catch(() => {});
      }

      await db
        .update(jobs)
        .set({
          resultKey: null,
          denseArtifactKey: null,
          updatedAt: new Date(nowMs),
        })
        .where(eq(jobs.id, job.id));

      processed++;
    }

    return {
      sweepName: "completed-results",
      itemsProcessed: processed,
      success: true,
    };
  } catch (err) {
    return {
      sweepName: "completed-results",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 5. Reconciles unconsumed quarantined uploads older than 24 hours (R104).
 */
export async function sweepQuarantinedUploads(
  env: SchedulerWorkerEnv,
  maxItems = 10,
  maxAgeHours = QUARANTINE_EXPIRY_HOURS,
  nowMs = Date.now(),
): Promise<SweepSummary> {
  const db = drizzle(env.DB);
  const cutoff = new Date(nowMs - maxAgeHours * 3600_000);

  try {
    const expiredQuarantined = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "created"), lte(jobs.createdAt, cutoff)))
      .limit(maxItems)
      .all();

    let processed = 0;

    for (const job of expiredQuarantined) {
      if (job.mediaKey) {
        await env.MEDIA_BUCKET.delete(job.mediaKey).catch(() => {});
      }

      await db
        .update(jobs)
        .set({
          status: "failed",
          errorCode: "timeout",
          errorMessage: "Quarantined upload was not completed within 24 hours.",
          updatedAt: new Date(nowMs),
        })
        .where(and(eq(jobs.id, job.id), eq(jobs.status, "created")));

      if (env.JOB_ROOM) {
        const roomStub = env.JOB_ROOM.get(env.JOB_ROOM.idFromName(job.id));
        await roomStub
          .fetch("http://job-room/state-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId: job.id,
              status: "failed",
              errorCode: "timeout",
              errorMessage:
                "Quarantined upload was not completed within 24 hours.",
              updatedAt: nowMs,
            }),
          })
          .catch(() => {});
      }

      processed++;
    }

    return {
      sweepName: "quarantined-uploads",
      itemsProcessed: processed,
      success: true,
    };
  } catch (err) {
    return {
      sweepName: "quarantined-uploads",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 6. Reclaims orphaned result objects for cancelled jobs.
 */
export async function sweepCancelledResults(
  env: SchedulerWorkerEnv,
  maxItems = 10,
  nowMs = Date.now(),
): Promise<SweepSummary> {
  const db = drizzle(env.DB);

  try {
    const cancelledJobs = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "cancelled"),
          or(isNotNull(jobs.resultKey), isNotNull(jobs.denseArtifactKey)),
        ),
      )
      .limit(maxItems)
      .all();

    let processed = 0;

    for (const job of cancelledJobs) {
      if (job.resultKey) {
        await env.MEDIA_BUCKET.delete(job.resultKey).catch(() => {});
      }
      if (job.denseArtifactKey) {
        await env.MEDIA_BUCKET.delete(job.denseArtifactKey).catch(() => {});
      }

      await db
        .update(jobs)
        .set({
          resultKey: null,
          denseArtifactKey: null,
          updatedAt: new Date(nowMs),
        })
        .where(eq(jobs.id, job.id));

      processed++;
    }

    return {
      sweepName: "cancelled-results",
      itemsProcessed: processed,
      success: true,
    };
  } catch (err) {
    return {
      sweepName: "cancelled-results",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 7. Reaps expired/consumed refresh tokens and expired idempotency keys (R9, R27).
 */
export async function sweepAuthAndIdempotency(
  env: SchedulerWorkerEnv,
  nowMs = Date.now(),
): Promise<SweepSummary> {
  const db = drizzle(env.DB);
  const now = new Date(nowMs);
  const consumedTokenCutoff = new Date(nowMs - 7 * 86_400_000); // 7 days past consumption
  const idempotencyCutoff = new Date(nowMs - 86_400_000); // 24h past creation

  try {
    // 1. Expired/consumed refresh tokens
    await db
      .delete(refreshTokens)
      .where(
        or(
          lte(refreshTokens.expiresAt, now),
          lte(refreshTokens.familyExpiresAt, now),
          and(
            eq(refreshTokens.isConsumed, true),
            lte(refreshTokens.createdAt, consumedTokenCutoff),
          ),
        ),
      );

    // 2. Expired idempotency keys
    await db
      .delete(idempotencyKeys)
      .where(
        or(
          lte(idempotencyKeys.lockedUntil, now),
          lte(idempotencyKeys.createdAt, idempotencyCutoff),
        ),
      );

    return { sweepName: "auth-idempotency", itemsProcessed: 1, success: true };
  } catch (err) {
    return {
      sweepName: "auth-idempotency",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 8. Account deletion cascade backstop (R112).
 */
export async function sweepAccountDeletionBackstop(
  env: SchedulerWorkerEnv,
  maxItems = 10,
): Promise<SweepSummary> {
  const db = drizzle(env.DB);

  try {
    // Find orphaned jobs whose userId is no longer present in users
    const validUserIds = await db.select({ id: users.id }).from(users).all();
    const idSet = validUserIds.map((u) => u.id);

    let processed = 0;

    if (idSet.length > 0) {
      const orphanedJobs = await db
        .select()
        .from(jobs)
        .where(notInArray(jobs.userId, idSet))
        .limit(maxItems)
        .all();

      for (const job of orphanedJobs) {
        if (job.mediaKey)
          await env.MEDIA_BUCKET.delete(job.mediaKey).catch(() => {});
        if (job.resultKey)
          await env.MEDIA_BUCKET.delete(job.resultKey).catch(() => {});
        if (job.denseArtifactKey) {
          await env.MEDIA_BUCKET.delete(job.denseArtifactKey).catch(() => {});
        }
        await db.delete(jobs).where(eq(jobs.id, job.id));
        processed++;
      }
    }

    return {
      sweepName: "account-deletion-backstop",
      itemsProcessed: processed,
      success: true,
    };
  } catch (err) {
    return {
      sweepName: "account-deletion-backstop",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
