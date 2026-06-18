#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PORT="${PORT:-8060}"
export STARLIGHT_BACKEND="${STARLIGHT_BACKEND:-http://127.0.0.1:8030}"

python3 serve_proxy.py
