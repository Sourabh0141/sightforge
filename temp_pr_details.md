# PR: fix(routing): align JobRoom ticket endpoint, exclude static assets from API proxy, and add missing events secrets

## Branch

`fix/ws-ticket-route-and-static-routing`

## Title

`fix(routing): align JobRoom ticket endpoint, exclude static assets from API proxy, and add missing events secrets`

## Description

### Summary

Resolves three issues discovered during live testing:

1. **WebSocket Ticket 401**: Supports `/register-ticket` path alias in `JobRoom` Durable Object matching `transitions.ts` caller.
2. **Static Asset 404s**: Excludes static asset file extensions (`.txt`, `.html`, `.js`, `.css`, etc.) from being reverse-proxied to `api-jobs` in `apps/web/src/index.ts`.
3. **Modal Callback & Storage Secrets**: Injects `R2_MEDIA_ACCESS_KEY_ID`, `R2_MEDIA_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`, and `MODAL_CALLBACK_SECRET` into `sightforge-events-prod` worker in `scripts/inject-secrets.cjs`.

### Root Cause Analysis

1. **JobRoom Ticket Route Mismatch**:
   - `transitions.ts` issued `roomStub.fetch("http://job-room/register-ticket")` when minting WebSocket tickets.
   - `JobRoom.fetch` router only checked `path === "/mint-ticket"`, causing ticket registration to return 404. When clients connected with `Sec-WebSocket-Protocol: ticket.<ticket>`, the ticket was missing from storage and rejected with 401.
   - **Fix**: Added `/register-ticket` alongside `/mint-ticket` in `JobRoom.fetch`.

2. **Next.js Static Asset Routing (`/jobs/index.txt`)**:
   - Next.js client router cache prefetching requests `/jobs/index.txt`.
   - `isApiRoute` matched `pathname.startsWith("/jobs/")` and proxied the request to `api-jobs` which returned 404.
   - **Fix**: Added static asset file extension bypass in `isApiRoute` so static export files are served by `env.ASSETS`.

3. **Event Worker Secrets Scoping**:
   - `sightforge-events-prod` requires R2 access keys to presign media downloads and result uploads for Modal inference.
   - **Fix**: Added R2 and callback secret entries to `WORKER_SECRET_MAP` in `scripts/inject-secrets.cjs` and supported `INFERENCE_CALLBACK_SECRET` fallback in callback verification.

### Verification

- **Monorepo Tests**: 31/31 tasks passed (`pnpm turbo run test typecheck lint`).
- **Formatting**: 100% Prettier compliant (`pnpm run format:check`).
