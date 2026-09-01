/**
 * sightforge-api-jobs Worker entrypoint
 */
import type { JobsWorkerEnv } from "@sightforge/worker-kit";
import { Counter, JobRoom } from "@sightforge/worker-kit";

export { Counter, JobRoom };

export default {
  async fetch(_request: Request, _env?: JobsWorkerEnv): Promise<Response> {
    return new Response(
      JSON.stringify({ service: "sightforge-api-jobs", status: "ready" }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
