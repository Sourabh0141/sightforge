# Continuous Integration (CI) Runbook

This runbook documents the SightForge CI pipeline architecture, path filtering mechanics, required status check configuration, and troubleshooting procedures.

---

## 1. CI Pipeline Architecture

SightForge uses a polyglot monorepo (TypeScript and Python) with disjoint subtrees. To balance fast feedback on pull requests with rigorous branch protection, the CI workflow (`.github/workflows/ci.yml`) implements the **Aggregator Pattern**:

```text
                  [ Pull Request Event ]
                            │
                            ▼
                  ┌────────────────────┐
                  │   detect-changes   │ (dorny/paths-filter)
                  └─┬───────┬────────┬─┘
                    │       │        │
          ┌─────────┘       │        └──────────┐
          ▼                 ▼                   ▼
  ┌───────────────┐ ┌───────────────┐   ┌───────────────┐
  │  typescript   │ │    python     │   │   terraform   │ (added in P5 U4)
  │ (lint/type/t) │ │ (ruff/mypy/t) │   │ (fmt/validate)│
  └───────┬───────┘ └───────┬───────┘   └───────┬───────┘
          │                 │                   │
          └────────────┬────┴───────────────────┘
                       ▼
            ┌─────────────────────┐
            │    ci-aggregator    │  <── ONLY REQUIRED CHECK
            │    (if: always())   │      in Branch Protection
            └─────────────────────┘
```

---

## 2. The Aggregator Pattern (KTD1)

### Why it is used

- **The "Pending Check" Problem:** Setting path filters at the workflow level (`on: pull_request: paths: [...]`) causes GitHub Actions to skip the workflow entirely for PRs touching unrelated files (e.g. Markdown documentation). In that case, GitHub Branch Protection waits indefinitely for the status check to report, blocking the PR from merging.
- **The "Skipped Check as Success" Problem:** If individual jobs (e.g. `python-checks`) are set as required status checks in Branch Protection, GitHub considers a skipped job as "successful", which can accidentally allow broken code to merge if dependencies fail.
- **The Solution:**
  1. The workflow triggers on all pull requests against `main`.
  2. `detect-changes` evaluates changed files and sets boolean outputs (`typescript`, `python`, `terraform`, etc.).
  3. Individual jobs run conditionally with `if: needs.detect-changes.outputs.<language> == 'true'`.
  4. The `ci-aggregator` job runs with `if: always()`, inspects the conclusion (`.result`) of all dependent jobs, and:
     - **Fails (exit 1)** if any upstream job has a status of `failure` or `cancelled`.
     - **Succeeds (exit 0)** if all jobs are either `success` or `skipped`.

---

## 3. Path Filter Rules & Contract Fan-out (KTD2)

Changes under `packages/contracts/**` or `config/defaults.json` generate types consumed by both TypeScript and Python. Therefore, `detect-changes` rules fan out contract changes to **all** language pipelines:

| Filter       | Monitored Paths                                                                                | Triggered Jobs                                         |
| ------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `contracts`  | `packages/contracts/**`, `config/defaults.json`                                                | Runs `typescript-checks` and `python-checks`           |
| `typescript` | `apps/**`, `packages/**`, `package.json`, `pnpm-lock.yaml`, `tsconfig.base.json`, `turbo.json` | Runs `typescript-checks`                               |
| `python`     | `services/**`, `pyproject.toml`, `uv.lock`                                                     | Runs `python-checks`                                   |
| `terraform`  | `infra/terraform/**`                                                                           | Runs Terraform validation (P5 U4)                      |
| `docs`       | `docs/**`, `README.md`, `LICENSE`                                                              | Triggers no test jobs; aggregator succeeds immediately |

---

## 4. GitHub Branch Protection Setup

To configure branch protection on GitHub for the repository:

1. Navigate to repository **Settings** $\rightarrow$ **Branches** $\rightarrow$ **Branch protection rules**.
2. Click **Add rule** (or edit rule for `main`).
3. Check **"Require status checks to pass before merging"**.
4. Check **"Require branches to be up to date before merging"**.
5. In the search box, search for and select **only**:
   ```text
   CI Aggregator (Required Check)
   ```
6. **Do NOT** select individual jobs (`typescript-checks`, `python-checks`, etc.) as required checks, as they are conditionally skipped depending on changed paths.
7. Save the rule.

---

## 5. Troubleshooting CI Failures

### Case A: Aggregator Failed (`❌ CI AGGREGATOR RESULT: FAILED`)

1. Open the GitHub Actions run.
2. Look for the red job (e.g. `typescript-checks` or `python-checks`).
3. Inspect the failed step logs (e.g. TypeScript type error or pytest assertion failure).
4. Fix the issue locally and push a new commit to the branch.

### Case B: A job was unexpectedly skipped

1. Check the `detect-changes` step logs in the workflow summary.
2. Verify if the modified files match the globs defined in `.github/workflows/ci.yml`.
3. If new file paths or packages were added, update the `filters` block in `.github/workflows/ci.yml`.
