# SightForge Task Runner

default:
    @just --list

install:
    pnpm install
    uv sync --all-packages --all-groups --all-extras

contracts:
    pnpm contracts:generate

contracts-drift-check:
    pnpm contracts:generate
    git diff --exit-code packages/contracts/src/generated services/inference/src/sightforge_inference/contracts

typecheck:
    pnpm turbo run typecheck
    uv run mypy services/inference

lint:
    pnpm turbo run lint
    uv run ruff check services/inference

format:
    pnpm format
    uv run ruff format services/inference

test:
    pnpm turbo run test
    uv run pytest services/inference

build:
    pnpm turbo run build

check: lint typecheck test

deploy:
    node infra/scripts/deploy.cjs

deploy-dry-run:
    node infra/scripts/deploy.cjs --dry-run

deploy-infra:
    terraform -chdir=infra/terraform/environments/prod apply

deploy-migrations:
    pnpm --filter @sightforge/db wrangler d1 migrations apply sightforge-d1-prod --remote

deploy-workers:
    pnpm --filter sightforge-web exec wrangler deploy
    pnpm --filter sightforge-api-auth exec wrangler deploy
    pnpm --filter sightforge-api-jobs exec wrangler deploy
    pnpm --filter sightforge-events exec wrangler deploy
    pnpm --filter sightforge-scheduler exec wrangler deploy
