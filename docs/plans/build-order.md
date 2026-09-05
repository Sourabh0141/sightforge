# SightForge — Build Order

Sequential working order for one developer, **plan by plan**. 35 steps. Tick as you go.

|        | Plan                              | File in `docs/plans/`                                     |
| ------ | --------------------------------- | --------------------------------------------------------- |
| **P1** | Foundation & Contracts            | `2026-08-29-1145-sightforge-foundation-contracts-plan.md` |
| **P2** | Edge API                          | `2026-08-29-1217-sightforge-edge-api-plan.md`             |
| **P3** | Inference Service                 | `2026-08-29-1320-sightforge-inference-service-plan.md`    |
| **P4** | Frontend                          | `2026-08-29-1321-sightforge-frontend-plan.md`             |
| **P5** | Delivery & Operations             | `2026-08-29-1322-sightforge-delivery-operations-plan.md`  |
| —      | Requirements contract (120 R-IDs) | `2026-08-29-1050-sightforge-cv-platform-plan.md`          |
| —      | Design prompts                    | `docs/plans/sightforge-stitch-prompts.md`                 |

**All 34 implementation units appear below exactly once**, in plan order, plus one non-unit step (the Stitch design block before P4). Day zero is unnumbered and comes first.

**The order is P1 → P2 → P3 → P4 → P5, with one deviation:** P5's first three units are pulled to the front. Everything else runs in its plan's own sequence. The cross-plan dependencies form a clean DAG with no cycles, which is what makes this possible — P2 is built against a stubbed inference service, so it never waits on P3.

## How to work a step

**This file is the index, not the instructions.** It gives you order, grouping, and what "done" means. What to actually build lives in the plan.

For each step, open that plan and find its `### U<n>.` heading. Units carry these fields:

- **Goal** — what the unit accomplishes
- **Requirements** — the R-IDs it advances; full text is in the requirements contract
- **Dependencies** — what must already exist
- **Files** — repo-relative paths to create or modify
- **Approach** — numbered decisions, each with its reason
- **Test scenarios** — the specific cases to write, input and expected outcome named
- **Verification** — how you know it is finished

Two setup units — P1 U1 (scaffolding) and P1 U4 (account bootstrap) — carry no test scenarios, because nothing in them is unit-testable. Their **Verification** line is the whole check. Every other unit has all seven.

Before the first unit of any plan, read three of its sections once: **Key Technical Decisions** (the units assume these and never restate them), **High-Level Technical Design** (how the pieces fit), and **Assumptions** (what this plan expects an earlier plan to have already delivered — check those hold before you start).

When a unit cites an R-ID you do not recognise, look it up in the requirements contract rather than guessing; the R-IDs are stable across all six documents.

---

## Day zero — one hour, before any code

- [x] Create the dedicated Cloudflare account — **do this first**, there is a 7-day tenure gate before you can create additional free accounts
- [x] Create the Modal workspace and issue its proxy-token pair
- [x] Create the GitHub repo, public, with the AGPL-3.0 licence committed

---

## P1 — Foundation & Contracts

- [x] 1 · **P1 U1** — monorepo scaffolding, pnpm + uv workspaces, toolchain, Worker placeholders

### ↓ the one deviation — three P5 units, pulled forward

- [x] 2 · **P5 U1** — CI skeleton with the always-running aggregator check
- [x] 3 · **P5 U2** — language pipelines: lint, typecheck, test for both languages
- [x] 4 · **P5 U3** — dependency and secret scanning in CI

**Gate:** a commit containing a credential-shaped string is rejected locally _and_ in CI.

> P1 U1 already installs the local secret-scanning hook. These three add the CI gate behind it, plus dependency scanning. The repo is public from commit one, and a credential committed then deleted still lives in public history permanently — it is the only unrecoverable mistake in this project. U1 and U2 come along because bolting CI on at the end means meeting months of accumulated violations in one sitting.

### ↑ back to plan order

- [x] 5 · **P1 U2** — result contract package, generating TypeScript + Pydantic
- [x] 6 · **P1 U3** — database package, schema, migrations
- [x] 7 · **P1 U4** — account bootstrap, secret inventory, the one-time Durable Object dance (four edits, by hand, once)
- [x] 8 · **P1 U5** — Terraform root and Worker module
- [x] 9 · **P1 U6** — full deploy sequence, end to end against the real account

**Gate:** the deploy sequence completes; all five Workers respond at their routes with their placeholders; a follow-up `terraform plan` reports no drift; a second run is a no-op.

> Watch item at step 9: the deploy sequence begins with the frontend static export, and P4 does not exist yet. Expect to run it against P1 U1's scaffold export. If it has nothing to build, that step needs a minimal placeholder export — not a reordering.

---

## P2 — Edge API

- [x] 10 · **P2 U1** — Worker configs, bindings, secrets, asset Worker
- [x] 11 · **P2 U2** — shared middleware + Counter Durable Object ← **critical path, don't rush**
- [x] 12 · **P2 U3** — authentication Worker
- [x] 13 · **P2 U4** — job lifecycle Worker _(six subsystems; budget accordingly)_
- [x] 14 · **P2 U5** — JobRoom live status Durable Object
- [x] 15 · **P2 U6** — upload validation + inference callbacks
- [x] 16 · **P2 U7** — scheduled maintenance Worker

**Gate:** full create → upload → track → retrieve → delete cycle passes with inference stubbed, plus **one live authenticated trigger call** against Modal to disconfirm the auth and payload assumptions before P3 commits to them.

> That live trigger call is not optional. P3's entire contract wiring is built on P2's assumptions about how Modal authenticates and what it accepts. Disconfirming them here costs an afternoon; disconfirming them in P3 costs a rewrite on both sides.

---

## P3 — Inference Service

- [x] 17 · **P3 U1** — Modal App, images, volumes
- [x] 18 · **P3 U2** — model adapter boundary
- [x] 19 · **P3 U3** — the seven task implementations ← **first real model output**
- [x] 20 · **P3 U4** — CPU function: probe, decode, frame extraction
- [x] 21 · **P3 U5** — GPU class and the two video pipelines
- [x] 22 · **P3 U6** — contract wiring: trigger, progress, completion
- [x] 23 · **P3 U7** — permissive second adapter, cost benchmark

**Gate:** a real job runs end to end through the real trigger. Cost per job is measured, not estimated. You are holding real result fixtures for all seven tasks.

> **Expect a schema revision after step 19.** This is where you first see what the models actually emit against the contract you froze at step 5. Budget for it. The blast radius is P2 only — P4 does not exist yet, so no renderer is bound to the old shape. That is the single biggest advantage of working plan by plan.

---

## P4 — Frontend

- [x] 24 · **Stitch design** — landing page and app shell first, then the remaining screens
- [x] 25 · **P4 U1** — application shell, design system, state primitives, `_headers`
- [x] 26 · **P4 U2** — credential derivation and session handling
- [x] 27 · **P4 U3** — the five sparse visualizations
- [x] 28 · **P4 U4** — the two dense visualizations + raw inspector
- [x] 29 · **P4 U5** — application surface: upload, configuration, live status, history
- [x] 30 · **P4 U6** — public demo gallery, fed by step 19's real fixtures
- [ ] 31 · **P4 U7** — accessibility conformance + responsive pass

**Gate: a public URL rendering real results for all seven tasks**, and a keyboard and screen-reader user completes the whole flow including reading a result.

---

## P5 — Delivery & Operations

- [ ] 32 · **P5 U4** — Terraform checks and plan publication on pull requests
- [ ] 33 · **P5 U5** — deployment workflow and the approval gate
- [ ] 34 · **P5 U6** — observability and alerting
- [ ] 35 · **P5 U7** — rollback drill, architecture document, clean-clone check

**Gate:** a merge deploys behind approval, an induced failure alerts, and rollback has actually been executed — not just documented.
