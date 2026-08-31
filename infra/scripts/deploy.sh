#!/usr/bin/env bash
set -euo pipefail

# SightForge Production Deployment Pipeline Wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/deploy.cjs" "$@"
