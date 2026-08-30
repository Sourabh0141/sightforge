/**
 * sightforge-web Worker placeholder
 */
export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response("SightForge Web Static Assets Placeholder", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
