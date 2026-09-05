/**
 * sightforge-web Worker entrypoint (Static asset delivery & SPA fallback)
 */
export interface WebWorkerEnv {
  ASSETS?: {
    fetch(request: Request | string): Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env?: WebWorkerEnv): Promise<Response> {
    if (env?.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("SightForge Web Static Assets Placeholder", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
