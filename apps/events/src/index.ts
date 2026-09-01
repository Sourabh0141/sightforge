/**
 * sightforge-events Worker entrypoint (Queue consumer & Modal callback)
 */
import type { EventsWorkerEnv } from "@sightforge/worker-kit";

export default {
  async fetch(_request: Request, _env?: EventsWorkerEnv): Promise<Response> {
    return new Response(
      JSON.stringify({ service: "sightforge-events", status: "ready" }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },

  async queue(
    batch: MessageBatch<unknown>,
    _env?: EventsWorkerEnv,
  ): Promise<void> {
    console.log(
      `Processing queue batch with ${batch.messages.length} messages`,
    );
  },
};
