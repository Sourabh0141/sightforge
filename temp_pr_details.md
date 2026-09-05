# PR Title

fix(deploy): align smoke test stage 7 result contract and add web worker edge proxying

# PR Description

## Summary

Resolves the remaining deployment pipeline contract mismatch in Stage 7 and enables edge reverse-proxying on the web worker:

1. **Smoke Test Stage 7 Contract Alignment (`scripts/smoke-test.cjs`)**: In `apps/api-jobs`, `handleGetJobResults` requires completed jobs and returns `HTTP 400` with `"Results are only available for completed jobs."` for newly created or in-progress jobs. Updated `scripts/smoke-test.cjs` to recognize `HTTP 400` alongside `200`, `202`, and `404` as a valid contract response for in-progress jobs, and added unit tests in `deploy-pipeline.test.ts`.
2. **Web Worker Edge API Proxying & Health Route (`apps/web/src/index.ts`)**: Implemented intelligent edge reverse-proxying in `sightforge-web-prod` for `/auth/*`, `/jobs/*`, and `/events/*` traffic targeting sibling Cloudflare Workers (`sightforge-api-auth-prod`, `sightforge-api-jobs-prod`, `sightforge-events-prod`) when deployed on `*.workers.dev` or configured via service bindings/environment variables, along with a `/health` probe route and full test coverage in `index.test.ts`.
3. **R2 Presigned URL Account Binding**: Passed `accountId` (`CLOUDFLARE_ACCOUNT_ID` / `R2_ACCOUNT_ID`) to S3 SigV4 presigned URL generation in `apps/api-jobs`, and added `CLOUDFLARE_ACCOUNT_ID` to worker secret injection, resolving `fetch failed (ENOTFOUND)` when uploading media binaries to Cloudflare R2 storage in Stage 5.
4. **Valid Semantic HTML & Hydration Stability**: Updated `Button` in `@sightforge/ui` to support `href`, rendering valid semantic `<a>` tags and eliminating invalid `<button>` in `<a>` nesting across landing, gallery, and dashboard pages to prevent React hydration unmounting.

---

## Root Cause Analysis

### 1. Stage 7 Smoke Test Failure (`Result endpoint returned unexpected status: 400`)

- In `apps/api-jobs/src/index.ts`, `handleGetJobResults` checks `if (job.status !== "completed" || !job.resultKey)` and throws `HttpError(400, "invalid-input", "Results are only available for completed jobs.")`.
- In `scripts/smoke-test.cjs`, Stage 7 queries `/jobs/:id/results` immediately after creating a job and polling status. The check asserted `[200, 202, 404].includes(resultsRes.status)`.
- Because `400` was not included in the expected status set for an in-progress job, the smoke test threw `Result endpoint returned unexpected status: 400`.

### 2. Frontend Sibling Worker Proxying on `workers.dev`

- When deployed on `sightforge-web-prod.<subdomain>.workers.dev`, the static SPA frontend makes requests to relative paths like `/auth/me`, `/jobs`, etc.
- In `wrangler.jsonc`, `not_found_handling: "single-page-application"` routes non-asset requests to `index.html`.
- Without reverse-proxying in `apps/web/src/index.ts`, API requests returned HTML rather than routing to `sightforge-api-auth-prod` or `sightforge-api-jobs-prod`.

---

## What Changed

### 1. Smoke Test Suite & Pipeline Tests (`scripts/smoke-test.cjs`, `apps/web/src/lib/deploy-pipeline.test.ts`)

- Added `400` to `isValidStatus` in Stage 7 of `scripts/smoke-test.cjs`.
- Added unit tests in `apps/web/src/lib/deploy-pipeline.test.ts` verifying that `runSmokeTests` validates Stage 7 when `/jobs/:id/results` returns `HTTP 400`.

### 2. Web Worker Edge Gateway (`apps/web/src/index.ts`, `apps/web/src/index.test.ts`)

- Added `/health` probe route returning `{ status: "ready", service: "sightforge-web", environment: "..." }`.
- Implemented `extractSubdomain()` and `isApiRoute()` helpers to accurately distinguish API requests (`/auth/*`, `/jobs/*`, `/events/*`, POST/PUT/DELETE, `X-SightForge-Request: 1`) from static SPA page navigation (`/jobs`, `/gallery`, `/`, etc.).
- Proxies API traffic to sibling microservice workers or service bindings while serving static Next.js assets from `env.ASSETS`.
- Added 8 unit tests in `apps/web/src/index.test.ts` verifying routing, proxying, subdomain parsing, and asset fallback.

---

## Requirements Advanced

- **R91**: Automated post-deployment smoke test suite executing all 7 user journey verification stages.
- **R54 & R57**: High-performance job lifecycle and results management across edge workers.
- **R18 & R19**: S3 SigV4 presigned upload and download URLs for Cloudflare R2 direct storage access.
- **R53 & R61**: Responsive, WCAG 2.1 AA accessible, and valid DOM semantic components in Next.js static export.

---

## Verification & Testing

- **Static Export Build**: `pnpm --filter sightforge-web build` exported 19/19 pages cleanly.
- **Monorepo Lint & Typecheck**: `pnpm turbo run typecheck lint test` passed 31/31 tasks (73 tests).
- **Python Test Suite**: `uv run pytest services/inference` passed 67/67 tests.
- **Prettier Code Style**: `pnpm run format:check` verified 100% compliant formatting.
