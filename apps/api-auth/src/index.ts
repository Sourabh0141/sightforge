/**
 * sightforge-api-auth Worker placeholder
 */
import { Counter } from "@sightforge/worker-kit";

export { Counter };

export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response(
      JSON.stringify({ service: "sightforge-api-auth", status: "ready" }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
