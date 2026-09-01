/**
 * @sightforge/worker-kit
 * Shared utilities, middleware, types, and Durable Object stub targets for Cloudflare Workers.
 */

export * from "./types.js";

// Stub Durable Object classes for initial migrations & binding targets
export class Counter {
  state: DurableObjectState;
  env: unknown;

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state;
    this.env = env;
  }

  async fetch(_request: Request): Promise<Response> {
    return new Response(JSON.stringify({ ok: true, count: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

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
