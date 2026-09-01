/**
 * @sightforge/events - Upload Quarantine & Media Validation
 *
 * Implements leading-byte magic number detection and size bounds verification
 * for quarantined R2 uploads (R16, R20, R21, R23, KTD7, AE2).
 */

import defaultsConfig from "../../../config/defaults.json" with { type: "json" };

export const MAX_IMAGE_SIZE_BYTES = defaultsConfig.media.maxImageSizeBytes; // 10,485,760 bytes (10MB)
export const MAX_VIDEO_SIZE_BYTES = defaultsConfig.media.maxVideoSizeBytes; // 52,428,800 bytes (50MB)

export type DetectedMediaType = "png" | "jpeg" | "webp" | "mp4";

export interface MediaValidationResult {
  valid: boolean;
  detectedFormat?: DetectedMediaType;
  errorCode?: "size" | "format";
  errorMessage?: string;
}

/**
 * Checks if a byte buffer matches PNG magic bytes: \x89PNG\r\n\x1a\n
 */
export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 && // P
    bytes[2] === 0x4e && // N
    bytes[3] === 0x47 && // G
    bytes[4] === 0x0d && // \r
    bytes[5] === 0x0a && // \n
    bytes[6] === 0x1a && // EOF
    bytes[7] === 0x0a // \n
  );
}

/**
 * Checks if a byte buffer matches JPEG magic bytes: \xff\xd8\xff
 */
export function isJpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Checks if a byte buffer matches WebP magic bytes: RIFF....WEBP
 */
export function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  // RIFF at [0..3]
  const isRiff =
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46; // F
  // WEBP at [8..11]
  const isWebpTag =
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50; // P
  return isRiff && isWebpTag;
}

/**
 * Checks if a byte buffer matches MP4 / ISO BMFF structure: [size][ftyp][major_brand]
 */
export function isMp4(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  // Box type 'ftyp' at offset 4..7
  const isFtyp =
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70; // p

  if (!isFtyp) return false;

  // Major brand check (offset 8..11) or compatible brands in first 64 bytes
  const brandChunk = new TextDecoder().decode(
    bytes.slice(8, Math.min(bytes.length, 64)),
  );
  const knownBrands = [
    "isom",
    "iso2",
    "mp41",
    "mp42",
    "avc1",
    "qt  ",
    "M4V ",
    "dash",
    "MSNV",
    "NDSC",
    "NDAS",
  ];

  return knownBrands.some((brand) => brandChunk.includes(brand));
}

/**
 * Inspects leading bytes to determine detected media format.
 */
export function detectMediaFormat(
  leadingBytes: Uint8Array,
): DetectedMediaType | null {
  if (isPng(leadingBytes)) return "png";
  if (isJpeg(leadingBytes)) return "jpeg";
  if (isWebp(leadingBytes)) return "webp";
  if (isMp4(leadingBytes)) return "mp4";
  return null;
}

/**
 * Validates uploaded media file against size policy and byte magic signatures.
 */
export function validateMediaUpload(
  expectedMediaType: "image" | "video",
  sizeBytes: number,
  leadingBytes: Uint8Array,
): MediaValidationResult {
  // 1. Enforce Size Bounds (R20, AE2)
  if (expectedMediaType === "image" && sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      errorCode: "size",
      errorMessage: `Image size of ${(sizeBytes / (1024 * 1024)).toFixed(1)}MB exceeds maximum limit of 10MB.`,
    };
  }

  if (expectedMediaType === "video" && sizeBytes > MAX_VIDEO_SIZE_BYTES) {
    return {
      valid: false,
      errorCode: "size",
      errorMessage: `Video size of ${(sizeBytes / (1024 * 1024)).toFixed(1)}MB exceeds maximum limit of 50MB.`,
    };
  }

  // 2. Enforce Magic Byte Signatures (R16, R21, KTD7)
  const detected = detectMediaFormat(leadingBytes);
  if (!detected) {
    return {
      valid: false,
      errorCode: "format",
      errorMessage:
        "Uploaded file signature does not match any accepted media format.",
    };
  }

  if (expectedMediaType === "image" && detected === "mp4") {
    return {
      valid: false,
      errorCode: "format",
      errorMessage: "Video container uploaded for image job.",
    };
  }

  if (expectedMediaType === "video" && detected !== "mp4") {
    return {
      valid: false,
      errorCode: "format",
      errorMessage: "Non-MP4 media uploaded for video job.",
    };
  }

  return {
    valid: true,
    detectedFormat: detected,
  };
}
