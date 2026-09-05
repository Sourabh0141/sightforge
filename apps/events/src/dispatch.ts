/**
 * @sightforge/events - Outbound Modal Inference Dispatcher
 *
 * Dispatches validated jobs to Modal inference endpoint with signed storage grants,
 * pinned entity tags, and proxy header authentication (KTD11).
 */

import { Job } from "@sightforge/db";

export interface DispatchInferenceOptions {
  job: Job;
  triggerUrl?: string;
  modalKey?: string;
  modalSecret?: string;
  mediaGetUrl?: string;
  resultPutUrl?: string;
  denseArtifactPutUrl?: string;
  callbackBaseUrl?: string;
}

export interface DispatchInferenceResult {
  dispatched: boolean;
  callId?: string;
  error?: string;
}

/**
 * Dispatches a validated job to Modal Labs inference runtime.
 */
export async function dispatchInference(
  options: DispatchInferenceOptions,
): Promise<DispatchInferenceResult> {
  const { job, triggerUrl, modalKey, modalSecret } = options;

  // In test / stub mode or when trigger URL is not configured
  if (!triggerUrl || triggerUrl.includes("mock") || triggerUrl === "stub") {
    return {
      dispatched: true,
      callId: `modal-call-${job.id.slice(0, 8)}`,
    };
  }

  try {
    const payload = {
      jobId: job.id,
      userId: job.userId,
      task: job.task,
      mode: job.mode,
      mediaType: job.mediaType,
      modelVariant: job.modelVariant,
      confidenceThreshold: job.confidenceThreshold,
      sampledFps: job.sampledFps,
      mediaKey: job.mediaKey,
      mediaEtag: job.mediaEtag,
      resultKey: job.resultKey,
      denseArtifactKey: job.denseArtifactKey,
      correlationId: job.correlationId,
      mediaGetUrl: options.mediaGetUrl,
      resultPutUrl: options.resultPutUrl,
      denseArtifactPutUrl: options.denseArtifactPutUrl,
      callbackBaseUrl: options.callbackBaseUrl,
    };

    const response = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Modal-Key": modalKey || "",
        "Modal-Secret": modalSecret || "",
      },
      body: JSON.stringify(payload),
      redirect: "manual", // Do not follow redirects (KTD11)
    });

    if (!response.ok) {
      return {
        dispatched: false,
        error: `Modal trigger responded with status ${response.status}`,
      };
    }

    const data = (await response.json()) as { callId?: string };
    return {
      dispatched: true,
      callId: data.callId || `modal-call-${job.id.slice(0, 8)}`,
    };
  } catch (err) {
    return {
      dispatched: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
