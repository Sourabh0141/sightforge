/**
 * @sightforge/events - Upload Quarantine Consumer & Inference Callback Worker
 *
 * Implements R2 upload validation, magic-byte inspection, entity tag pinning,
 * HMAC-signed Modal progress and completion callbacks, and guarded D1 transitions
 * (R16, R20, R21, R23, R31, R46, R111, KTD7, KTD8, KTD11, KTD12, AE2, AE12).
 */

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { jobs, JobStatus } from "@sightforge/db";
import { validateMediaUpload } from "./validation.js";
import { verifyModalCallbackSignature } from "./auth.js";
import { dispatchInference } from "./dispatch.js";

export interface EventsWorkerEnv {
  ENVIRONMENT: string;
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  JOBS_QUEUE: Queue;
  JOB_ROOM?: DurableObjectNamespace;
  COUNTER?: DurableObjectNamespace;
  MODAL_CALLBACK_SECRET?: string;
  MODAL_CALLBACK_PREVIOUS_SECRET?: string;
  MODAL_TRIGGER_URL?: string;
  MODAL_KEY?: string;
  MODAL_SECRET?: string;
  FRONTEND_ORIGIN?: string;
}

export interface ProgressCallbackPayload {
  jobId: string;
  framesCompleted: number;
  framesTotal: number;
  deliveryId: string;
}

export interface CompleteCallbackPayload {
  jobId: string;
  status: "completed" | "failed";
  resultKey?: string;
  denseArtifactKey?: string;
  durationMs?: number;
  inferenceDurationMs?: number;
  coldStartDurationMs?: number;
  reportedCost?: number;
  errorCode?: string;
  errorMessage?: string;
  deliveryId: string;
}

export default {
  /**
   * HTTP Fetch Handler: Inbound Modal Callbacks & Health Check
   */
  async fetch(request: Request, env: EventsWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Health check
    if (path === "/" || path === "/health") {
      return new Response(
        JSON.stringify({ service: "sightforge-events", status: "ready" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // 1. Inbound Progress Callback (POST /callbacks/progress) (R31, KTD12)
    if (path === "/callbacks/progress" && method === "POST") {
      return handleProgressCallback(request, env);
    }

    // 2. Inbound Completion Callback (POST /callbacks/complete) (R46, KTD8, KTD12)
    if (path === "/callbacks/complete" && method === "POST") {
      return handleCompleteCallback(request, env);
    }

    return new Response(
      JSON.stringify({ error: "Endpoint not found in events worker" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  },

  /**
   * Queue Consumer: R2 Object-Created Quarantine Validation (R16, R20, R21, KTD7, AE2)
   */
  async queue(
    batch: MessageBatch<unknown>,
    env: EventsWorkerEnv,
  ): Promise<void> {
    const db = drizzle(env.DB);

    for (const msg of batch.messages) {
      try {
        const body = msg.body as {
          object?: { key?: string; size?: number; eTag?: string };
          key?: string;
          size?: number;
        };

        const objectKey = body.object?.key || body.key;
        if (!objectKey) {
          msg.ack();
          continue;
        }

        // Extract jobId from objectKey (e.g. users/<userId>/media/<jobId>.<ext>)
        const match = objectKey.match(/media\/([a-zA-Z0-9_-]+)\.[a-zA-Z0-9]+$/);
        const jobId = match ? match[1] : null;

        if (!jobId) {
          msg.ack();
          continue;
        }

        // Fetch job row from D1
        const job = await db
          .select()
          .from(jobs)
          .where(eq(jobs.id, jobId))
          .get();

        if (!job || job.status !== "created") {
          msg.ack();
          continue;
        }

        // Fetch quarantined object from R2 (read leading bytes for magic number)
        const r2Object = await env.MEDIA_BUCKET.get(objectKey, {
          range: { offset: 0, length: 512 },
        });

        if (!r2Object) {
          // Object missing -> Fail job
          const now = Date.now();
          await db
            .update(jobs)
            .set({
              status: "failed",
              errorCode: "source-changed",
              errorMessage: "Uploaded media object was not found in storage.",
              updatedAt: new Date(now),
            })
            .where(and(eq(jobs.id, jobId), eq(jobs.status, "created")));

          if (env.JOB_ROOM) {
            const roomStub = env.JOB_ROOM.get(env.JOB_ROOM.idFromName(jobId));
            await roomStub
              .fetch("http://job-room/state-update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jobId,
                  status: "failed",
                  errorCode: "source-changed",
                  errorMessage:
                    "Uploaded media object was not found in storage.",
                }),
              })
              .catch(() => {});
          }
          msg.ack();
          continue;
        }

        const leadingBuffer = await r2Object.arrayBuffer();
        const leadingBytes = new Uint8Array(leadingBuffer);
        const totalSize = r2Object.size;

        // Perform magic-byte inspection and size validation (R16, R20, R21, AE2)
        const validation = validateMediaUpload(
          job.mediaType as "image" | "video",
          totalSize,
          leadingBytes,
        );

        if (!validation.valid) {
          // Failure path: Delete bad object and fail job (AE2)
          await env.MEDIA_BUCKET.delete(objectKey).catch(() => {});

          const now = Date.now();
          await db
            .update(jobs)
            .set({
              status: "failed",
              errorCode: validation.errorCode || "format",
              errorMessage:
                validation.errorMessage || "Media failed validation.",
              updatedAt: new Date(now),
            })
            .where(and(eq(jobs.id, jobId), eq(jobs.status, "created")));

          if (env.JOB_ROOM) {
            const roomStub = env.JOB_ROOM.get(env.JOB_ROOM.idFromName(jobId));
            await roomStub
              .fetch("http://job-room/state-update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jobId,
                  status: "failed",
                  errorCode: validation.errorCode || "format",
                  errorMessage:
                    validation.errorMessage || "Media failed validation.",
                }),
              })
              .catch(() => {});
          }

          msg.ack();
          continue;
        }

        // Success path: Pin mediaEtag and transition to queued (KTD7)
        const mediaEtag = r2Object.httpEtag || r2Object.etag || "verified-etag";
        const now = Date.now();

        await db
          .update(jobs)
          .set({
            status: "queued",
            mediaEtag,
            updatedAt: new Date(now),
          })
          .where(and(eq(jobs.id, jobId), eq(jobs.status, "created")));

        if (env.JOB_ROOM) {
          const roomStub = env.JOB_ROOM.get(env.JOB_ROOM.idFromName(jobId));
          await roomStub
            .fetch("http://job-room/state-update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jobId,
                status: "queued",
              }),
            })
            .catch(() => {});
        }

        // Trigger outbound inference dispatch (KTD11)
        await dispatchInference({
          job: { ...job, mediaEtag, status: "queued" },
          triggerUrl: env.MODAL_TRIGGER_URL,
          modalKey: env.MODAL_KEY,
          modalSecret: env.MODAL_SECRET,
        });

        msg.ack();
      } catch (err) {
        // Retry message on unexpected transient exceptions
        msg.retry();
      }
    }
  },
};

/**
 * Handles non-terminal video frame progress callbacks (POST /callbacks/progress) (R31, KTD12).
 */
async function handleProgressCallback(
  request: Request,
  env: EventsWorkerEnv,
): Promise<Response> {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("Modal-Signature");
  const timestampHeader = request.headers.get("Modal-Timestamp");

  // 1. Authenticate HMAC Signature (R46, AE12)
  const authResult = await verifyModalCallbackSignature({
    activeSecret: env.MODAL_CALLBACK_SECRET || "mock-secret",
    previousSecret: env.MODAL_CALLBACK_PREVIOUS_SECRET,
    signatureHeader,
    timestampHeader,
    rawBody,
  });

  if (!authResult.valid) {
    return new Response(
      JSON.stringify({
        error: authResult.errorCode,
        message: authResult.errorMessage,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let payload: ProgressCallbackPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Malformed JSON payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!payload.jobId || !payload.deliveryId) {
    return new Response(
      JSON.stringify({ error: "Missing jobId or deliveryId" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 2. Check Deduplication in JobRoom DO (KTD12)
  if (env.JOB_ROOM) {
    const roomStub = env.JOB_ROOM.get(env.JOB_ROOM.idFromName(payload.jobId));
    const dedupRes = await roomStub.fetch("http://job-room/check-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId: payload.deliveryId }),
    });

    if (dedupRes.status === 409) {
      // Duplicate delivery -> Ack as handled without re-broadcasting (Approach Step 8)
      return new Response(JSON.stringify({ success: true, duplicate: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Broadcast Progress onto JobRoom DO (Does not write to D1) (R31, KTD12)
    await roomStub.fetch("http://job-room/state-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: payload.jobId,
        status: "processing",
        framesCompleted: payload.framesCompleted,
        framesTotal: payload.framesTotal,
      }),
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Handles terminal job completion callbacks (POST /callbacks/complete) (R46, KTD8, KTD12).
 */
async function handleCompleteCallback(
  request: Request,
  env: EventsWorkerEnv,
): Promise<Response> {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("Modal-Signature");
  const timestampHeader = request.headers.get("Modal-Timestamp");

  // 1. Authenticate HMAC Signature (R46, AE12)
  const authResult = await verifyModalCallbackSignature({
    activeSecret: env.MODAL_CALLBACK_SECRET || "mock-secret",
    previousSecret: env.MODAL_CALLBACK_PREVIOUS_SECRET,
    signatureHeader,
    timestampHeader,
    rawBody,
  });

  if (!authResult.valid) {
    return new Response(
      JSON.stringify({
        error: authResult.errorCode,
        message: authResult.errorMessage,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let payload: CompleteCallbackPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Malformed JSON payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!payload.jobId || !payload.deliveryId || !payload.status) {
    return new Response(
      JSON.stringify({ error: "Missing required callback parameters" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 2. Check Deduplication in JobRoom DO (KTD12)
  if (env.JOB_ROOM) {
    const roomStub = env.JOB_ROOM.get(env.JOB_ROOM.idFromName(payload.jobId));
    const dedupRes = await roomStub.fetch("http://job-room/check-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId: payload.deliveryId }),
    });

    if (dedupRes.status === 409) {
      // Duplicate delivery -> Ack as handled without re-applying (Approach Step 8)
      return new Response(JSON.stringify({ success: true, duplicate: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 3. Fully Guarded Atomic Transition in D1 (KTD8)
  const db = drizzle(env.DB);
  const now = Date.now();
  const validPrecursorStates: JobStatus[] = [
    "created",
    "uploading",
    "queued",
    "processing",
  ];

  await db
    .update(jobs)
    .set({
      status: payload.status,
      resultKey:
        payload.status === "completed" ? (payload.resultKey ?? null) : null,
      denseArtifactKey:
        payload.status === "completed"
          ? (payload.denseArtifactKey ?? null)
          : null,
      durationMs: payload.durationMs ?? null,
      inferenceDurationMs: payload.inferenceDurationMs ?? null,
      coldStartDurationMs: payload.coldStartDurationMs ?? null,
      errorCode:
        payload.status === "failed"
          ? (payload.errorCode ?? "inference-error")
          : null,
      errorMessage:
        payload.status === "failed" ? (payload.errorMessage ?? null) : null,
      updatedAt: new Date(now),
    })
    .where(
      and(
        eq(jobs.id, payload.jobId),
        inArray(jobs.status, validPrecursorStates),
      ),
    );

  // 4. Project Terminal State onto JobRoom DO (KTD4)
  if (env.JOB_ROOM) {
    const roomStub = env.JOB_ROOM.get(env.JOB_ROOM.idFromName(payload.jobId));
    await roomStub.fetch("http://job-room/state-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: payload.jobId,
        status: payload.status,
        errorCode: payload.errorCode,
        errorMessage: payload.errorMessage,
        durationMs: payload.durationMs,
        inferenceDurationMs: payload.inferenceDurationMs,
        coldStartDurationMs: payload.coldStartDurationMs,
        updatedAt: now,
      }),
    });
  }

  // 5. Spend Ceiling Reconciliation in Counter DO (R111)
  if (env.COUNTER && payload.reportedCost) {
    const counterStub = env.COUNTER.get(
      env.COUNTER.idFromName("global-platform-counter"),
    );
    await counterStub
      .fetch("http://counter/spend-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cost: payload.reportedCost }),
      })
      .catch(() => {});
  }

  return new Response(JSON.stringify({ success: true, updated: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
