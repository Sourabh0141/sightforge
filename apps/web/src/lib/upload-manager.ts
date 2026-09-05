/**
 * SightForge Direct-to-R2 Upload Manager (P4 U5, R18, R19, R54)
 *
 * Mints presigned PUT URL via Edge API, then performs direct binary upload
 * to Cloudflare R2 storage with granular real-time progress callbacks.
 */

import { api } from "./api-client";
import type { TaskType, ModelVariant, InferenceMode } from "./types";

export interface CreateJobInput {
  task: TaskType;
  modelVariant?: ModelVariant;
  mode?: InferenceMode;
  mediaType: "image" | "video";
  originalFilename: string;
  confidenceThreshold?: number;
  sourceFps?: number;
  sampledFps?: number;
}

export interface CreateJobResponse {
  jobId: string;
  status: string;
  task: TaskType;
  mode: InferenceMode;
  mediaType: "image" | "video";
  modelVariant: ModelVariant;
  confidenceThreshold: number;
  uploadUrl: string;
  uploadContentType: string;
  mediaKey: string;
  createdAt: string;
}

export interface UploadProgress {
  loadedBytes: number;
  totalBytes: number;
  percentage: number;
  stage: "allocating" | "uploading" | "complete";
}

export interface UploadHandle {
  promise: Promise<CreateJobResponse>;
  abort: () => void;
}

/**
 * Initiates job creation on Edge API and performs direct presigned binary PUT to R2.
 */
export function uploadMediaJob(
  file: File,
  config: CreateJobInput,
  onProgress?: (progress: UploadProgress) => void,
): UploadHandle {
  let xhr: XMLHttpRequest | null = null;
  let isAborted = false;

  const promise = (async (): Promise<CreateJobResponse> => {
    // Stage 1: Allocate Job and receive S3 SigV4 presigned upload URL (R18)
    onProgress?.({
      loadedBytes: 0,
      totalBytes: file.size,
      percentage: 0,
      stage: "allocating",
    });

    const normalizedTask = (config.task as string).replace(/_/g, "-");
    const normalizedMode = (
      config.mode || (config.mediaType === "video" ? "per-frame" : "per-frame")
    ).replace(/_/g, "-");

    const idempotencyKey = crypto.randomUUID();
    const jobCreation = await api.post<CreateJobResponse>(
      "/jobs",
      {
        task: normalizedTask as TaskType,
        modelVariant: config.modelVariant || "nano",
        mode: normalizedMode as InferenceMode,
        mediaType: config.mediaType,
        originalFilename: config.originalFilename || file.name,
        confidenceThreshold: config.confidenceThreshold ?? 0.25,
        sourceFps: config.sourceFps,
        sampledFps: config.sampledFps,
      },
      {
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
      },
    );

    if (isAborted) {
      throw new Error("Upload aborted by user.");
    }

    // Stage 2: Direct binary PUT to Cloudflare R2
    onProgress?.({
      loadedBytes: 0,
      totalBytes: file.size,
      percentage: 0,
      stage: "uploading",
    });

    await new Promise<void>((resolve, reject) => {
      xhr = new XMLHttpRequest();
      xhr.open("PUT", jobCreation.uploadUrl, true);

      // Must set the exact signed Content-Type matching SigV4 grant
      xhr.setRequestHeader(
        "Content-Type",
        jobCreation.uploadContentType ||
          file.type ||
          "application/octet-stream",
      );

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentage = Math.min(
            100,
            Math.max(0, Math.round((event.loaded / event.total) * 100)),
          );
          onProgress?.({
            loadedBytes: event.loaded,
            totalBytes: event.total,
            percentage,
            stage: percentage >= 100 ? "complete" : "uploading",
          });
        }
      };

      xhr.onload = () => {
        if (xhr && xhr.status >= 200 && xhr.status < 300) {
          onProgress?.({
            loadedBytes: file.size,
            totalBytes: file.size,
            percentage: 100,
            stage: "complete",
          });
          resolve();
        } else {
          reject(
            new Error(
              `Direct storage upload failed with HTTP status ${xhr?.status || 0}`,
            ),
          );
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network error during direct storage upload."));
      };

      xhr.onabort = () => {
        reject(new Error("Upload aborted."));
      };

      xhr.send(file);
    });

    return jobCreation;
  })();

  return {
    promise,
    abort: () => {
      isAborted = true;
      if (xhr) {
        xhr.abort();
      }
    },
  };
}
