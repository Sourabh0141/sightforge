/**
 * @sightforge/events - Modal Callback Signature Verification
 *
 * Implements HMAC-SHA256 callback authentication over timestamp-concatenated body,
 * timestamp replay window validation, and two-secret rotation overlap (R46, KTD12, AE12).
 */

import { timingSafeEqual } from "@sightforge/worker-kit";

export const CALLBACK_TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes replay window

/**
 * Computes hex-encoded HMAC-SHA256 of a string payload using WebCrypto.
 */
export async function computeHmacSha256Hex(
  secret: string,
  data: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data),
  );
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface VerifyCallbackOptions {
  activeSecret: string;
  previousSecret?: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  rawBody: string;
  nowEpochSeconds?: number;
}

export interface VerifyCallbackResult {
  valid: boolean;
  errorCode?: "missing-headers" | "stale-timestamp" | "invalid-signature";
  errorMessage?: string;
}

/**
 * Verifies inbound Modal callback HMAC signature with 2-secret rotation and replay protection.
 */
export async function verifyModalCallbackSignature(
  options: VerifyCallbackOptions,
): Promise<VerifyCallbackResult> {
  const {
    activeSecret,
    previousSecret,
    signatureHeader,
    timestampHeader,
    rawBody,
    nowEpochSeconds = Math.floor(Date.now() / 1000),
  } = options;

  if (!signatureHeader || !timestampHeader) {
    return {
      valid: false,
      errorCode: "missing-headers",
      errorMessage: "Missing Modal-Signature or Modal-Timestamp header.",
    };
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    return {
      valid: false,
      errorCode: "stale-timestamp",
      errorMessage: "Invalid Modal-Timestamp format.",
    };
  }

  // 1. Enforce 5-minute replay window (R46)
  if (
    Math.abs(nowEpochSeconds - timestamp) > CALLBACK_TIMESTAMP_TOLERANCE_SECONDS
  ) {
    return {
      valid: false,
      errorCode: "stale-timestamp",
      errorMessage:
        "Callback timestamp is outside the 5-minute tolerance window.",
    };
  }

  // 2. Compute canonical signing input: `${timestamp}.${body}`
  const signingInput = `${timestamp}.${rawBody}`;

  // 3. Verify against activeSecret in constant time
  if (activeSecret) {
    const expectedActive = await computeHmacSha256Hex(
      activeSecret,
      signingInput,
    );
    if (timingSafeEqual(expectedActive, signatureHeader.toLowerCase())) {
      return { valid: true };
    }
  }

  // 4. Verify against previousSecret during rotation overlap
  if (previousSecret) {
    const expectedPrevious = await computeHmacSha256Hex(
      previousSecret,
      signingInput,
    );
    if (timingSafeEqual(expectedPrevious, signatureHeader.toLowerCase())) {
      return { valid: true };
    }
  }

  return {
    valid: false,
    errorCode: "invalid-signature",
    errorMessage: "Invalid callback HMAC signature.",
  };
}
