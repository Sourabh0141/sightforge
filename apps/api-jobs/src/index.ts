/**
 * @sightforge/api-jobs - Job Lifecycle Worker Entrypoint
 *
 * Implements job creation, parameter validation, idempotency locking,
 * presigned upload grants, adaptive polling, WebSocket ticket minting,
 * cancellation, result retrieval, and deletion cascades (R13, R17-R33, R36, R41-R52, R70, R105, R111, R112, R115).
 */

import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { idempotencyKeys, jobs, refreshTokens, users } from "@sightforge/db";
import {
  authenticatedChain,
  assertOwnership,
  createErrorResponse,
  HttpError,
  JobsWorkerEnv,
  RequestContext,
  unauthenticatedChain,
} from "@sightforge/worker-kit";
import { validateCreateJobInput } from "./validation.js";
import {
  acquireIdempotencyLock,
  computeRequestFingerprint,
  finalizeIdempotencyRecord,
} from "./idempotency.js";
import { generatePresignedUrl } from "./storage.js";
import { assertDailyJobQuota, assertSpendCeiling } from "./quotas.js";
import {
  cancelJob,
  fetchLiveJobStatus,
  mintLiveStatusTicket,
  projectStateToJobRoom,
} from "./transitions.js";
import { JobRoom } from "./job-room.js";

export { JobRoom };
export { Counter } from "@sightforge/worker-kit";

export default {
  async fetch(request: Request, env: JobsWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const path =
      url.pathname.length > 1 && url.pathname.endsWith("/")
        ? url.pathname.slice(0, -1)
        : url.pathname;
    const method = request.method;

    // Health check endpoint
    if (path === "/" || path === "/health") {
      return unauthenticatedChain(request, env, async () => {
        return new Response(
          JSON.stringify({ service: "sightforge-api-jobs", status: "ready" }),
          { headers: { "Content-Type": "application/json" } },
        );
      });
    }

    // Authenticated API Routes & WebSocket Upgrades
    if (path.startsWith("/jobs") || path === "/account") {
      // 0. WebSocket Live Status Handshake (R29, R115, KTD5)
      const liveMatch = path.match(/^\/jobs\/([a-zA-Z0-9_-]+)\/(live|ws)$/);
      if (
        liveMatch &&
        (method === "GET" ||
          request.headers.get("Upgrade")?.toLowerCase() === "websocket")
      ) {
        const jobId = liveMatch[1]!;
        if (env.JOB_ROOM) {
          const roomStub = env.JOB_ROOM.get(env.JOB_ROOM.idFromName(jobId));
          return roomStub.fetch(request);
        }
      }

      // 1. POST /jobs - Create Job with Idempotency & Presigned Upload
      if (path === "/jobs" && method === "POST") {
        return authenticatedChain(request, env, async (ctx) =>
          handleCreateJob(ctx, env),
        );
      }

      // 2. GET /jobs - List User's Jobs (Paginated)
      if (path === "/jobs" && method === "GET") {
        return authenticatedChain(request, env, async (ctx) =>
          handleListJobs(ctx, env),
        );
      }

      // 3. POST /jobs/:id/ticket - Mint WebSocket Live Status Ticket
      const ticketMatch = path.match(/^\/jobs\/([a-zA-Z0-9_-]+)\/ticket$/);
      if (ticketMatch && method === "POST") {
        const jobId = ticketMatch[1]!;
        return authenticatedChain(request, env, async (ctx) =>
          handleMintTicket(ctx, env, jobId),
        );
      }

      // 3.5. POST /jobs/:id/process - Confirm Upload & Enqueue Processing
      const processMatch = path.match(/^\/jobs\/([a-zA-Z0-9_-]+)\/process$/);
      if (processMatch && method === "POST") {
        const jobId = processMatch[1]!;
        return authenticatedChain(request, env, async (ctx) =>
          handleProcessJob(ctx, env, jobId),
        );
      }

      // 4. GET /jobs/:id/status - Adaptive Polling Status
      const statusMatch = path.match(/^\/jobs\/([a-zA-Z0-9_-]+)\/status$/);
      if (statusMatch && method === "GET") {
        const jobId = statusMatch[1]!;
        return authenticatedChain(request, env, async (ctx) =>
          handleGetJobStatus(ctx, env, jobId),
        );
      }

      // 5. POST /jobs/:id/cancel - Cancel Non-terminal Job
      const cancelMatch = path.match(/^\/jobs\/([a-zA-Z0-9_-]+)\/cancel$/);
      if (cancelMatch && method === "POST") {
        const jobId = cancelMatch[1]!;
        return authenticatedChain(request, env, async (ctx) =>
          handleCancelJob(ctx, env, jobId),
        );
      }

      // 6. GET /jobs/:id/results - Presigned Result Document Download
      const resultsMatch = path.match(/^\/jobs\/([a-zA-Z0-9_-]+)\/results$/);
      if (resultsMatch && method === "GET") {
        const jobId = resultsMatch[1]!;
        return authenticatedChain(request, env, async (ctx) =>
          handleGetJobResults(ctx, env, jobId),
        );
      }

      // 7. GET /jobs/:id/results/dense-artifact - Presigned Dense Mask Artifact Download
      const denseMatch = path.match(
        /^\/jobs\/([a-zA-Z0-9_-]+)\/results\/dense-artifact$/,
      );
      if (denseMatch && method === "GET") {
        const jobId = denseMatch[1]!;
        return authenticatedChain(request, env, async (ctx) =>
          handleGetDenseArtifact(ctx, env, jobId),
        );
      }

      // 8. GET /jobs/:id - Get Job Metadata or WebSocket Upgrade
      const jobMatch = path.match(/^\/jobs\/([a-zA-Z0-9_-]+)$/);
      if (jobMatch && method === "GET") {
        const jobId = jobMatch[1]!;
        if (
          request.headers.get("Upgrade")?.toLowerCase() === "websocket" &&
          env.JOB_ROOM
        ) {
          const roomStub = env.JOB_ROOM.get(env.JOB_ROOM.idFromName(jobId));
          return roomStub.fetch(request);
        }
        return authenticatedChain(request, env, async (ctx) =>
          handleGetJobDetail(ctx, env, jobId),
        );
      }

      // 9. DELETE /jobs/:id - Delete Job and R2 Blobs
      if (jobMatch && method === "DELETE") {
        const jobId = jobMatch[1]!;
        return authenticatedChain(request, env, async (ctx) =>
          handleDeleteJob(ctx, env, jobId),
        );
      }

      // 10. DELETE /account - Cascade Delete User Account
      if (path === "/account" && method === "DELETE") {
        return authenticatedChain(request, env, async (ctx) =>
          handleDeleteAccount(ctx, env),
        );
      }
    }

    return createErrorResponse(
      new HttpError(404, "not-found", `Endpoint not found: ${method} ${path}`),
    );
  },
};

/**
 * POST /jobs - Creates a new job with idempotency and returns presigned upload URL.
 */
async function handleCreateJob(
  ctx: RequestContext,
  env: JobsWorkerEnv,
): Promise<Response> {
  const userId = ctx.userId!;
  const rawBody = await ctx.request.text();
  let parsedBody: unknown = {};
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new HttpError(400, "invalid-input", "Malformed JSON request body.");
  }

  // 1. Quota & Spend Verification (R70, R111, AE9)
  if (env.COUNTER) {
    await assertDailyJobQuota(env.COUNTER, userId);
    await assertSpendCeiling(env.COUNTER);
  }

  // 2. Idempotency Lock Acquisition (R27, R28, AE5)
  const idempotencyKey = ctx.request.headers.get("Idempotency-Key");
  let lockId: string | null = null;

  if (idempotencyKey) {
    const fingerprint = await computeRequestFingerprint(parsedBody);
    const lockResult = await acquireIdempotencyLock(
      env.DB,
      userId,
      idempotencyKey,
      fingerprint,
    );

    if (lockResult.state === "replay") {
      // Re-mint fresh time-sensitive tokens on replay (Approach Step 7)
      const replayedBody = { ...lockResult.storedResponse.body };
      if (replayedBody.jobId) {
        const freshUploadUrl = await generatePresignedUrl({
          method: "PUT",
          bucketName: "sightforge-media-prod",
          objectKey: `users/${userId}/media/${replayedBody.jobId}.png`,
          accessKeyId: env.R2_MEDIA_ACCESS_KEY_ID || "dummy_key",
          secretAccessKey: env.R2_MEDIA_SECRET_ACCESS_KEY || "dummy_secret",
          accountId:
            env.CLOUDFLARE_ACCOUNT_ID ||
            env.R2_ACCOUNT_ID ||
            "dummy_account_id",
          contentType:
            replayedBody.mediaType === "video" ? "video/mp4" : "image/png",
        });
        replayedBody.uploadUrl = freshUploadUrl;
      }

      return new Response(JSON.stringify(replayedBody), {
        status: lockResult.storedResponse.status,
        headers: {
          "Content-Type": "application/json",
          ...lockResult.storedResponse.headers,
        },
      });
    }

    lockId = lockResult.lockId;
  }

  // 3. Validate Input & Derive Storage Keys (R17, R36, R41-R43, AE4)
  const jobId = crypto.randomUUID();
  const config = validateCreateJobInput(parsedBody, userId, jobId);

  // 4. Generate S3 SigV4 Presigned PUT URL for R2 Direct Upload (R18, R19, AE3)
  const uploadContentType =
    config.mediaType === "video" ? "video/mp4" : "image/png";
  const uploadUrl = await generatePresignedUrl({
    method: "PUT",
    bucketName: "sightforge-media-prod",
    objectKey: config.mediaKey,
    accessKeyId: env.R2_MEDIA_ACCESS_KEY_ID || "dummy_key",
    secretAccessKey: env.R2_MEDIA_SECRET_ACCESS_KEY || "dummy_secret",
    accountId:
      env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID || "dummy_account_id",
    contentType: uploadContentType,
    expiresInSeconds: 900, // 15 minutes
  });

  // 5. Insert Job into D1 (R25, R26)
  const db = drizzle(env.DB);
  const now = Date.now();
  await db.insert(jobs).values({
    id: jobId,
    userId,
    task: config.task,
    modelVariant: config.modelVariant,
    mode: config.mode,
    mediaType: config.mediaType,
    status: "created",
    originalFilename: config.originalFilename,
    mediaKey: config.mediaKey,
    mediaEtag: null,
    resultKey: config.resultKey,
    denseArtifactKey: config.denseArtifactKey,
    confidenceThreshold: config.confidenceThreshold,
    sourceFps: config.sourceFps,
    sampledFps: config.sampledFps,
    framesTotal: null,
    framesCompleted: 0,
    durationMs: null,
    inferenceDurationMs: null,
    coldStartDurationMs: null,
    correlationId: ctx.correlationId,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });

  // 6. Project Created State to JobRoom Durable Object (KTD4)
  if (env.JOB_ROOM) {
    await projectStateToJobRoom(env.JOB_ROOM, jobId, "created", {
      userId,
      task: config.task,
      mediaType: config.mediaType,
    });
  }

  const responseBody = {
    jobId,
    status: "created",
    task: config.task,
    mode: config.mode,
    mediaType: config.mediaType,
    modelVariant: config.modelVariant,
    confidenceThreshold: config.confidenceThreshold,
    uploadUrl,
    uploadContentType,
    mediaKey: config.mediaKey,
    createdAt: new Date(now).toISOString(),
  };

  // 7. Finalize Idempotency Record
  if (lockId) {
    await finalizeIdempotencyRecord(
      env.DB,
      lockId,
      201,
      { "Content-Type": "application/json" },
      responseBody,
    );
  }

  return new Response(JSON.stringify(responseBody), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /jobs - Lists jobs owned by the authenticated user.
 */
async function handleListJobs(
  ctx: RequestContext,
  env: JobsWorkerEnv,
): Promise<Response> {
  const userId = ctx.userId!;
  const url = new URL(ctx.request.url);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)),
  );
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get("offset") || "0", 10),
  );

  const db = drizzle(env.DB);
  const userJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.createdAt))
    .limit(limit)
    .offset(offset);

  return new Response(
    JSON.stringify({
      jobs: userJobs,
      limit,
      offset,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

/**
 * GET /jobs/:id - Retrieves job details.
 */
async function handleGetJobDetail(
  ctx: RequestContext,
  env: JobsWorkerEnv,
  jobId: string,
): Promise<Response> {
  const userId = ctx.userId!;
  const db = drizzle(env.DB);
  const job = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .get();

  assertOwnership(userId, job, "Job not found.");

  return new Response(JSON.stringify({ job }), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /jobs/:id/process - Confirms upload completion and enqueues job for processing.
 */
async function handleProcessJob(
  ctx: RequestContext,
  env: JobsWorkerEnv,
  jobId: string,
): Promise<Response> {
  const userId = ctx.userId!;
  const db = drizzle(env.DB);
  const job = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .get();

  assertOwnership(userId, job, "Job not found.");

  if (
    job.status === "queued" ||
    job.status === "processing" ||
    job.status === "completed"
  ) {
    return new Response(
      JSON.stringify({ success: true, jobId, status: job.status }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  let objectHead: R2Object | null = null;
  if (env.MEDIA_BUCKET && job.mediaKey) {
    objectHead = await env.MEDIA_BUCKET.head(job.mediaKey);
  }

  if (env.JOBS_QUEUE && job.mediaKey) {
    await env.JOBS_QUEUE.send({
      key: job.mediaKey,
      object: {
        key: job.mediaKey,
        size: objectHead?.size ?? 0,
        eTag: objectHead?.etag ?? objectHead?.httpEtag,
      },
    });
  }

  return new Response(
    JSON.stringify({ success: true, jobId, status: "processing_enqueued" }),
    { headers: { "Content-Type": "application/json" } },
  );
}

/**
 * GET /jobs/:id/status - Adaptive polling endpoint querying JobRoom DO with D1 fallback.
 */
async function handleGetJobStatus(
  ctx: RequestContext,
  env: JobsWorkerEnv,
  jobId: string,
): Promise<Response> {
  const userId = ctx.userId!;
  const statusResult = await fetchLiveJobStatus(
    env.JOB_ROOM,
    env.DB,
    jobId,
    userId,
  );

  // Self-healing fallback: If job is still in "created" or "uploading" state but object exists in R2, enqueue to JOBS_QUEUE
  if (
    (statusResult.job.status === "created" ||
      statusResult.job.status === "uploading") &&
    env.MEDIA_BUCKET &&
    env.JOBS_QUEUE &&
    statusResult.job.mediaKey
  ) {
    try {
      const head = await env.MEDIA_BUCKET.head(statusResult.job.mediaKey);
      if (head) {
        await env.JOBS_QUEUE.send({
          key: statusResult.job.mediaKey,
          object: {
            key: statusResult.job.mediaKey,
            size: head.size,
            eTag: head.etag || head.httpEtag,
          },
        });
      }
    } catch {
      // Ignore background self-healing failure during status read
    }
  }

  return new Response(
    JSON.stringify({
      jobId: statusResult.job.id,
      status: statusResult.job.status,
      task: statusResult.job.task,
      mediaType: statusResult.job.mediaType,
      framesCompleted: statusResult.job.framesCompleted,
      framesTotal: statusResult.job.framesTotal,
      isLive: statusResult.isLive,
      possiblyStale: statusResult.possiblyStale,
      pollIntervalMs: statusResult.pollIntervalMs,
      estimatedWaitSeconds: statusResult.estimatedWaitSeconds,
      errorCode: statusResult.job.errorCode,
      errorMessage: statusResult.job.errorMessage,
      updatedAt: statusResult.job.updatedAt,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

/**
 * POST /jobs/:id/ticket - Mints a single-use WebSocket live status ticket.
 */
async function handleMintTicket(
  ctx: RequestContext,
  env: JobsWorkerEnv,
  jobId: string,
): Promise<Response> {
  const userId = ctx.userId!;
  const db = drizzle(env.DB);
  const job = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .get();

  assertOwnership(userId, job, "Job not found.");

  if (
    job.status === "completed" ||
    job.status === "failed" ||
    job.status === "cancelled"
  ) {
    throw new HttpError(
      400,
      "invalid-input",
      `Cannot mint live ticket for terminal job with status '${job.status}'.`,
    );
  }

  const ticket = await mintLiveStatusTicket(env.JOB_ROOM, jobId, userId);

  return new Response(
    JSON.stringify({
      ticket,
      jobId,
      expiresInSeconds: 300,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

/**
 * POST /jobs/:id/cancel - Cancels a non-terminal job.
 */
async function handleCancelJob(
  ctx: RequestContext,
  env: JobsWorkerEnv,
  jobId: string,
): Promise<Response> {
  const userId = ctx.userId!;
  const cancelled = await cancelJob(env.DB, env.JOB_ROOM, jobId, userId);

  return new Response(
    JSON.stringify({
      jobId: cancelled.id,
      status: cancelled.status,
      updatedAt: cancelled.updatedAt,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

/**
 * GET /jobs/:id/results - Generates presigned GET URL for JSON result attachment (R50, R73).
 */
async function handleGetJobResults(
  ctx: RequestContext,
  env: JobsWorkerEnv,
  jobId: string,
): Promise<Response> {
  const userId = ctx.userId!;
  const db = drizzle(env.DB);
  const job = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .get();

  assertOwnership(userId, job, "Job not found.");

  if (job.status !== "completed" || !job.resultKey) {
    throw new HttpError(
      400,
      "invalid-input",
      "Results are only available for completed jobs.",
    );
  }

  const downloadUrl = await generatePresignedUrl({
    method: "GET",
    bucketName: "sightforge-media-prod",
    objectKey: job.resultKey,
    accessKeyId: env.R2_MEDIA_ACCESS_KEY_ID || "dummy_key",
    secretAccessKey: env.R2_MEDIA_SECRET_ACCESS_KEY || "dummy_secret",
    accountId:
      env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID || "dummy_account_id",
    contentType: "application/json",
    contentDisposition: `attachment; filename="result-${jobId}.json"`,
    expiresInSeconds: 3600, // 1 hour
  });

  return new Response(
    JSON.stringify({
      jobId,
      resultKey: job.resultKey,
      downloadUrl,
      expiresInSeconds: 3600,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

/**
 * GET /jobs/:id/results/dense-artifact - Generates presigned GET URL for dense PNG artifact (R50, R73).
 */
async function handleGetDenseArtifact(
  ctx: RequestContext,
  env: JobsWorkerEnv,
  jobId: string,
): Promise<Response> {
  const userId = ctx.userId!;
  const db = drizzle(env.DB);
  const job = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .get();

  assertOwnership(userId, job, "Job not found.");

  if (!job.denseArtifactKey || job.status !== "completed") {
    throw new HttpError(
      404,
      "not-found",
      "Dense mask artifact not available for this job.",
    );
  }

  const downloadUrl = await generatePresignedUrl({
    method: "GET",
    bucketName: "sightforge-media-prod",
    objectKey: job.denseArtifactKey,
    accessKeyId: env.R2_MEDIA_ACCESS_KEY_ID || "dummy_key",
    secretAccessKey: env.R2_MEDIA_SECRET_ACCESS_KEY || "dummy_secret",
    accountId:
      env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID || "dummy_account_id",
    contentType: "image/png",
    contentDisposition: "inline",
    expiresInSeconds: 3600,
  });

  return new Response(
    JSON.stringify({
      jobId,
      denseArtifactKey: job.denseArtifactKey,
      downloadUrl,
      expiresInSeconds: 3600,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

/**
 * DELETE /jobs/:id - Deletes a job and its associated R2 objects (R105).
 */
async function handleDeleteJob(
  ctx: RequestContext,
  env: JobsWorkerEnv,
  jobId: string,
): Promise<Response> {
  const userId = ctx.userId!;
  const db = drizzle(env.DB);
  const job = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .get();

  assertOwnership(userId, job, "Job not found.");

  // 1. Purge R2 Storage Objects
  if (env.MEDIA_BUCKET) {
    if (job.mediaKey) {
      await env.MEDIA_BUCKET.delete(job.mediaKey).catch(() => {});
    }
    if (job.resultKey) {
      await env.MEDIA_BUCKET.delete(job.resultKey).catch(() => {});
    }
    if (job.denseArtifactKey) {
      await env.MEDIA_BUCKET.delete(job.denseArtifactKey).catch(() => {});
    }
  }

  // 2. Delete Job from D1
  await db.delete(jobs).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));

  return new Response(JSON.stringify({ success: true, deletedJobId: jobId }), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * DELETE /account - Cascades user deletion across all jobs, tokens, and storage (R112).
 */
async function handleDeleteAccount(
  ctx: RequestContext,
  env: JobsWorkerEnv,
): Promise<Response> {
  const userId = ctx.userId!;
  const db = drizzle(env.DB);

  // 1. Fetch user's jobs to purge R2 storage objects
  const userJobs = await db.select().from(jobs).where(eq(jobs.userId, userId));
  if (env.MEDIA_BUCKET) {
    for (const j of userJobs) {
      if (j.mediaKey) await env.MEDIA_BUCKET.delete(j.mediaKey).catch(() => {});
      if (j.resultKey)
        await env.MEDIA_BUCKET.delete(j.resultKey).catch(() => {});
      if (j.denseArtifactKey)
        await env.MEDIA_BUCKET.delete(j.denseArtifactKey).catch(() => {});
    }
  }

  // 2. Delete all records cascading from user
  await db.delete(jobs).where(eq(jobs.userId, userId));
  await db.delete(idempotencyKeys).where(eq(idempotencyKeys.userId, userId));
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  await db.delete(users).where(eq(users.id, userId));

  return new Response(
    JSON.stringify({ success: true, deletedUserId: userId }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}
