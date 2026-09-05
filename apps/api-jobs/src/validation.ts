/**
 * @sightforge/api-jobs - Validation & Input Sanitization
 *
 * Implements job creation payload validation, task-mode compatibility enforcement (R41-R43, AE4),
 * model variant validation (R36), confidence threshold checks, frame rate validation,
 * and filename sanitization (R19).
 */

import {
  MEDIA_TYPES,
  MediaType,
  PROCESSING_MODES,
  ProcessingMode,
  VISION_TASKS,
  VisionTask,
} from "@sightforge/db";
import { HttpError } from "@sightforge/worker-kit";
import defaultsConfig from "../../../config/defaults.json";

/**
 * Tasks eligible for tracking mode (R42, R43, AE4).
 */
export const TRACKING_ELIGIBLE_TASKS: readonly VisionTask[] = [
  "detection",
  "instance-segmentation",
  "pose",
  "obb",
] as const;

export interface CreateJobInput {
  task: VisionTask;
  mode: ProcessingMode;
  mediaType: MediaType;
  modelVariant?: string;
  originalFilename?: string;
  confidenceThreshold?: number;
  sourceFps?: number;
  sampledFps?: number;
}

export interface ValidatedJobConfig {
  task: VisionTask;
  mode: ProcessingMode;
  mediaType: MediaType;
  modelVariant: string;
  originalFilename: string;
  confidenceThreshold: number;
  sourceFps: number | null;
  sampledFps: number | null;
  mediaKey: string;
  resultKey: string;
  denseArtifactKey: string | null;
}

/**
 * Sanitizes original filename: strips directory traversal sequences,
 * normalizes Unicode NFKC, removes paths, and bounds length (R19).
 */
export function sanitizeFilename(rawFilename?: string): string {
  if (!rawFilename || typeof rawFilename !== "string") {
    return "unnamed_media";
  }

  // Normalize Unicode
  let clean = rawFilename.normalize("NFKC").trim();

  // Strip directory paths (Windows & POSIX)
  clean = clean.replace(/^.*[\\/]/, "");

  // Strip control characters and path traversal sequences
  clean = clean.replace(/[\x00-\x1F\x7F]/g, "").replace(/\.\.+/g, ".");

  // Bound length to 255 characters
  if (clean.length > 255) {
    clean = clean.slice(0, 255);
  }

  return clean || "unnamed_media";
}

/**
 * Validates job creation parameters and derives consistent configuration (R36, R41-R43, AE4).
 */
export function validateCreateJobInput(
  input: unknown,
  userId: string,
  jobId: string,
): ValidatedJobConfig {
  if (!input || typeof input !== "object") {
    throw new HttpError(
      400,
      "invalid-input",
      "Request body must be a valid JSON object.",
    );
  }

  const raw = input as Partial<CreateJobInput>;

  // 1. Task Validation
  if (!raw.task || !VISION_TASKS.includes(raw.task as VisionTask)) {
    throw new HttpError(
      400,
      "invalid-input",
      `Invalid vision task. Must be one of: ${VISION_TASKS.join(", ")}.`,
    );
  }
  const task = raw.task as VisionTask;

  // 2. Mode Validation
  if (!raw.mode || !PROCESSING_MODES.includes(raw.mode as ProcessingMode)) {
    throw new HttpError(
      400,
      "invalid-input",
      `Invalid processing mode. Must be one of: ${PROCESSING_MODES.join(", ")}.`,
    );
  }
  const mode = raw.mode as ProcessingMode;

  // 3. Task-Mode Compatibility Check (R42, R43, AE4)
  if (mode === "tracking" && !TRACKING_ELIGIBLE_TASKS.includes(task)) {
    throw new HttpError(
      400,
      "invalid-input",
      `Tracking mode is only available for detection, instance-segmentation, pose, and obb tasks. Task '${task}' only supports 'per-frame' mode.`,
    );
  }

  // 4. Media Type Validation
  if (!raw.mediaType || !MEDIA_TYPES.includes(raw.mediaType as MediaType)) {
    throw new HttpError(
      400,
      "invalid-input",
      `Invalid media type. Must be one of: ${MEDIA_TYPES.join(", ")}.`,
    );
  }
  const mediaType = raw.mediaType as MediaType;

  // Tracking requires video media type
  if (mode === "tracking" && mediaType !== "video") {
    throw new HttpError(
      400,
      "invalid-input",
      "Tracking mode is only available for video media.",
    );
  }

  // 5. Model Variant Validation (R36)
  const defaultTaskVariant =
    (defaultsConfig.models.defaultVariantPerTask as Record<string, string>)[
      task
    ] ?? "yolo26n";
  let modelVariant = raw.modelVariant?.trim() || defaultTaskVariant;
  if (
    typeof modelVariant !== "string" ||
    modelVariant.length < 2 ||
    modelVariant.length > 32
  ) {
    throw new HttpError(
      400,
      "invalid-input",
      "Invalid model variant specification.",
    );
  }

  // 6. Confidence Threshold Validation (single numeric value 0.0 - 1.0)
  let confidenceThreshold = 0.25;
  if (raw.confidenceThreshold !== undefined) {
    if (
      typeof raw.confidenceThreshold !== "number" ||
      Number.isNaN(raw.confidenceThreshold) ||
      raw.confidenceThreshold < 0.01 ||
      raw.confidenceThreshold > 1.0
    ) {
      throw new HttpError(
        400,
        "invalid-input",
        "Confidence threshold must be a number between 0.01 and 1.00.",
      );
    }
    confidenceThreshold = raw.confidenceThreshold;
  }

  // 7. Video Frame Rates Validation (R41, R42)
  let sourceFps: number | null = null;
  let sampledFps: number | null = null;

  if (mediaType === "video") {
    if (mode === "per-frame") {
      const minFps = defaultsConfig.video.minPerFrameSamplingFps; // 2
      const maxFps = defaultsConfig.video.maxPerFrameSamplingFps; // 10
      const defaultFps = defaultsConfig.video.defaultPerFrameSamplingFps; // 5

      sampledFps = raw.sampledFps ?? defaultFps;
      if (
        typeof sampledFps !== "number" ||
        sampledFps < minFps ||
        sampledFps > maxFps
      ) {
        throw new HttpError(
          400,
          "invalid-input",
          `Per-frame sampling rate must be between ${minFps} and ${maxFps} fps.`,
        );
      }
    } else if (mode === "tracking") {
      const maxTrackingFps = defaultsConfig.video.maxTrackingFps; // 30
      sourceFps = raw.sourceFps ?? maxTrackingFps;
      if (
        typeof sourceFps !== "number" ||
        sourceFps < 1 ||
        sourceFps > maxTrackingFps
      ) {
        throw new HttpError(
          400,
          "invalid-input",
          `Tracking source frame rate must be between 1 and ${maxTrackingFps} fps.`,
        );
      }
      sampledFps = sourceFps;
    }
  }

  // 8. Sanitized Filename & Storage Keys (R19)
  const originalFilename = sanitizeFilename(raw.originalFilename);
  const ext = originalFilename.includes(".")
    ? (originalFilename.split(".").pop()?.toLowerCase() ?? "bin")
    : mediaType === "video"
      ? "mp4"
      : "png";

  const mediaKey = `users/${userId}/media/${jobId}.${ext}`;
  const resultKey = `users/${userId}/results/${jobId}.json`;

  // Dense artifact key (for instance-segmentation, semantic-segmentation, depth)
  const hasDenseArtifact = [
    "instance-segmentation",
    "semantic-segmentation",
    "depth",
  ].includes(task);
  const denseArtifactKey = hasDenseArtifact
    ? `users/${userId}/results/${jobId}_dense.png`
    : null;

  return {
    task,
    mode,
    mediaType,
    modelVariant,
    originalFilename,
    confidenceThreshold,
    sourceFps,
    sampledFps,
    mediaKey,
    resultKey,
    denseArtifactKey,
  };
}
