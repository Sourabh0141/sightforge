# Secret Inventory & Security Governance

> **Scope:** Plan 1, Unit 4 (P1 U4)  
> **Requirements:** R75, R76, R77, R80, R87  
> **Classification:** Security Governance & Metadata Inventory (Contains no plaintext secrets. All actual secret values are stored in platform-native secret vaults and CI secrets managers.)

---

## 1. Governance Principles

1. **Zero Secret Commitment (R75, R80):** No secret value is ever committed to source code, embedded into build artifacts, or persisted to Terraform state.
2. **Platform-Native Injection (R76):** Secrets are injected out of band directly into target platform secret stores (Cloudflare Worker secrets via `wrangler secret put`, Modal secrets via `modal secret`, GitHub Actions repository secrets).
3. **Least Privilege (R77):** Every credential is scoped strictly to the minimal resources and operations required by its consumer. Object storage credentials issued for media presigning cannot access Terraform state.
4. **Automated Verification (R87):** Pre-commit hooks (`lefthook`, `scripts/audit-secrets.cjs`) and CI workflows (`gitleaks`, `security-scan`) reject credential patterns before git commits or merges.

---

## 2. Complete Secret Inventory

| #     | Secret Name                                               | Consumer                                        | Least-Privilege Scope                                                                                                                    | Rotation Procedure                                                                                                                                                                                                            | Injection Path                                     |
| :---- | :-------------------------------------------------------- | :---------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------- |
| **1** | `CLOUDFLARE_API_TOKEN`                                    | Terraform (P1 U5), CI Deployment (P1 U6)        | Scoped exclusively to account `sightforge-prod` with permissions: `D1:Edit`, `R2:Edit`, `Workers:Edit`, `Queues:Edit`, `Pipelines:Edit`. | 1. Generate replacement token in Cloudflare Dashboard.<br/>2. Update `CLOUDFLARE_API_TOKEN` in GitHub Secrets.<br/>3. Verify CI deployment.<br/>4. Revoke previous token.                                                     | GitHub Actions Secret / Local `.env` (gitignored)  |
| **2** | `R2_ACCESS_KEY_ID`<br/>`R2_SECRET_ACCESS_KEY`             | Terraform S3 Backend (`use_lockfile = true`)    | Object Read & Write scoped strictly to the private state bucket `sightforge-tf-state-prod`.                                              | 1. Generate new R2 API token scoped to state bucket.<br/>2. Update backend configuration in CI secrets.<br/>3. Run `terraform init -reconfigure`.<br/>4. Revoke old R2 token.                                                 | GitHub Actions Secret / Local environment variable |
| **3** | `TURNSTILE_SECRET_KEY`                                    | `apps/api-auth` Worker                          | Server-side validation of client CAPTCHA response tokens via Cloudflare `siteverify` API endpoint.                                       | 1. Generate new secret key in Turnstile Widget settings.<br/>2. Run `wrangler secret put TURNSTILE_SECRET_KEY --env prod`.<br/>3. Test user registration/login flow.<br/>4. Remove old key.                                   | Cloudflare Worker Secret (`wrangler secret put`)   |
| **4** | `JWT_SECRET`                                              | `apps/api-auth`, `apps/api-jobs`                | HMAC-SHA256 signing and verification of 15-minute access tokens.                                                                         | 1. Generate 256-bit secure random string (`openssl rand -hex 32`).<br/>2. Inject into `apps/api-auth` and `apps/api-jobs` via Wrangler secrets.<br/>3. Existing refresh tokens remain valid; active sessions re-authenticate. | Cloudflare Worker Secret (`wrangler secret put`)   |
| **5** | `MODAL_TOKEN_ID`<br/>`MODAL_TOKEN_SECRET`                 | Modal CLI, `services/inference`, CI Deployments | Deployment and execution of computer vision inference containers in workspace `sightforge`.                                              | 1. Run `modal token new` to issue new workspace token pair.<br/>2. Update `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` in GitHub Secrets.<br/>3. Deploy inference app.<br/>4. Revoke expired token in Modal dashboard.           | GitHub Actions Secret / Modal CLI Config           |
| **6** | `INFERENCE_CALLBACK_SECRET`                               | `services/inference`, `apps/api-jobs`           | HMAC-SHA256 signing of `/api/jobs/:id/callback` webhook payload to prevent unauthorized status updates.                                  | 1. Generate 256-bit random string.<br/>2. Update secret in Modal environment via `modal secret set`.<br/>3. Update `apps/api-jobs` via `wrangler secret put INFERENCE_CALLBACK_SECRET`.<br/>4. Deploy updated services.       | Modal Secret & Cloudflare Worker Secret            |
| **7** | `R2_MEDIA_ACCESS_KEY_ID`<br/>`R2_MEDIA_SECRET_ACCESS_KEY` | `apps/api-jobs` Worker                          | Generating presigned `PUT` upload URLs and `GET` result download URLs scoped strictly to `sightforge-media-prod`.                        | 1. Create R2 API token restricted to `sightforge-media-prod`.<br/>2. Inject into `apps/api-jobs` via `wrangler secret put`.<br/>3. Test client upload presigning.<br/>4. Revoke superseded token.                             | Cloudflare Worker Secret (`wrangler secret put`)   |
| **8** | `GITHUB_TOKEN`                                            | GitHub Actions CI/CD Workflows                  | Ephemeral token generated per workflow run for repository checks, dependency auditing, and release tagging.                              | Managed automatically by GitHub Actions with least-privilege workflow permissions (`contents: read`, `security-events: write`).                                                                                               | GitHub Actions Runtime Injection                   |

---

## 3. Public / Non-Secret Companion Identifiers

The following identifiers are non-sensitive and may be committed in configuration templates, environment examples, or client builds:

- `CLOUDFLARE_ACCOUNT_ID`: Non-secret account resource identifier.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: Public Turnstile widget identifier rendered in client DOM.
- `R2_BUCKET_NAME_STATE`: `sightforge-tf-state-prod`
- `R2_BUCKET_NAME_MEDIA`: `sightforge-media-prod`
- `D1_DATABASE_NAME`: `sightforge-d1-prod`

---

## 4. Emergency Revocation Playbook

If any credential disclosure is suspected:

1. **Immediate Revocation:** Invalidate the compromised token in the respective provider dashboard (Cloudflare API Tokens, R2 Tokens, Modal, or GitHub).
2. **New Credential Issuance:** Generate fresh credentials following the rotation procedure in Section 2.
3. **Platform Injection:** Update secret stores via `wrangler secret put` or GitHub Repository Secrets.
4. **Audit Logs:** Inspect Cloudflare Audit Logs and Modal Activity logs for anomalous access during the exposure window.
5. **Git History Inspection:** Run `gitleaks git --verbose` and `node scripts/audit-secrets.cjs` to confirm no secret traces entered the commit graph.
