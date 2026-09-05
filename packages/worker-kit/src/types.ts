/**
 * @sightforge/worker-kit - Worker Environment Type Definitions
 *
 * Strongly-typed runtime bindings, Durable Object namespaces,
 * Queues, and platform secrets for all five SightForge Workers.
 */

export interface CommonEnv {
  ENVIRONMENT: string;
}

export interface AuthWorkerEnv extends CommonEnv {
  DB: D1Database;
  COUNTER: DurableObjectNamespace;
  FRONTEND_ORIGIN: string;
  JWT_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  PASSWORD_SALT_KEY?: string;
  PASSWORD_PEPPER?: string;
}

export interface JobsWorkerEnv extends CommonEnv {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  JOBS_QUEUE: Queue<unknown>;
  COUNTER: DurableObjectNamespace;
  JOB_ROOM: DurableObjectNamespace;
  FRONTEND_ORIGIN: string;
  JWT_SECRET?: string;
  R2_MEDIA_ACCESS_KEY_ID?: string;
  R2_MEDIA_SECRET_ACCESS_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  R2_ACCOUNT_ID?: string;
  MODAL_TOKEN_ID?: string;
  MODAL_TOKEN_SECRET?: string;
  INFERENCE_CALLBACK_SECRET?: string;
}

export interface EventsWorkerEnv extends CommonEnv {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  JOB_ROOM: DurableObjectNamespace;
  INFERENCE_CALLBACK_SECRET?: string;
  MODAL_TOKEN_ID?: string;
  MODAL_TOKEN_SECRET?: string;
}

export interface SchedulerWorkerEnv extends CommonEnv {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
}

export interface WebWorkerEnv extends CommonEnv {
  ASSETS?: Fetcher;
}
