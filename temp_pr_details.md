# PR: fix(pipeline): resolve Modal ultralytics missing module, JobRoom ticket route, and static routing

## Branch

`fix/ws-ticket-route-and-static-routing`

## Title

`fix(pipeline): resolve Modal ultralytics missing module, JobRoom ticket route, and static routing`

## Description

### Summary

Resolves issues discovered during live end-to-end testing across Cloudflare and Modal:

1. **Modal `ModuleNotFoundError: No module named 'ultralytics'`**:
   - Added `torch`, `torchvision`, `ultralytics`, `opencv-python-headless`, and system libraries (`libgl1-mesa-glx`, `libglib2.0-0`) to `cpu_image` in `services/inference/src/sightforge_inference/app.py`.
   - Made `from ultralytics import YOLO` import lazy inside `BaseYOLOAdapter.load_model` in `services/inference/src/sightforge_inference/tasks/base.py`.
2. **WebSocket Ticket 401**:
   - Supported `/register-ticket` path alias in `JobRoom` Durable Object matching the `transitions.ts` caller.
3. **Static Asset 404s**:
   - Excluded static asset file extensions (`.txt`, `.html`, `.js`, `.css`, etc.) from being reverse-proxied to `api-jobs` in `apps/web/src/index.ts`.
4. **Modal Callback & Storage Secrets**:
   - Injected `R2_MEDIA_ACCESS_KEY_ID`, `R2_MEDIA_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`, and `MODAL_CALLBACK_SECRET` into `sightforge-events-prod` worker in `scripts/inject-secrets.cjs`.

### Root Cause Analysis

1. **Modal Function Hydration Failure**:
   - When Modal starts the container for `@app.function(image=cpu_image) trigger_inference`, it hydrates the Python module by importing `sightforge_inference`.
   - `__init__.py` imports `endpoint.py` -> `infer.py` -> `tasks/base.py`, which had a top-level `from ultralytics import YOLO`.
   - `cpu_image` omitted `ultralytics` and `torch`, causing container startup to immediately crash with `ModuleNotFoundError: No module named 'ultralytics'`.
   - **Fix**: Installed complete vision runtime into `cpu_image` and moved `YOLO` import inside `load_model`.

2. **JobRoom Ticket Route Mismatch**:
   - `transitions.ts` called `http://job-room/register-ticket` when minting live WebSocket tickets.
   - `JobRoom.fetch` router only checked `path === "/mint-ticket"`, causing ticket registration to return 404.
   - **Fix**: Added `/register-ticket` alongside `/mint-ticket` in `JobRoom.fetch`.

3. **Next.js Static Asset Routing (`/jobs/index.txt`)**:
   - Next.js client router cache prefetching requests `/jobs/index.txt`.
   - `isApiRoute` matched `pathname.startsWith("/jobs/")` and proxied to `api-jobs` (which returned 404).
   - **Fix**: Added static asset file extension bypass in `isApiRoute`.

4. **Event Worker Secrets Scoping**:
   - `sightforge-events-prod` requires R2 access keys to presign media downloads and result uploads for Modal.
   - **Fix**: Added R2 and callback secrets to `WORKER_SECRET_MAP` in `scripts/inject-secrets.cjs`.

### Verification

- **Monorepo Tests**: 31/31 turbo tasks passed (`pnpm turbo run test typecheck lint`).
- **Python Tests**: 67/67 pytest tests passed (`uv run pytest services/inference`).
- **Formatting**: 100% Prettier compliant (`pnpm run format:check`).
