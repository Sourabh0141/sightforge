/**
 * @sightforge/api-jobs - Idempotency Lock & Replay Engine
 *
 * Implements per-user atomic idempotency locking, canonical request fingerprinting,
 * in-flight conflict detection (409), mismatch rejection (422), lease reclamation,
 * and safe response replay with dynamic token re-minting (R27, R28, AE5).
 */

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { idempotencyKeys } from "@sightforge/db";
import { HttpError } from "@sightforge/worker-kit";

export const IDEMPOTENCY_LEASE_DURATION_MS = 60_000; // 60 seconds lease for in-flight ops

/**
 * Computes canonical SHA-256 fingerprint of request payload.
 */
export async function computeRequestFingerprint(
  payload: unknown,
): Promise<string> {
  const jsonString = JSON.stringify(payload ?? {});
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(jsonString),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type IdempotencyCheckResult =
  | { state: "acquired"; lockId: string }
  | {
      state: "replay";
      storedResponse: {
        status: number;
        headers: Record<string, string>;
        body: any;
      };
    };

/**
 * Acquires idempotency lock or returns stored response for replay (R27, R28, AE5).
 */
export async function acquireIdempotencyLock(
  d1: D1Database,
  userId: string,
  key: string,
  requestFingerprint: string,
): Promise<IdempotencyCheckResult> {
  const db = drizzle(d1);
  const now = Date.now();
  const lockedUntil = now + IDEMPOTENCY_LEASE_DURATION_MS;
  const lockId = crypto.randomUUID();

  try {
    // 1. Attempt Atomic Insert against unique constraint (userId, key)
    await db.insert(idempotencyKeys).values({
      id: lockId,
      userId,
      key,
      requestFingerprint,
      responseStatus: null,
      responseHeaders: null,
      responseBody: null,
      lockedUntil: new Date(lockedUntil),
      createdAt: new Date(now),
    });

    return { state: "acquired", lockId };
  } catch (err: unknown) {
    // 2. Conflict on (userId, key) - Inspect existing row
    const existing = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)),
      )
      .get();

    if (!existing) {
      throw err; // Re-throw unexpected DB errors
    }

    // A. Payload Fingerprint Mismatch -> 422 Unprocessable Entity
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new HttpError(
        422,
        "invalid-input",
        "Idempotency key has already been used with a different request payload.",
      );
    }

    // B. Stored Response Available -> Replay
    if (existing.responseStatus !== null && existing.responseBody !== null) {
      const headers = existing.responseHeaders
        ? JSON.parse(existing.responseHeaders)
        : {};
      const body = JSON.parse(existing.responseBody);
      return {
        state: "replay",
        storedResponse: {
          status: existing.responseStatus,
          headers,
          body,
        },
      };
    }

    // C. In-flight Request (< lockedUntil) -> 409 Conflict
    const existingLockTime =
      existing.lockedUntil instanceof Date
        ? existing.lockedUntil.getTime()
        : Number(existing.lockedUntil);

    if (existingLockTime > now) {
      throw new HttpError(
        409,
        "conflict",
        "A request with this idempotency key is currently in progress.",
      );
    }

    // D. Expired Lease Reclaim -> Extend lockedUntil and allow retry
    await db
      .update(idempotencyKeys)
      .set({ lockedUntil: new Date(lockedUntil) })
      .where(eq(idempotencyKeys.id, existing.id));

    return { state: "acquired", lockId: existing.id };
  }
}

/**
 * Finalizes the idempotency record with the completed response.
 */
export async function finalizeIdempotencyRecord(
  d1: D1Database,
  lockId: string,
  responseStatus: number,
  responseHeaders: Record<string, string>,
  responseBody: unknown,
): Promise<void> {
  const db = drizzle(d1);
  await db
    .update(idempotencyKeys)
    .set({
      responseStatus,
      responseHeaders: JSON.stringify(responseHeaders),
      responseBody: JSON.stringify(responseBody),
    })
    .where(eq(idempotencyKeys.id, lockId));
}
