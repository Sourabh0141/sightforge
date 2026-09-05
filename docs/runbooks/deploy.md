# Production Deployment Runbook

> **Scope:** Plan 5, Unit 5 (P5 U5)  
> **Requirements:** R89, R90, R91, R93, R83, R76, R79, R81, KTD3, KTD4, KTD5  
> **Classification:** Operational Runbook

---

## 1. Overview & Architectural Ordering (KTD4, R89)

The SightForge deployment pipeline orchestrates the transition from committed source code on `main` to a live, production deployment across Cloudflare Workers and Modal GPU inference containers.

The pipeline executes in a **strict, fixed 7-step sequence**:

```text
[1. Static Export] ──> [2. Pre-Flight Checks] ──> [3. Apply Terraform] ──> [4. Inject Secrets] ──> [5. D1 Migrations] ──> [6. Deploy Workers & Modal] ──> [7. Smoke Tests]
```

### Why This Exact Ordering is Mandatory (KTD4):

1. **Frontend Static Export (Step 1):** The Next.js static HTML/JS/CSS bundle (`apps/web/out`) must be built before deployment because `sightforge-web-prod` serves these assets directly from Cloudflare's edge cache.
2. **Fail-Fast Pre-Flight Verification (Step 2, R81):** Typechecks, linter checks, and unit tests execute across all TypeScript Workers and Python inference modules (`turbo run typecheck lint test` and `pytest`). If contract drift or syntax errors exist, the pipeline aborts immediately before modifying remote infrastructure.
3. **Terraform Infrastructure Apply (Step 3, R79, R89):** Cloudflare primitives (D1 database, R2 buckets with CORS and lifecycle policies, Queues, and Cron triggers) must exist before database migrations or Worker deployments can bind to them.
4. **Out-of-Band Secret Injection (Step 4, R76, R93):** Secrets from the inventory are injected directly into Worker vaults (`wrangler secret put`) and Modal secret stores (`modal secret set`) via standard input pipes without exposing plaintext values in logs or process tables.
5. **Remote Database Migrations (Step 5, R26):** D1 schema migrations execute remotely (`wrangler d1 migrations apply ... --remote`) ensuring database tables and indexes match the incoming application code before traffic arrives.
6. **Synchronized Platform Deployments (Step 6, KTD5, R83):** All 5 Cloudflare Workers and the Modal inference app deploy non-interactively, stamped with the exact Git release commit SHA (`--message "Release <SHA>"`).
7. **Post-Deployment Smoke Test Suite (Step 7, R91):** Automated integration tests verify registration, presigned S3 upload, inference job creation, status polling, and result retrieval against the live deployment.

---

## 2. GitHub Environment Approval Gate (R89, R90, KTD3)

The production deployment workflow (`.github/workflows/deploy.yml`) is bound to the GitHub **`production`** environment.

### Security Controls:

- **Required Reviewers (R89):** Deployments to `production` halt automatically until approved by an authorized maintainer in the GitHub Actions UI.
- **Fork Containment (R90, KTD3):** Forked pull requests and non-deployment workflows have zero access to `production` environment secrets. Speculative plans in PRs run in uncredentialed validation mode.
- **Concurrency Serialization:** Deployment runs are serialized (`concurrency: group: deploy-prod, cancel-in-progress: false`) to prevent race conditions or interleaved schema migrations.

---

## 3. Secret Management & Injection Inventory (R76, R93)

Secrets are maintained in GitHub Environment Secrets (`production`) and injected out-of-band at Step 4:

| Secret Name                                               | Target Consumer                       | Injection Method                             | Scope & Purpose                                                                    |
| :-------------------------------------------------------- | :------------------------------------ | :------------------------------------------- | :--------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                                    | Terraform, Wrangler                   | CI Environment Variable                      | Scoped exclusively to `sightforge-prod` resources (D1, R2, Workers, Queues).       |
| `CLOUDFLARE_ACCOUNT_ID`                                   | Terraform, Wrangler                   | CI Environment Variable                      | Target Cloudflare account identifier.                                              |
| `R2_ACCESS_KEY_ID`<br/>`R2_SECRET_ACCESS_KEY`             | Terraform S3 Backend                  | CI Environment Variable                      | Access to remote state bucket `sightforge-tf-state-prod`.                          |
| `JWT_SECRET`                                              | `apps/api-auth`, `apps/api-jobs`      | `wrangler secret put`                        | HMAC-SHA256 signing of 15-minute user access tokens.                               |
| `TURNSTILE_SECRET_KEY`                                    | `apps/api-auth`                       | `wrangler secret put`                        | Server-side validation of Cloudflare Turnstile CAPTCHA tokens.                     |
| `INFERENCE_CALLBACK_SECRET`<br/>`MODAL_CALLBACK_SECRET`   | `apps/api-jobs`, `services/inference` | `wrangler secret put`<br/>`modal secret set` | HMAC-SHA256 signature verification for inference progress and completion webhooks. |
| `R2_MEDIA_ACCESS_KEY_ID`<br/>`R2_MEDIA_SECRET_ACCESS_KEY` | `apps/api-jobs`, `services/inference` | `wrangler secret put`<br/>`modal secret set` | Presigning direct S3 upload/download URLs for `sightforge-media-prod`.             |
| `MODAL_TOKEN_ID`<br/>`MODAL_TOKEN_SECRET`                 | Modal CLI Deployer                    | CI Environment Variable                      | Authentication to Modal workspace for container deployment.                        |

---

## 4. Post-Deployment Smoke Test Suite (R91)

The smoke test suite (`scripts/smoke-test.cjs`) automatically runs against the newly deployed domain (default `https://sightforge.app` or target specified by `DEPLOY_URL`):

```bash
# Run against staging or production URL
node scripts/smoke-test.cjs --target https://sightforge.app

# Run simulated mock tests locally
node scripts/smoke-test.cjs --mock
```

### Smoke Test Flow:

1. **Health Probe:** Asserts `GET /health` or `GET /` returns HTTP 200.
2. **Anti-Enumeration Salt:** Asserts `GET /auth/salt?email=...` returns deterministic pseudo-salt in constant time.
3. **Registration Flow:** Registers an ephemeral smoke test account (`smoke-test-<timestamp>@sightforge.internal`) using Cloudflare's documented Turnstile test token `1x0000000000000000000000000000000AA`.
4. **Job Creation:** Submits `POST /jobs` with bearer token, verifying quota checks pass and an S3 SigV4 presigned upload URL is minted.
5. **Direct Binary Upload:** Uploads a 1x1 test image binary via `PUT <uploadUrl>` to confirm R2 CORS and bucket access.
6. **Adaptive Polling:** Queries `GET /jobs/:id/status` to verify job room and transition state projection.
7. **Result Retrieval:** Asserts `GET /jobs/:id/results` contract conforms to expected status codes.

---

## 5. Automated & Manual Execution

### Triggering Automated Production Deployment

1. Push or merge a pull request to the `main` branch.
2. Navigate to **Actions** $\to$ **Deploy** in the GitHub repository.
3. When the `production` environment review prompt appears, review the commit diff and approve the deployment.

### Running Local Dry-Run Pre-Flight

```bash
node infra/scripts/deploy.cjs --dry-run
```

### Manual CLI Deployment (Operator Emergency)

```bash
# Set required environment variables, then execute:
node infra/scripts/deploy.cjs --strict
```

---

## 6. Rollback Playbook (R92)

If a production defect is discovered post-deployment:

### Worker Instant Rollback:

Cloudflare maintains immutable versions per deployment. To roll back an individual Worker:

```bash
# 1. Inspect recent version deployments
wrangler deployments list --name sightforge-api-jobs-prod

# 2. Rollback to the previous known-good deployment ID
wrangler rollback <STABLE_DEPLOYMENT_ID> --name sightforge-api-jobs-prod
```

### Modal Inference Rollback:

Redeploy the previous stable Git commit to Modal:

```bash
git checkout <PREVIOUS_STABLE_COMMIT_SHA>
uv run --package sightforge-inference modal deploy -m sightforge_inference.endpoint --name sightforge-inference
git checkout main
```

### Database Schema Recovery:

- Migrations in `packages/db/migrations/` must always be strictly additive (non-destructive).
- Do not roll back database schema by dropping live columns; instead, apply a forward additive migration.
