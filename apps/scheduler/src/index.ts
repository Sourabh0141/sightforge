/**
 * @sightforge/scheduler - Scheduled Maintenance Worker
 *
 * Dispatches automated retention enforcement, stuck job timeouts, orphan storage reclamation,
 * and auth hygiene routines within Cloudflare's 50-subrequest ceiling (R100–R104, R112, KTD9, AE8).
 */

import {
  SchedulerWorkerEnv,
  SweepSummary,
  sweepStuckJobs,
  sweepCompletedMedia,
  sweepFailedMedia,
  sweepCompletedResults,
  sweepQuarantinedUploads,
  sweepCancelledResults,
  sweepAuthAndIdempotency,
  sweepAccountDeletionBackstop,
} from "./sweepers.js";

export default {
  /**
   * Cron Trigger Handler (Triggers: every 15 minutes and daily at midnight)
   */
  async scheduled(
    event: ScheduledEvent,
    env: SchedulerWorkerEnv,
    _ctx?: ExecutionContext,
  ): Promise<void> {
    const nowMs = event.scheduledTime || Date.now();
    await runAllMaintenanceSweeps(env, nowMs);
  },

  /**
   * HTTP Fetch Handler: Health Check & Diagnostic Manual Trigger
   */
  async fetch(request: Request, env: SchedulerWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === "/" || path === "/health") {
      return new Response(
        JSON.stringify({ service: "sightforge-scheduler", status: "ready" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // Manual / Diagnostic Sweep Trigger (POST /trigger-sweep)
    if (path === "/trigger-sweep" && method === "POST") {
      const summaries = await runAllMaintenanceSweeps(env, Date.now());
      return new Response(JSON.stringify({ success: true, summaries }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Endpoint not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
};

/**
 * Runs all maintenance sweepers sequentially with fault isolation and budget capping (KTD9).
 */
export async function runAllMaintenanceSweeps(
  env: SchedulerWorkerEnv,
  nowMs = Date.now(),
): Promise<SweepSummary[]> {
  const summaries: SweepSummary[] = [];

  // 1. Stuck jobs timeout sweep (R103, AE8) (Allocation: 10 items)
  try {
    const s1 = await sweepStuckJobs(env, 10, undefined, nowMs);
    summaries.push(s1);
  } catch (err) {
    summaries.push({
      sweepName: "stuck-jobs",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Completed input media retention (R100) (Allocation: 10 items)
  try {
    const s2 = await sweepCompletedMedia(env, 10, undefined, nowMs);
    summaries.push(s2);
  } catch (err) {
    summaries.push({
      sweepName: "completed-media",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Failed input media retention (R101) (Allocation: 10 items)
  try {
    const s3 = await sweepFailedMedia(env, 10, undefined, nowMs);
    summaries.push(s3);
  } catch (err) {
    summaries.push({
      sweepName: "failed-media",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. Completed results retention (R102) (Allocation: 10 items)
  try {
    const s4 = await sweepCompletedResults(env, 10, undefined, nowMs);
    summaries.push(s4);
  } catch (err) {
    summaries.push({
      sweepName: "completed-results",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 5. Quarantined uploads reconciler (R104) (Allocation: 10 items)
  try {
    const s5 = await sweepQuarantinedUploads(env, 10, undefined, nowMs);
    summaries.push(s5);
  } catch (err) {
    summaries.push({
      sweepName: "quarantined-uploads",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 6. Cancelled jobs late results reclaimer (Allocation: 10 items)
  try {
    const s6 = await sweepCancelledResults(env, 10, nowMs);
    summaries.push(s6);
  } catch (err) {
    summaries.push({
      sweepName: "cancelled-results",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 7. Auth and idempotency records hygiene (R9, R27)
  try {
    const s7 = await sweepAuthAndIdempotency(env, nowMs);
    summaries.push(s7);
  } catch (err) {
    summaries.push({
      sweepName: "auth-idempotency",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 8. Account deletion cascade backstop (R112)
  try {
    const s8 = await sweepAccountDeletionBackstop(env, 10);
    summaries.push(s8);
  } catch (err) {
    summaries.push({
      sweepName: "account-deletion-backstop",
      itemsProcessed: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return summaries;
}
