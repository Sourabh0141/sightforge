# PR Title

fix(deploy): allow inline script execution in CSP and configure edge routing

# PR Description

## Summary

Resolves the client-side blank screen on page load and aligns deployment pipeline contracts:

1. **Content Security Policy Inline Script Unblocking (`apps/web/public/_headers`)**: Next.js App Router static export (`output: 'export'`) embeds React Server Component (RSC) flight data as inline `<script>` tags (`self.__next_f.push(...)`). Because `_headers` restricted `script-src` to `'self' 'wasm-unsafe-eval'` without `'unsafe-inline'`, the browser blocked all inline Flight scripts, causing the Next.js React 19 Flight client to throw `Uncaught Error: Connection closed.` and unmount the DOM into a black screen (`#0A0C10`). Updated `_headers` to include `'unsafe-inline'` in `script-src` and permitted `*.workers.dev` in `connect-src`.
2. **Removed Obsolete `public/index.html`**: Deleted leftover static `public/index.html` which could conflict with Next.js App Router prerendered export.
3. **Smoke Test Stage 7 Contract Alignment (`scripts/smoke-test.cjs`)**: In `apps/api-jobs`, `handleGetJobResults` requires completed jobs and returns `HTTP 400` with `"Results are only available for completed jobs."` for newly created or in-progress jobs. Updated `scripts/smoke-test.cjs` to recognize `HTTP 400` alongside `200`, `202`, and `404` as a valid contract response for in-progress jobs.
4. **Web Worker Edge API Proxying & Health Route (`apps/web/src/index.ts`)**: Implemented intelligent edge reverse-proxying in `sightforge-web-prod` for `/auth/*`, `/jobs/*`, and `/events/*` traffic targeting sibling Cloudflare Workers (`sightforge-api-auth-prod`, `sightforge-api-jobs-prod`, `sightforge-events-prod`) when deployed on `*.workers.dev` or configured via service bindings/environment variables, along with a `/health` probe route.
5. **R2 Presigned URL Account Binding**: Passed `accountId` (`CLOUDFLARE_ACCOUNT_ID` / `R2_ACCOUNT_ID`) to S3 SigV4 presigned URL generation in `apps/api-jobs`, and added `CLOUDFLARE_ACCOUNT_ID` to worker secret injection, resolving `fetch failed (ENOTFOUND)` when uploading media binaries to Cloudflare R2 storage in Stage 5.
6. **Valid Semantic HTML & Hydration Stability**: Updated `Button` in `@sightforge/ui` to support `href`, rendering valid semantic `<a>` tags and eliminating invalid `<button>` in `<a>` nesting across landing, gallery, and dashboard pages to prevent React hydration unmounting.

---

## Root Cause Analysis

### 1. Frontend Blink & Black Screen on Page Load (`Connection closed` / CSP Violation)

- Next.js App Router serializes RSC payloads directly into inline `<script>` tags (`self.__next_f.push(...)`) in the generated HTML.
- `apps/web/public/_headers` defined:
  `Content-Security-Policy: ... script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com ...`
- Because `'unsafe-inline'` was omitted from `script-src`, the browser's CSP engine blocked the execution of all inline Flight stream `<script>` tags.
- When `main-app-*.js` loaded, the Flight stream reader found zero RSC payload chunks and threw `Uncaught Error: Connection closed.`.
- React caught the unhandled stream closure error during client-side hydration, failed to reconcile the virtual DOM, and unmounted the root container, leaving only the `<body>` background color (`#0A0C10`).

### 2. Stage 7 Smoke Test Failure (`Result endpoint returned unexpected status: 400`)

- In `apps/api-jobs/src/index.ts`, `handleGetJobResults` checks `if (job.status !== "completed" || !job.resultKey)` and throws `HttpError(400, "invalid-input", "Results are only available for completed jobs.")`.
- In `scripts/smoke-test.cjs`, Stage 7 queries `/jobs/:id/results` immediately after creating a job and polling status. The check asserted `[200, 202, 404].includes(resultsRes.status)`.
- Because `400` was not included in the expected status set for an in-progress job, the smoke test threw `Result endpoint returned unexpected status: 400`.

---

## What Changed

### 1. Content Security Policy (`apps/web/public/_headers`, `apps/web/src/lib/infra-policy.test.ts`)

- Updated `script-src` in `apps/web/public/_headers` to `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com;`.
- Added `https://*.workers.dev` and `wss://*.workers.dev` to `connect-src` in `apps/web/public/_headers`.
- Added unit test in `apps/web/src/lib/infra-policy.test.ts` to assert all required CSP directives.
- Removed legacy `apps/web/public/index.html`.

### 2. Smoke Test Suite & Pipeline Tests (`scripts/smoke-test.cjs`, `apps/web/src/lib/deploy-pipeline.test.ts`)

- Added `400` to `isValidStatus` in Stage 7 of `scripts/smoke-test.cjs`.
- Added unit tests in `apps/web/src/lib/deploy-pipeline.test.ts` verifying that `runSmokeTests` validates Stage 7 when `/jobs/:id/results` returns `HTTP 400`.

### 3. Web Worker Edge Gateway (`apps/web/src/index.ts`, `apps/web/src/index.test.ts`)

- Added `/health` probe route returning `{ status: "ready", service: "sightforge-web", environment: "..." }`.
- Implemented `extractSubdomain()` and `isApiRoute()` helpers to accurately distinguish API requests (`/auth/*`, `/jobs/*`, `/events/*`, POST/PUT/DELETE, `X-SightForge-Request: 1`) from static SPA page navigation (`/jobs`, `/gallery`, `/`, etc.).
- Proxies API traffic to sibling microservice workers or service bindings while serving static Next.js assets from `env.ASSETS`.
- Added 8 unit tests in `apps/web/src/index.test.ts` verifying routing, proxying, subdomain parsing, and asset fallback.

---

## Requirements Advanced

- **R110**: Content Security Policy and security header enforcement allowing WebAssembly, inline hydration streams, and cross-worker communication.
- **R91**: Automated post-deployment smoke test suite executing all 7 user journey verification stages.
- **R54 & R57**: High-performance job lifecycle and results management across edge workers.
- **R18 & R19**: S3 SigV4 presigned upload and download URLs for Cloudflare R2 direct storage access.
- **R53 & R61**: Responsive, WCAG 2.1 AA accessible, and valid DOM semantic components in Next.js static export.

---

## Verification & Testing

- **Static Export Build**: `pnpm --filter sightforge-web build` exported 19/19 pages cleanly.
- **Monorepo Lint & Typecheck**: `pnpm turbo run typecheck lint test` passed 31/31 tasks (74 tests).
- **Python Test Suite**: `uv run pytest services/inference` passed 67/67 tests.
- **Prettier Code Style**: `pnpm run format:check` verified 100% compliant formatting.
