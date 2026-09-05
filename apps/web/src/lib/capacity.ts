/**
 * Capacity Exhaustion Detection & Countdown Helper (P4 U1, R4)
 *
 * Implements client-side capacity detection when Cloudflare drops requests at the daily
 * free-tier ceiling with unreadable 1027 responses without CORS headers.
 */

export interface CapacityStateResult {
  isExhausted: boolean;
  reason?: string;
  resetCountdown: string;
  resetsAt: Date;
}

/**
 * Calculates the next UTC midnight reset timestamp.
 */
export function getNextUtcMidnight(): Date {
  const now = new Date();
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  return next;
}

/**
 * Formats a duration until reset into "Resets in Xh Ym".
 */
export function formatResetCountdown(
  targetDate: Date = getNextUtcMidnight(),
): string {
  const now = new Date();
  const diffMs = Math.max(0, targetDate.getTime() - now.getTime());
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `Resets in ${hours}h ${minutes}m`;
}

/**
 * Probes whether an API failure was caused by platform capacity exhaustion or offline network.
 *
 * When Cloudflare hits its account ceiling (1027), the response is generated before the Worker
 * runs and lacks CORS headers, making fetch() reject opaquely with a TypeError ("Failed to fetch").
 *
 * This function tests same-origin reachability against /ping.txt. If same-origin succeeds,
 * the network is operational and the API failure is confirmed capacity exhaustion.
 */
export async function probeCapacityState(): Promise<CapacityStateResult> {
  const resetsAt = getNextUtcMidnight();
  const resetCountdown = formatResetCountdown(resetsAt);

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      isExhausted: false,
      reason: "offline",
      resetCountdown,
      resetsAt,
    };
  }

  try {
    // Probe same-origin static asset with cache-buster
    const probeRes = await fetch(`/ping.txt?_t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
    });

    if (probeRes.ok) {
      return {
        isExhausted: true,
        reason: "spend-ceiling",
        resetCountdown,
        resetsAt,
      };
    }
  } catch {
    // If same-origin also fails, client is truly offline / network partition
    return {
      isExhausted: false,
      reason: "offline",
      resetCountdown,
      resetsAt,
    };
  }

  return {
    isExhausted: false,
    resetCountdown,
    resetsAt,
  };
}
