/**
 * @sightforge/worker-kit - Stateless JWT Verification & Signing
 *
 * Implements algorithm pinning (HS256), two-key rotation overlap,
 * and stateless signature verification per R8, R12, and R15.
 */

import {
  base64UrlDecode,
  base64UrlEncode,
  hmacSha256,
  timingSafeEqual,
} from "./crypto.js";
import { HttpError } from "./errors.js";

export interface JwtHeader {
  alg: string;
  typ?: string;
  kid?: string;
}

export interface JwtPayload {
  sub: string; // User ID
  email?: string;
  exp: number; // Expiration epoch seconds
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface TokenVerificationKeys {
  activeKey: string;
  previousKey?: string;
}

/**
 * Creates a signed HS256 JWT string.
 */
export async function signJwt(
  payload: JwtPayload,
  secret: string,
  headerExtras: Record<string, unknown> = {},
): Promise<string> {
  const header: JwtHeader = {
    alg: "HS256",
    typ: "JWT",
    ...headerExtras,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = await hmacSha256(secret, signingInput);
  const signatureB64 = base64UrlEncode(signature);

  return `${signingInput}.${signatureB64}`;
}

/**
 * Verifies a JWT against an active key and optional previous key during rotation.
 * Strictly enforces algorithm pinning to HS256 (R12).
 */
export async function verifyJwt(
  token: string,
  keys: TokenVerificationKeys | string,
): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new HttpError(401, "unauthorized", "Malformed token structure.");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new HttpError(401, "unauthorized", "Malformed token structure.");
  }
  const signingInput = `${headerB64}.${payloadB64}`;

  // 1. Decode and validate header: PINNED ALGORITHM ENFORCEMENT (R12)
  let header: JwtHeader;
  try {
    const headerJson = new TextDecoder().decode(base64UrlDecode(headerB64));
    header = JSON.parse(headerJson);
  } catch {
    throw new HttpError(401, "unauthorized", "Invalid token header.");
  }

  if (header.alg !== "HS256") {
    throw new HttpError(
      401,
      "unauthorized",
      `Disallowed signing algorithm: ${header.alg}. Only HS256 is accepted.`,
    );
  }

  // 2. Decode payload
  let payload: JwtPayload;
  try {
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    payload = JSON.parse(payloadJson);
  } catch {
    throw new HttpError(401, "unauthorized", "Invalid token payload.");
  }

  // 3. Expiration validation (R8)
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new HttpError(401, "unauthorized", "Token has expired.");
  }

  // 4. Signature verification with two-key overlap (R15)
  const activeKey = (typeof keys === "string" ? keys : keys.activeKey) || "";
  const previousKey = typeof keys === "string" ? undefined : keys.previousKey;

  const rawSignature = base64UrlDecode(signatureB64);
  const expectedSigActive = await hmacSha256(activeKey, signingInput);

  if (timingSafeEqual(rawSignature, expectedSigActive)) {
    return payload;
  }

  if (previousKey) {
    const expectedSigPrev = await hmacSha256(previousKey, signingInput);
    if (timingSafeEqual(rawSignature, expectedSigPrev)) {
      return payload;
    }
  }

  throw new HttpError(401, "unauthorized", "Invalid token signature.");
}

/**
 * Extracts JWT token from __Host-access_token cookie or Authorization Bearer header.
 */
export function extractTokenFromRequest(request: Request): string | null {
  // 1. Check __Host-access_token cookie (R10)
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith("__Host-access_token=")) {
        return decodeURIComponent(
          cookie.substring("__Host-access_token=".length),
        );
      }
      if (cookie.startsWith("access_token=")) {
        return decodeURIComponent(cookie.substring("access_token=".length));
      }
    }
  }

  // 2. Check Authorization Bearer header
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring("Bearer ".length).trim();
  }

  return null;
}
