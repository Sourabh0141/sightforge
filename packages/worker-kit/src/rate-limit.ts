/**
 * @sightforge/worker-kit - Two-Pass Rate Limiting & Quota Middleware
 *
 * Implements IP and User rate limiting with fail-closed posture per KTD6, R70, and R111.
 */

import { getClientIpPrefix } from "./ip.js";
import { HttpError } from "./errors.js";
import type { RateLimitResult, QuotaResult } from "./counter.js";

export interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
  policyName?: string;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): {
    fetch(request: Request | string, init?: RequestInit): Promise<Response>;
  };
}

/**
 * Executes a rate-limit check against the Counter Durable Object.
 * Fails closed (503 / counter-unavailable) if the object throws or is unreachable (KTD6).
 */
export async function checkCounterRateLimit(
  counterNamespace: DurableObjectNamespaceLike,
  subject: string,
  policyName: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const id = counterNamespace.idFromName(subject);
    const stub = counterNamespace.get(id);
    const response = await stub.fetch("http://counter/rate-limit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        policy: policyName,
        limit,
        windowSeconds,
      }),
    });

    if (!response.ok) {
      throw new Error(`Counter returned status ${response.status}`);
    }

    return (await response.json()) as RateLimitResult;
  } catch (err) {
    // Fail closed per KTD6 and R68
    throw new HttpError(
      503,
      "counter-unavailable",
      "Rate limiting service is temporarily unavailable.",
    );
  }
}

/**
 * Pass 1: Rate limiting keyed on connecting IP network prefix before token verification (KTD6).
 */
export async function assertRateLimitIp(
  request: Request,
  counterNamespace: DurableObjectNamespaceLike,
  policy: RateLimitPolicy = {
    limit: 120,
    windowSeconds: 60,
    policyName: "ip-default",
  },
): Promise<void> {
  const ipPrefix = getClientIpPrefix(request);
  const result = await checkCounterRateLimit(
    counterNamespace,
    ipPrefix,
    policy.policyName || "ip-default",
    policy.limit,
    policy.windowSeconds,
  );

  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      result.reset - Math.floor(Date.now() / 1000),
    );
    throw new HttpError(
      429,
      "rate-limit-exceeded",
      "Too many requests from this IP prefix. Please slow down.",
      undefined,
      { "Retry-After": retryAfter.toString() },
    );
  }
}

/**
 * Pass 2: Rate limiting keyed on authenticated User ID after token verification (KTD6).
 */
export async function assertRateLimitUser(
  userId: string,
  counterNamespace: DurableObjectNamespaceLike,
  policy: RateLimitPolicy = {
    limit: 300,
    windowSeconds: 60,
    policyName: "user-default",
  },
): Promise<void> {
  const result = await checkCounterRateLimit(
    counterNamespace,
    `user:${userId}`,
    policy.policyName || "user-default",
    policy.limit,
    policy.windowSeconds,
  );

  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      result.reset - Math.floor(Date.now() / 1000),
    );
    throw new HttpError(
      429,
      "rate-limit-exceeded",
      "Too many requests for this account. Please slow down.",
      undefined,
      { "Retry-After": retryAfter.toString() },
    );
  }
}

/**
 * Checks or consumes daily user quota for inference jobs (R111).
 */
export async function assertDailyQuota(
  userId: string,
  counterNamespace: DurableObjectNamespaceLike,
  limit = 50,
  consume = true,
): Promise<QuotaResult> {
  try {
    const id = counterNamespace.idFromName(`quota:${userId}`);
    const stub = counterNamespace.get(id);
    const endpoint = consume
      ? "http://counter/quota/consume"
      : "http://counter/quota/check";

    const response = await stub.fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, limit }),
    });

    if (!response.ok) {
      throw new Error(`Counter returned status ${response.status}`);
    }

    const result = (await response.json()) as QuotaResult;
    if (!result.allowed) {
      const retryAfter = Math.max(
        1,
        result.reset - Math.floor(Date.now() / 1000),
      );
      throw new HttpError(
        429,
        "quota-exhausted",
        "Daily job quota has been exhausted. Quota resets at 00:00 UTC.",
        undefined,
        { "Retry-After": retryAfter.toString() },
      );
    }

    return result;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(
      503,
      "counter-unavailable",
      "Quota service is temporarily unavailable.",
    );
  }
}
