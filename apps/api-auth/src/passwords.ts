/**
 * @sightforge/api-auth - Password & Derivation Utilities
 *
 * Implements deterministic anti-enumeration pseudo-salt generation (R6, AE1),
 * server-side fast hashing with salt & pepper (R7, KTD13), and password policy bounds (R11).
 */

import { hmacSha256Hex, HttpError } from "@sightforge/worker-kit";

export interface Argon2Params {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  version: string;
}

export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memoryKiB: 19456,
  iterations: 2,
  parallelism: 1,
  version: "0x13",
};

/**
 * Derives a deterministic pseudo-salt for unknown email addresses.
 * Guarantees identical shape, length, and derivation timing profile as a registered account (R6, AE1).
 */
export async function derivePseudoSalt(
  canonicalEmail: string,
  saltKey?: string,
): Promise<string> {
  const key = saltKey || "sightforge-pseudo-salt-deterministic-key";
  const hex = await hmacSha256Hex(
    key,
    `sightforge-pseudo-salt:${canonicalEmail}`,
  );
  return hex.substring(0, 32); // 16 bytes in hex representation
}

/**
 * Generates a cryptographically secure random salt hex string.
 */
export function generateRandomSaltHex(bytes: number = 16): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes the server-side fast hash of the client-derived Argon2 key using server salt and pepper (R7, KTD13).
 */
export async function computeServerFastHash(
  clientDerivedKey: string,
  serverSalt: string,
  pepper?: string,
): Promise<string> {
  const effectivePepper = pepper || "sightforge-server-password-pepper-default";
  const signingInput = `${serverSalt}:${clientDerivedKey}`;
  return hmacSha256Hex(effectivePepper, signingInput);
}

/**
 * Enforces password length bounds and client-derived key syntax (R11).
 */
export function assertPasswordPolicy(
  passwordLength?: number,
  clientDerivedKey?: string,
): void {
  if (passwordLength !== undefined) {
    if (
      typeof passwordLength !== "number" ||
      passwordLength < 10 ||
      passwordLength > 128
    ) {
      throw new HttpError(
        400,
        "invalid-input",
        "Password length must be between 10 and 128 characters.",
      );
    }
  }

  if (clientDerivedKey !== undefined) {
    if (
      typeof clientDerivedKey !== "string" ||
      clientDerivedKey.trim().length < 32 ||
      clientDerivedKey.length > 256
    ) {
      throw new HttpError(
        400,
        "invalid-input",
        "Client-derived credential key is malformed or invalid.",
      );
    }
  }
}
