#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/services/starlight_mini_test"

export ALLOW_REAL_SUBMIT="${ALLOW_REAL_SUBMIT:-1}"
export PORT="${STARLIGHT_PORT:-8030}"

npm run serve
