/**
 * @sightforge/api-auth - Session & Refresh Token Lifecycle Management
 *
 * Implements RFC 9700 Refresh Token Rotation, single-batch family revocation (R9, KTD8, AE6),
 * absolute family expiry (R9), and secure cookie delivery (R10).
 */

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { refreshTokens } from "@sightforge/db";
import { generateRandomSaltHex } from "./passwords.js";

export const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 minutes (R8)
export const REFRESH_TOKEN_TTL_SECONDS = 2592000; // 30 days (R9, config/defaults.json)

/**
 * Computes SHA-256 hex digest of a string.
 */
export async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(buffer), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Generates a new cryptographically random refresh token and its SHA-256 hash.
 */
export async function generateRefreshToken(): Promise<{
  rawToken: string;
  hashedToken: string;
}> {
  const rawToken = generateRandomSaltHex(32);
  const hashedToken = await sha256Hex(rawToken);
  return { rawToken, hashedToken };
}

/**
 * Creates Set-Cookie header strings for __Host- prefixed access and refresh tokens (R10).
 */
export function buildSessionCookieHeaders(
  accessToken: string,
  refreshToken?: string,
  options: { isSecure?: boolean } = {},
): string[] {
  const isSecure = options.isSecure ?? true;
  const secureFlag = isSecure ? "; Secure" : "";

  const cookies: string[] = [
    `__Host-access_token=${encodeURIComponent(
      accessToken,
    )}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=${ACCESS_TOKEN_TTL_SECONDS}`,
    `access_token=${encodeURIComponent(
      accessToken,
    )}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=${ACCESS_TOKEN_TTL_SECONDS}`,
  ];

  if (refreshToken) {
    cookies.push(
      `__Host-refresh_token=${encodeURIComponent(
        refreshToken,
      )}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=${REFRESH_TOKEN_TTL_SECONDS}`,
      `refresh_token=${encodeURIComponent(
        refreshToken,
      )}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=${REFRESH_TOKEN_TTL_SECONDS}`,
    );
  }

  return cookies;
}

/**
 * Creates Set-Cookie header strings to clear session cookies on sign-out.
 */
export function buildLogoutCookieHeaders(
  options: { isSecure?: boolean } = {},
): string[] {
  const isSecure = options.isSecure ?? true;
  const secureFlag = isSecure ? "; Secure" : "";

  return [
    `__Host-access_token=; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=0`,
    `access_token=; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=0`,
    `__Host-refresh_token=; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=0`,
    `refresh_token=; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=0`,
  ];
}

/**
 * Extracts raw refresh token from request cookies or Authorization header.
 */
export function extractRefreshTokenFromRequest(
  request: Request,
): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith("__Host-refresh_token=")) {
        return decodeURIComponent(
          cookie.substring("__Host-refresh_token=".length),
        );
      }
      if (cookie.startsWith("refresh_token=")) {
        return decodeURIComponent(cookie.substring("refresh_token=".length));
      }
    }
  }

  const customHeader = request.headers.get("X-Refresh-Token");
  if (customHeader) {
    return customHeader.trim();
  }

  return null;
}

/**
 * Revokes all tokens in a token family in a single D1 batch operation (R9, KTD8, AE6).
 */
export async function revokeTokenFamily(
  db: D1Database,
  familyId: string,
): Promise<void> {
  const drizzleDb = drizzle(db);
  await drizzleDb
    .delete(refreshTokens)
    .where(eq(refreshTokens.familyId, familyId));
}

/**
 * Seeds a new refresh token family for a freshly registered or logged-in user.
 */
export async function createRefreshTokenFamily(
  db: D1Database,
  userId: string,
): Promise<{ rawToken: string; hashedToken: string; familyId: string }> {
  const drizzleDb = drizzle(db);
  const { rawToken, hashedToken } = await generateRefreshToken();
  const familyId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  const familyExpiresAt = expiresAt;

  await drizzleDb.insert(refreshTokens).values({
    id: crypto.randomUUID(),
    userId,
    hashedToken,
    familyId,
    isConsumed: false,
    expiresAt,
    familyExpiresAt,
    createdAt: now,
  });

  return { rawToken, hashedToken, familyId };
}
