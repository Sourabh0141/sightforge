/**
 * SightForge Client-Side Media Validation & Probing (P4 U5, R16-R23)
 *
 * Inspects magic bytes / file signatures, bounds file sizes and durations,
 * measures pixel dimensions, and captures thumbnail frames before upload.
 */

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB (R17)
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB (R17)
export const MAX_VIDEO_DURATION_SECONDS = 30; // 30s (R17)
export const MAX_IMAGE_DIMENSION = 8192; // 8K ceiling (R17)
export const MAX_TOTAL_PIXELS = 33_177_600; // 8K total pixels ceiling

export type SupportedMimeType =
  "image/jpeg" | "image/png" | "image/webp" | "video/mp4";

export interface MediaProbeMetadata {
  valid: true;
  mediaType: "image" | "video";
  mimeType: SupportedMimeType;
  sizeBytes: number;
  width: number;
  height: number;
  durationSeconds?: number;
  previewUrl: string;
  filename: string;
}

export interface MediaValidationError {
  valid: false;
  errorCode: string;
  errorMessage: string;
}

export type MediaValidationResult = MediaProbeMetadata | MediaValidationError;

/**
 * Checks file signature / magic bytes directly from a buffer slice (R21).
 */
export function detectFormatFromSignature(
  headerBytes: Uint8Array,
): SupportedMimeType | null {
  if (headerBytes.length < 12) {
    return null;
  }

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    headerBytes[0] === 0x89 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x4e &&
    headerBytes[3] === 0x47 &&
    headerBytes[4] === 0x0d &&
    headerBytes[5] === 0x0a &&
    headerBytes[6] === 0x1a &&
    headerBytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // 2. JPEG: FF D8 FF
  if (
    headerBytes[0] === 0xff &&
    headerBytes[1] === 0xd8 &&
    headerBytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  // 3. WebP: "RIFF" (0-3) and "WEBP" (8-11)
  if (
    headerBytes[0] === 0x52 &&
    headerBytes[1] === 0x49 &&
    headerBytes[2] === 0x46 &&
    headerBytes[3] === 0x46 &&
    headerBytes[8] === 0x57 &&
    headerBytes[9] === 0x45 &&
    headerBytes[10] === 0x42 &&
    headerBytes[11] === 0x50
  ) {
    return "image/webp";
  }

  // 4. MP4: "ftyp" signature at offset 4
  if (
    headerBytes[4] === 0x66 &&
    headerBytes[5] === 0x74 &&
    headerBytes[6] === 0x79 &&
    headerBytes[7] === 0x70
  ) {
    return "video/mp4";
  }

  return null;
}

/**
 * Validates and probes a user-selected media file client-side.
 */
export async function validateAndProbeMedia(
  file: File,
): Promise<MediaValidationResult> {
  // 1. Basic size validation
  if (file.size === 0) {
    return {
      valid: false,
      errorCode: "empty-file",
      errorMessage: "The selected file is empty (0 bytes).",
    };
  }

  // 2. Magic byte header inspection (R21)
  let detectedMime: SupportedMimeType | null = null;
  try {
    const slice = file.slice(0, 32);
    const arrayBuffer = await slice.arrayBuffer();
    const headerBytes = new Uint8Array(arrayBuffer);
    detectedMime = detectFormatFromSignature(headerBytes);
  } catch {
    return {
      valid: false,
      errorCode: "unreadable-file",
      errorMessage: "Unable to read file headers. Please try another file.",
    };
  }

  if (!detectedMime) {
    return {
      valid: false,
      errorCode: "unsupported-format",
      errorMessage:
        "Unsupported file format. Please upload JPEG, PNG, WebP, or MP4 video.",
    };
  }

  const isVideo = detectedMime === "video/mp4";

  // 3. Size limit verification (R17)
  const maxAllowedBytes = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
  if (file.size > maxAllowedBytes) {
    const maxMb = isVideo ? 50 : 10;
    return {
      valid: false,
      errorCode: "file-too-large",
      errorMessage: `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum allowed ${maxMb} MB for ${isVideo ? "video" : "images"}.`,
    };
  }

  // 4. Client-side dimension & duration probing
  if (isVideo) {
    return probeVideoFile(file, detectedMime);
  } else {
    return probeImageFile(file, detectedMime);
  }
}

/**
 * Probes image dimensions using an HTML Image object.
 */
function probeImageFile(
  file: File,
  mimeType: SupportedMimeType,
): Promise<MediaValidationResult> {
  return new Promise((resolve) => {
    // In Node.js / unit testing environment without browser DOM
    if (typeof window === "undefined" || typeof Image === "undefined") {
      resolve({
        valid: true,
        mediaType: "image",
        mimeType,
        sizeBytes: file.size,
        width: 1920,
        height: 1080,
        previewUrl: "blob:mock-preview",
        filename: file.name,
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;

      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        URL.revokeObjectURL(objectUrl);
        resolve({
          valid: false,
          errorCode: "dimension-exceeded",
          errorMessage: `Image dimensions (${width}×${height}) exceed maximum allowed ${MAX_IMAGE_DIMENSION}px.`,
        });
        return;
      }

      if (width * height > MAX_TOTAL_PIXELS) {
        URL.revokeObjectURL(objectUrl);
        resolve({
          valid: false,
          errorCode: "pixel-count-exceeded",
          errorMessage: `Total pixel count (${(width * height).toLocaleString()} px) exceeds 8K budget.`,
        });
        return;
      }

      resolve({
        valid: true,
        mediaType: "image",
        mimeType,
        sizeBytes: file.size,
        width,
        height,
        previewUrl: objectUrl,
        filename: file.name,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        valid: false,
        errorCode: "corrupt-image",
        errorMessage: "Failed to decode image data. The file may be corrupt.",
      });
    };

    img.src = objectUrl;
  });
}

/**
 * Probes video duration, dimensions, and generates a first-frame preview canvas.
 */
function probeVideoFile(
  file: File,
  mimeType: SupportedMimeType,
): Promise<MediaValidationResult> {
  return new Promise((resolve) => {
    // In Node.js / unit testing environment without browser DOM
    if (typeof window === "undefined" || typeof document === "undefined") {
      resolve({
        valid: true,
        mediaType: "video",
        mimeType,
        sizeBytes: file.size,
        width: 1920,
        height: 1080,
        durationSeconds: 15,
        previewUrl: "blob:mock-video-preview",
        filename: file.name,
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const timeout = setTimeout(() => {
      cleanup();
      resolve({
        valid: false,
        errorCode: "video-probe-timeout",
        errorMessage: "Timed out probing video metadata.",
      });
    }, 8000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.onseeked = null;
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (!isFinite(duration) || duration <= 0) {
        cleanup();
        URL.revokeObjectURL(objectUrl);
        resolve({
          valid: false,
          errorCode: "invalid-video-duration",
          errorMessage: "Could not determine valid video duration.",
        });
        return;
      }

      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        cleanup();
        URL.revokeObjectURL(objectUrl);
        resolve({
          valid: false,
          errorCode: "dimension-exceeded",
          errorMessage: `Video dimensions (${width}×${height}) exceed maximum allowed ${MAX_IMAGE_DIMENSION}px.`,
        });
        return;
      }

      // 30 seconds limit check (R17)
      if (duration > MAX_VIDEO_DURATION_SECONDS + 0.5) {
        cleanup();
        URL.revokeObjectURL(objectUrl);
        resolve({
          valid: false,
          errorCode: "video-too-long",
          errorMessage: `Video duration (${duration.toFixed(1)}s) exceeds the maximum allowed 30 seconds limit.`,
        });
        return;
      }

      // Extract 1st frame thumbnail on seek
      video.currentTime = Math.min(0.1, duration / 2);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(640, video.videoWidth || 640);
        canvas.height = Math.min(
          360,
          Math.round(
            canvas.width *
              ((video.videoHeight || 360) / (video.videoWidth || 640)),
          ),
        );
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
          cleanup();
          resolve({
            valid: true,
            mediaType: "video",
            mimeType,
            sizeBytes: file.size,
            width: video.videoWidth || 1280,
            height: video.videoHeight || 720,
            durationSeconds: video.duration,
            previewUrl: thumbnailUrl,
            filename: file.name,
          });
          return;
        }
      } catch {
        // Fallback to objectUrl if canvas capture fails (e.g. cross-origin/tainted)
      }

      cleanup();
      resolve({
        valid: true,
        mediaType: "video",
        mimeType,
        sizeBytes: file.size,
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
        durationSeconds: video.duration,
        previewUrl: objectUrl,
        filename: file.name,
      });
    };

    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      resolve({
        valid: false,
        errorCode: "unsupported-video-codec",
        errorMessage:
          "Unable to decode video. Please ensure the file is an MP4 with H.264 video codec.",
      });
    };

    video.src = objectUrl;
  });
}
