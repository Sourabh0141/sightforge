# SightForge

> Serverless Computer Vision Platform on Cloudflare and Modal Labs.

SightForge allows users to upload images or video clips (≤ 30s), select one of seven computer vision tasks (Object Detection, Instance Segmentation, Semantic Segmentation, Classification, Pose Estimation, Oriented Bounding Boxes, and Monocular Depth Estimation), and receive live structured inference results pushed over WebSockets.

---

## Architectural Boundary

SightForge operates on a dual-cloud compute model governed by Cloudflare's 10 ms CPU budget per Worker invocation:

- **Cloudflare (Free Tier — ≤ 10 ms CPU per call):** Static asset delivery, client credential hashing, session verification, idempotent job lifecycle, upload validation queue consumer, WebSocket live state pushes via Durable Objects, and scheduled retention sweeps.
- **Modal Labs (Pay-per-use Serverless):** Media probing (`ffprobe`), video frame extraction to Volume, on-demand GPU inference (YOLO26 nano/small variants), and HMAC-signed completion callbacks.

---

## Repository Structure & Toolchain

This polyglot monorepo uses **pnpm** for TypeScript and **uv** for Python on strictly disjoint subtrees:

```text
sightforge/
├── apps/                            # TypeScript workspace (pnpm)
│   ├── web/                         # Static Next.js export & assets
│   ├── api-auth/                    # Authentication Worker & Counter Durable Object
│   ├── api-jobs/                    # Job lifecycle Worker & JobRoom Durable Object
│   ├── events/                      # Queue consumer (upload validation) & Modal callback
│   └── scheduler/                   # Consolidated cron maintenance sweeps
├── packages/                        # Shared TypeScript packages (pnpm)
│   ├── contracts/                   # JSON Schema result contract & generated TS types
│   ├── db/                          # D1 database schema & Drizzle migrations
│   ├── worker-kit/                  # Shared Worker middleware, headers & DO stubs
│   └── ui/                          # Design system primitives & tokens
├── services/                        # Python workspace (uv)
│   └── inference/                   # Modal App, task adapters & Pydantic contract models
├── infra/
│   ├── terraform/                   # Non-secret Cloudflare infrastructure
│   └── scripts/                     # Operational scripts
├── config/
│   └── defaults.json                # Single source of truth for operational constants (R78)
├── docs/                            # Requirements, plans, runbooks & ADRs
└── justfile                         # Unified task runner recipes
```

---

## Licensing & AGPL-3.0 Attribution (R107)

This project is licensed under the **GNU Affero General Public License v3.0** (`AGPL-3.0-only`).

- **Compelled Scope (Inherited via Dependency):**
  - `services/inference` depends on the `ultralytics` YOLO26 model family and inherits the AGPL-3.0 network-use obligation.
- **Elected Scope (Author's Choice):**
  - `apps/*` and `packages/*` are published under AGPL-3.0 by election for license uniformity across the monorepo.
- **Permissive Reversal Path:**
  - All computer vision tasks sit behind a task-shaped Model Adapter interface (R40), with monocular depth estimation shipping a verified permissive model implementation to prove license reversibility.

---

## Getting Started

### Prerequisites

- **Node.js:** `>= 20.0.0`
- **pnpm:** `>= 9.0.0`
- **Python:** `>= 3.11.0`
- **uv:** `>= 0.8.0`

### Installation

```bash
# Install Node/TypeScript dependencies
pnpm install

# Sync Python environment
uv sync
```

### Development Checks

```bash
# Run all checks (lint, typecheck, test)
pnpm turbo run lint typecheck test
```
