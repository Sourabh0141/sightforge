# PR: fix(web): allow R2 storage in CSP connect-src and align vision mode contract

## Branch

`fix/web-r2-csp-and-job-payload-contract`

## Title

`fix(web): allow R2 storage in CSP connect-src and align vision mode contract`

## Description

### Summary

Resolves two remaining upload and routing issues on production:

1. Adds `https://*.r2.cloudflarestorage.com` to Content Security Policy (`connect-src`) in `apps/web/public/_headers` to unblock direct browser-to-R2 binary PUT uploads.
2. Normalizes `task` and `mode` values (`per-frame` vs `per_frame`, `instance-segmentation` vs `instance_segmentation`) between `@sightforge/web` and `@sightforge/api-jobs` validation.
3. Normalizes trailing slashes in `apps/web/src/index.ts` and `apps/api-jobs/src/index.ts` so `GET /jobs/` cleanly renders the UI page rather than failing on the API router.

### Root Cause Analysis

1. **R2 Binary Upload Blocked by CSP**:
   - When a job is created, the backend provides an S3 SigV4 presigned upload URL hosted on `https://<account_id>.r2.cloudflarestorage.com`.
   - The browser's Content Security Policy in `_headers` defined `connect-src` without `https://*.r2.cloudflarestorage.com`.
   - Direct binary PUT requests to R2 were rejected by the browser's CSP engine with: `Refused to connect because it violates the document's Content Security Policy`.

2. **Job Creation Validation 400**:
   - The frontend was sending `mode: "per_frame"` (with underscore), whereas `@sightforge/db` and `@sightforge/api-jobs` schema enforce `PROCESSING_MODES = ["per-frame", "tracking"]` (with hyphen).
   - This caused `POST /jobs` to throw `HTTP 400 invalid-input: Invalid processing mode`.

3. **Trailing Slash Page Routing**:
   - When navigating to `/jobs/` with a trailing slash, `isApiRoute` matched `pathname.startsWith("/jobs/")` and proxied the request to `JOBS_SERVICE` instead of `ASSETS`.

### What Changed

- **`apps/web/public/_headers`**: Added `https://*.r2.cloudflarestorage.com` to `connect-src`.
- **`apps/web/src/lib/upload-manager.ts`**: Normalized `task` and `mode` to hyphenated strings before issuing `POST /jobs`.
- **`apps/api-jobs/src/validation.ts`**: Added underscore-to-hyphen normalization to tolerate client variations.
- **`apps/web/src/index.ts`**: Normalized trailing slashes in `isApiRoute` so `/jobs/` page navigation falls through to `env.ASSETS`.
- **`apps/api-jobs/src/index.ts`**: Normalized path parameter trailing slash.
- **Test Suites**: Updated unit tests across `web` and `api-jobs` to verify CSP directives and mode formatting.

### Verification

- **Monorepo Tests**: 31/31 tasks passed (`pnpm turbo run test typecheck lint`).
- **Formatting**: 100% Prettier compliant (`pnpm run format:check`).
- **Live Playwright Inspection**: Confirmed `POST /jobs` returns `HTTP 201 Created` with valid presigned R2 upload URL and identified the exact CSP violation for `*.r2.cloudflarestorage.com`.
