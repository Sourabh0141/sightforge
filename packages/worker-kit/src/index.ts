/**
 * @sightforge/worker-kit
 * Shared utilities, middleware, types, and Durable Objects for Cloudflare Workers.
 */

export * from "./types.js";
export * from "./crypto.js";
export * from "./errors.js";
export * from "./logging.js";
export * from "./headers.js";
export * from "./cors.js";
export * from "./ip.js";
export * from "./csrf.js";
export * from "./jwt.js";
export * from "./counter.js";
export * from "./rate-limit.js";
export * from "./ownership.js";
export * from "./middleware.js";
export * from "./storage.js";

// JobRoom Durable Object class stub (full implementation in P2 U5)
export class JobRoom {
  state: DurableObjectState;
  env: unknown;

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state;
    this.env = env;
  }

  async fetch(_request: Request): Promise<Response> {
    return new Response(JSON.stringify({ ok: true, room: "stub" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const WORKER_KIT_VERSION = "0.1.0";
