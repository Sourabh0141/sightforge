# PR: fix(pipeline): enable worker observability and add upload completion processing trigger

## Branch

`fix/worker-observability-and-processing-pipeline`

## Title

`fix(pipeline): enable worker observability and add upload completion processing trigger`

## Description

### Summary

This PR addresses the inference pipeline stuck in the "Uploading" state, fixes the WebSocket live connection rejection on `*.workers.dev` subdomains, and enables production-grade Cloudflare Workers observability/telemetry across all microservices.

### Root Cause Analysis

1. **Job Pipeline Stuck at Uploading**:
   - The frontend (`uploadMediaJob`) creates the job in D1 (`created` state), then issues a direct binary `PUT` to R2 storage.
   - Without active R2 Event Notifications, `sightforge-jobs-queue-prod` never receives an event upon object write completion, leaving the job permanently in the initial upload state.
   - **Solution**:
     - **Explicit Completion Trigger**: `upload-manager.ts` invokes `POST /jobs/:id/process` upon successful R2 `PUT`, immediately queuing the media object for validation and inference.
     - **Self-Healing Fallback**: `GET /jobs/:id/status` automatically verifies R2 binary existence when queried in `created`/`uploading` state and enqueues if unqueued.
     - **Flexible Consumer**: `sightforge-events` consumer accepts both `created` and `uploading` states, validates magic bytes, and generates presigned download/upload grants for Modal.

2. **WebSocket Live Connection Failure (`*.workers.dev` Origin Mismatch)**:
   - When connecting to `wss://<app>.workers.dev/jobs/<id>/live`, the browser sends `Origin: https://<app>.workers.dev`.
   - `JobRoom.handleWebSocketUpgrade` performed a strict array `.includes()` check against `DEFAULT_ALLOWED_ORIGINS` instead of `isOriginAllowed(origin, allowedOrigins)` (which permits `*.workers.dev` subdomains), resulting in `403 Forbidden: Origin not allowed`.
   - **Solution**: Replaced strict array check with `isOriginAllowed` in `JobRoom`.

3. **Microservice Observability & Logging**:
   - Added Cloudflare native worker observability configuration (`"observability": { "enabled": true, "head_sampling_rate": 1 }`) across `api-auth`, `api-jobs`, `events`, `scheduler`, and `web` to provide real-time logs and telemetry in Cloudflare Dashboard.

### What Changed

- **`apps/api-jobs/wrangler.jsonc`**, **`apps/api-auth/wrangler.jsonc`**, **`apps/events/wrangler.jsonc`**, **`apps/scheduler/wrangler.jsonc`**, **`apps/web/wrangler.jsonc`**: Added `observability` configuration block.
- **`apps/web/src/lib/upload-manager.ts`**: Dispatches `POST /jobs/:id/process` upon binary upload completion.
- **`apps/api-jobs/src/index.ts`**: Registered and implemented `handleProcessJob` endpoint; added self-healing queue dispatch in `handleGetJobStatus`.
- **`apps/api-jobs/src/job-room.ts`**: Switched WebSocket origin validation to `isOriginAllowed`.
- **`apps/events/src/index.ts`**: Updated queue consumer to process `created` and `uploading` jobs and generate presigned storage URLs for inference worker.
- **`apps/events/src/dispatch.ts`**: Included presigned storage URLs and `callbackBaseUrl` in the Modal dispatch payload.
- **`packages/worker-kit/src/storage.ts`**: Added shared SigV4 presigner.
- **`packages/worker-kit/src/types.ts`**: Added missing env typings for `EventsWorkerEnv`.

### Verification

- **Monorepo Build & Tests**: All 31 turbo tasks passed cleanly (`pnpm turbo run test typecheck lint`).
- **Formatting**: 100% Prettier verified (`pnpm run format:check`).
