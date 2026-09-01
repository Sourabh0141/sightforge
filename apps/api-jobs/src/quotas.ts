/**
 * @sightforge/api-jobs - Quotas & Spend Ceiling Verification
 *
 * Implements atomic user and platform daily quota enforcement (R70, R111, AE9)
 * and cost estimation reservations against the Counter Durable Object.
 */

import { HttpError } from "@sightforge/worker-kit";
import defaultsConfig from "../../../config/defaults.json" with { type: "json" };

export interface QuotaCheckResult {
  allowed: boolean;
  userCount: number;
  userLimit: number;
  globalCount: number;
}

/**
 * Checks and increments the daily job creation quota for user and global platform (R70, R111, AE9).
 */
export async function assertDailyJobQuota(
  counterNamespace: DurableObjectNamespace,
  userId: string,
): Promise<QuotaCheckResult> {
  const counterId = counterNamespace.idFromName("global-platform-counter");
  const stub = counterNamespace.get(counterId);

  const userLimit = defaultsConfig.quotas.defaultUserDailyJobsQuota; // 50
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // 1. Increment User Daily Job Quota Counter
  const userCounterKey = `jobs:user:${userId}:${today}`;
  const userRes = await stub.fetch("http://counter/rate-limit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: userCounterKey,
      policy: "daily-quota",
      limit: userLimit,
      windowSeconds: 86400,
    }),
  });

  if (!userRes.ok) {
    throw new HttpError(
      500,
      "internal-error",
      "Failed to evaluate user quota counter.",
    );
  }

  const userLimitData = (await userRes.json()) as {
    allowed: boolean;
    count: number;
    remaining: number;
  };
  if (!userLimitData.allowed) {
    throw new HttpError(
      429,
      "quota-exhausted",
      `Daily job quota of ${userLimit} jobs has been exhausted for your account. Quota resets at 00:00 UTC.`,
    );
  }

  // 2. Global Platform Counter
  const globalCounterKey = `jobs:global:${today}`;
  const globalLimit = 3300; // Platform daily free-tier ceiling
  const globalRes = await stub.fetch("http://counter/rate-limit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: globalCounterKey,
      policy: "platform-daily-quota",
      limit: globalLimit,
      windowSeconds: 86400,
    }),
  });

  const globalLimitData = (await globalRes.json()) as {
    allowed: boolean;
    count: number;
  };
  if (!globalLimitData.allowed) {
    throw new HttpError(
      429,
      "quota-exhausted",
      "SightForge platform daily free-tier capacity reached. Capacity resets at 00:00 UTC.",
    );
  }

  return {
    allowed: true,
    userCount: userLimitData.count,
    userLimit,
    globalCount: globalLimitData.count,
  };
}

/**
 * Checks whether current monthly inference spend is within critical ceiling (R111).
 */
export async function assertSpendCeiling(
  counterNamespace: DurableObjectNamespace,
  estimatedCostUsd = 0.005,
): Promise<void> {
  const counterId = counterNamespace.idFromName("global-platform-counter");
  const stub = counterNamespace.get(counterId);

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const spendKey = `spend:monthly:${currentMonth}`;
  const criticalCeilingUsd = defaultsConfig.quotas.monthlySpendCriticalUsd; // 28.00 USD

  // Check spend counter in micro-USD (integer arithmetic)
  const costMicroUsd = Math.round(estimatedCostUsd * 1_000_000);
  const ceilingMicroUsd = Math.round(criticalCeilingUsd * 1_000_000);

  const res = await stub.fetch("http://counter/rate-limit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: spendKey,
      policy: "spend-ceiling",
      limit: ceilingMicroUsd,
      windowSeconds: 2678400, // 31 days
      cost: costMicroUsd,
    }),
  });

  if (res.ok) {
    const data = (await res.json()) as { allowed: boolean };
    if (!data.allowed) {
      throw new HttpError(
        402,
        "spend-ceiling",
        "SightForge platform monthly inference budget ceiling reached. Dispatch temporarily paused.",
      );
    }
  }
}
