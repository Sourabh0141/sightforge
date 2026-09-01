/**
 * sightforge-scheduler Worker entrypoint (Cron maintenance sweeps)
 */
import type { SchedulerWorkerEnv } from "@sightforge/worker-kit";

export default {
  async scheduled(
    event: ScheduledEvent,
    _env?: SchedulerWorkerEnv,
    _ctx?: ExecutionContext,
  ): Promise<void> {
    console.log(
      `Scheduler cron fired at ${new Date(event.scheduledTime).toISOString()}`,
    );
  },

  async fetch(_request: Request, _env?: SchedulerWorkerEnv): Promise<Response> {
    return new Response(
      JSON.stringify({ service: "sightforge-scheduler", status: "ready" }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
