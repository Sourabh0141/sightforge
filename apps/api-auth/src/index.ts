/**
 * sightforge-api-auth Worker entrypoint
 */
import type { AuthWorkerEnv } from "@sightforge/worker-kit";

export default {
  async fetch(_request: Request, _env?: AuthWorkerEnv): Promise<Response> {
    return new Response(
      JSON.stringify({ service: "sightforge-api-auth", status: "ready" }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
