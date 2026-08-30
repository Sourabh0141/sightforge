/**
 * sightforge-api-jobs Worker placeholder
 */
import { JobRoom } from "@sightforge/worker-kit";

export { JobRoom };

export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response(
      JSON.stringify({ service: "sightforge-api-jobs", status: "ready" }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
