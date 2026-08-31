# Production Deployment Runbook

> **Scope:** Plan 1, Unit 6 (P1 U6)  
> **Requirements:** R81, R84, R76, R79, R80, R119, R120, KTD7  
> **Classification:** Operational Runbook

---

## 1. Overview & Architectural Ordering (KTD7, R81)

The SightForge deployment pipeline orchestrates the transition from unbuilt source code to a live, empty, correctly bound Cloudflare production deployment.

The pipeline executes in a **strict, fixed 6-step sequence**:

```text
[1. Build Static Export] ──> [2. Fail-Fast Bundling] ──> [3. Apply Terraform] ──> [4. Extract Outputs] ──> [5. D1 Migrations] ──> [6. Deploy Workers]
```

### Why This Exact Ordering is Mandatory:

1. **Static Export First (Step 1):** The frontend static build (`apps/web`) must exist on disk before deployment because the Cloudflare asset Worker serves its compiled static files. Deploying without building first would serve stale or missing assets.
2. **Fail-Fast Bundling (Step 2, R81):** Typechecks and bundle checks across all five Workers execute before Terraform. If a syntax error, broken import, or contract drift exists, the deployment halts immediately before modifying infrastructure.
3. **Terraform Applies Next (Step 3, R79):** Infrastructure resources (D1 database, R2 buckets, Queues, Cron triggers) must exist before bindings or migrations can reference them.
4. **Dynamic Output Extraction (Step 4):** Reads provisioned database and bucket identifiers dynamically from Terraform outputs (`terraform output -json`).
5. **Database Migrations (Step 5, R26):** Schema migrations execute remotely against the provisioned D1 database (`wrangler d1 migrations apply ... --remote`) so the schema is at the target version before live code serves requests.
6. **Worker Versions & Bindings (Step 6, KTD7):** Wrangler uploads compiled Worker versions and attaches bindings to live endpoints.

---

## 2. Prerequisites & Environment Setup

Before running the deployment sequence, ensure:

- Account bootstrapping in [`docs/runbooks/bootstrap.md`](bootstrap.md) is complete.
- Required credentials from [`docs/secrets.md`](../secrets.md) are available in the environment:
  - `CLOUDFLARE_API_TOKEN`: Scoped token with D1, R2, Workers, and Queues permissions.
  - `CLOUDFLARE_ACCOUNT_ID`: Dedicated account identifier.
  - `R2_ACCESS_KEY_ID` & `R2_SECRET_ACCESS_KEY`: Scoped to `sightforge-tf-state-prod`.

---

## 3. Automated Deployment

### Full Production Deployment

To run the end-to-end automated deployment sequence:

```bash
# Using Just task runner
just deploy

# Or directly via Node.js
node infra/scripts/deploy.cjs
```

### Dry-Run Pre-Flight

To run static export and fail-fast bundling without mutating remote infrastructure:

```bash
just deploy-dry-run
# or
node infra/scripts/deploy.cjs --dry-run
```

---

## 4. Manual Step-by-Step Reproduction

If a specific stage needs manual execution or debugging:

### Step 1: Build Frontend Static Export

```bash
pnpm --filter sightforge-web build
```

### Step 2: Pre-Flight Integrity Check

```bash
pnpm turbo run typecheck lint test
```

### Step 3: Apply Infrastructure via Terraform

```bash
cd infra/terraform/environments/prod
terraform init
terraform apply -auto-approve
cd ../../..
```

### Step 4: Apply Remote D1 Database Migrations

```bash
pnpm --filter @sightforge/db wrangler d1 migrations apply sightforge-d1-prod --remote
```

### Step 5: Deploy All 5 Cloudflare Workers

```bash
pnpm --filter sightforge-web exec wrangler deploy
pnpm --filter sightforge-api-auth exec wrangler deploy
pnpm --filter sightforge-api-jobs exec wrangler deploy
pnpm --filter sightforge-events exec wrangler deploy
pnpm --filter sightforge-scheduler exec wrangler deploy
```

---

## 5. Idempotency & Convergence Contract

The deployment pipeline is designed to be **safe to re-run at any time**:

- **Terraform:** Converges to a no-op when no infrastructure changes are declared.
- **D1 Migrations:** Checks the `__drizzle_migrations` tracking table; already applied migrations are skipped cleanly without error.
- **Wrangler Deployments:** Deploys new immutable version IDs and smoothly promotes them without downtime or namespace conflicts.

---

## 6. Rollback & Troubleshooting Playbook

### Worker Deployment Rollback

If a newly deployed Worker version introduces an error:

1. List previous versions:
   ```bash
   wrangler deployments list --name sightforge-api-jobs-prod
   ```
2. Rollback to the previous stable version:
   ```bash
   wrangler rollback <DEPLOYMENT_ID> --name sightforge-api-jobs-prod
   ```

### Database Schema Recovery

- D1 does not support arbitrary non-additive column drops automatically. All migrations in `packages/db/migrations/` must remain strictly additive.
- To inspect current remote migration status:
  ```bash
  pnpm --filter @sightforge/db wrangler d1 migrations list sightforge-d1-prod --remote
  ```
