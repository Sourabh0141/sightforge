/**
 * sightforge-scheduler Worker placeholder (Cron maintenance sweeps)
 */
export default {
  async scheduled(
    event: ScheduledEvent,
    _env: unknown,
    _ctx: ExecutionContext,
  ): Promise<void> {
    console.log(
      `Scheduler cron fired at ${new Date(event.scheduledTime).toISOString()}`,
    );
  },

  async fetch(_request: Request): Promise<Response> {
    return new Response(
      JSON.stringify({ service: "sightforge-scheduler", status: "ready" }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
