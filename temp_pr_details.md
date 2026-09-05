# PR: fix(web): enable run_worker_first for assets to handle POST /jobs edge routing

## Branch

`fix/web-worker-run-first-assets`

## Title

`fix(web): enable run_worker_first for assets to handle POST /jobs edge routing`

## Description

### Summary

Fixes the `HTTP 405 Method Not Allowed` / `An internal server error occurred` failure when submitting image/video inference jobs from the `/new` page on Cloudflare Workers.

### Root Cause Analysis

- Cloudflare Workers with Static Assets (`assets: { directory: "./out", binding: "ASSETS" }`) defaults to evaluating static asset matches _before_ executing the worker entrypoint script (`run_worker_first = false`).
- In Next.js static HTML export (`output: 'export'`), the route `/jobs` generates a static prerendered HTML file at `./out/jobs.html` (or `./out/jobs/index.html`).
- When the frontend client on `/new` calls `POST /jobs` to register a new inference job and request a presigned R2 upload URL, Cloudflare's static asset router matches the `/jobs` path to the static HTML file.
- Because Cloudflare's static asset router only accepts `GET` and `HEAD` methods, it immediately rejects the `POST /jobs` request at the edge with `HTTP 405 Method Not Allowed` before invoking `apps/web/src/index.ts`.

### Solution

- Set `"run_worker_first": true` in `apps/web/wrangler.jsonc` under `assets`.
- With `run_worker_first: true`, Cloudflare Workers always invokes `apps/web/src/index.ts` first.
- The worker's `isApiRoute` logic identifies `POST /jobs` as an API request and routes it to `env.JOBS_SERVICE.fetch(request)` (in-memory Service Binding) or reverse-proxies to `sightforge-api-jobs-prod.*.workers.dev`.
- Non-API routes fall through cleanly to `env.ASSETS.fetch(request)` to serve static Next.js assets.

### Verification

- Ran full monorepo test suite, TypeScript typecheck, and linter: 31/31 tasks passed.
- Verified Next.js static build (`pnpm --filter sightforge-web build`) succeeds cleanly.
- Verified Prettier code formatting compliance (`pnpm run format:check`).
- Live production testing with Playwright MCP confirmed the exact `405 Method Not Allowed` on `POST /jobs`.
