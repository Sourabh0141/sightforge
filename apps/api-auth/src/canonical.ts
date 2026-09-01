/**
 * @sightforge/api-auth - Email Canonicalization & Validation
 *
 * Enforces unified email canonicalization (lowercase + Unicode NFKC)
 * and strict syntax validation across salt lookup, registration, and login (R6, R11).
 */

import { HttpError } from "@sightforge/worker-kit";

// Standard RFC 5322 compatible email pattern
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Normalizes email address consistently via lowercase and Unicode NFKC normalization.
 */
export function canonicalizeEmail(email: string): string {
  if (!email || typeof email !== "string") {
    return "";
  }
  return email.trim().toLowerCase().normalize("NFKC");
}

/**
 * Validates email syntax.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") {
    return false;
  }
  const canonical = canonicalizeEmail(email);
  if (canonical.length < 3 || canonical.length > 254) {
    return false;
  }
  return EMAIL_REGEX.test(canonical);
}

/**
 * Validates and returns canonical email or throws structured 400 error.
 */
export function assertEmail(email: unknown): string {
  if (typeof email !== "string" || !isValidEmail(email)) {
    throw new HttpError(400, "invalid-input", "Invalid email address format.");
  }
  return canonicalizeEmail(email);
}
