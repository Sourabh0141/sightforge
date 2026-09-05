/**
 * SightForge Error Vocabulary & Reason Code Mapping (P4 U1, R58, R72)
 *
 * Maps all Plan 2 closed reason codes to plain human-readable messages and suggested actions.
 * Prevents UI components from authoring ad-hoc error strings.
 */

export interface ErrorDescriptor {
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
}

export const ERROR_MAPPINGS: Record<string, ErrorDescriptor> = {
  "quota-exhausted": {
    title: "Daily quota exhausted",
    message:
      "You have reached your daily limit of 50 jobs. Your allowance resets at 00:00 UTC.",
    actionLabel: "View Demo Gallery",
    actionHref: "/gallery",
  },
  "spend-ceiling": {
    title: "Daily ceiling reached",
    message:
      "SightForge has reached its daily infrastructure budget ceiling. Please check back after 00:00 UTC.",
    actionLabel: "View Capacity Details",
    actionHref: "/capacity",
  },
  "counter-unavailable": {
    title: "Usage counter unavailable",
    message:
      "Unable to verify current quota allocation. Please wait a moment and try again.",
    actionLabel: "Retry",
  },
  "rate-limit-exceeded": {
    title: "Too many requests",
    message:
      "You are submitting requests too quickly. Please wait a few seconds before trying again.",
  },
  size: {
    title: "File too large",
    message:
      "The uploaded file exceeds the size limit (10 MB for images, 50 MB for videos).",
    actionLabel: "Upload Smaller File",
    actionHref: "/new",
  },
  format: {
    title: "Unsupported media format",
    message: "Only JPEG, PNG, WebP images and MP4 videos are supported.",
    actionLabel: "Upload Supported File",
    actionHref: "/new",
  },
  duration: {
    title: "Video too long",
    message: "Video duration exceeds the maximum allowed length of 30 seconds.",
    actionLabel: "Upload Shorter Clip",
    actionHref: "/new",
  },
  "codec-unsupported": {
    title: "Unsupported video codec",
    message:
      "Video must be encoded with H.264 (AVC) or H.265 (HEVC) video codec.",
    actionLabel: "Try Different Video",
    actionHref: "/new",
  },
  "source-changed": {
    title: "Source media changed",
    message: "The uploaded media changed or was modified during transmission.",
    actionLabel: "Re-upload Media",
    actionHref: "/new",
  },
  timeout: {
    title: "Inference timed out",
    message: "The analysis job exceeded the maximum execution time limit.",
    actionLabel: "Try Nano Model",
    actionHref: "/new",
  },
  "inference-error": {
    title: "Inference failed",
    message:
      "The computer vision model encountered an error while processing the frames.",
    actionLabel: "Retry Job",
  },
  unauthorized: {
    title: "Authentication required",
    message: "You must be signed in to perform this action.",
    actionLabel: "Sign In",
    actionHref: "/signin",
  },
  forbidden: {
    title: "Access denied",
    message: "You do not have permission to access or modify this resource.",
    actionLabel: "Back to Jobs",
    actionHref: "/jobs",
  },
  "not-found": {
    title: "Not found",
    message: "The requested job or resource could not be found.",
    actionLabel: "Back to Jobs",
    actionHref: "/jobs",
  },
  "invalid-input": {
    title: "Invalid parameters",
    message: "The request parameters are invalid or out of acceptable bounds.",
  },
  conflict: {
    title: "Idempotency conflict",
    message:
      "This request has already been processed with different parameters.",
  },
  "unsupported-media-type": {
    title: "Unsupported media type",
    message:
      "The media payload type is not recognized by the inference pipeline.",
  },
  "internal-error": {
    title: "Something went wrong",
    message:
      "An internal server error occurred. Our logging systems have recorded the event.",
  },
  "result-expired": {
    title: "Results expired",
    message:
      "Inference results are retained for 30 days. This job's result artifacts have passed their retention window and were permanently removed.",
    actionLabel: "Run New Job",
    actionHref: "/new",
  },
  "capacity-exhausted": {
    title: "At capacity for today",
    message:
      "SightForge runs on a free infrastructure tier with a fixed daily allowance which has been reached. Service resets at 00:00 UTC.",
    actionLabel: "View Demo Gallery",
    actionHref: "/gallery",
  },
  offline: {
    title: "Connection lost",
    message:
      "You appear to be offline. Reconnecting automatically when your network returns…",
  },
};

/**
 * Returns user-facing error details for any given error reason code.
 * Guarantees a safe fallback for unknown or undefined codes (R58).
 */
export function getErrorDescriptor(code?: string | null): ErrorDescriptor {
  if (!code) {
    return ERROR_MAPPINGS["internal-error"]!;
  }
  const normalized = code.toLowerCase().trim();
  if (normalized in ERROR_MAPPINGS) {
    return ERROR_MAPPINGS[normalized]!;
  }
  return {
    title: "Unexpected error",
    message: `An unexpected error occurred (${code}). Please try again later.`,
    actionLabel: "Back to Jobs",
    actionHref: "/jobs",
  };
}
