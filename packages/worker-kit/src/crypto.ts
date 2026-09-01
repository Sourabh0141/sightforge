/**
 * @sightforge/worker-kit - Cryptographic Primitives (WebCrypto)
 *
 * Implements constant-time comparison and HMAC-SHA256 helpers
 * conforming to R74 and KTD13.
 */

/**
 * Constant-time equality comparison preventing timing attacks (R74).
 */
export function timingSafeEqual(
  a: string | Uint8Array,
  b: string | Uint8Array,
): boolean {
  const encoder = new TextEncoder();
  const bufA = typeof a === "string" ? encoder.encode(a) : a;
  const bufB = typeof b === "string" ? encoder.encode(b) : b;

  if (bufA.byteLength !== bufB.byteLength) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    result |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }

  return result === 0;
}

export type HmacKeyUsage = "sign" | "verify";

/**
 * Imports an HMAC-SHA256 key from a string or Uint8Array.
 */
export async function importHmacKey(
  secret: string | Uint8Array,
  usages: HmacKeyUsage[] = ["sign", "verify"],
): Promise<CryptoKey> {
  const keyData =
    typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

/**
 * Computes an HMAC-SHA256 digest over the provided message.
 */
export async function hmacSha256(
  secret: string | Uint8Array,
  data: string | Uint8Array,
): Promise<Uint8Array> {
  const key = await importHmacKey(secret, ["sign"]);
  const messageData =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  return new Uint8Array(signature);
}

/**
 * Computes an HMAC-SHA256 digest and formats as lowercase hex string.
 */
export async function hmacSha256Hex(
  secret: string | Uint8Array,
  data: string | Uint8Array,
): Promise<string> {
  const digest = await hmacSha256(secret, data);
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Base64URL encoder helper.
 */
export function base64UrlEncode(data: Uint8Array | string): string {
  const buffer =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i] ?? 0);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Base64URL decoder helper.
 */
export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
