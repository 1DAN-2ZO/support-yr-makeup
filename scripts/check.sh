#!/usr/bin/env bash
# 커밋 전 / CI 와 같은 검사. bash scripts/check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "-- ruff";       uv run ruff check . && uv run ruff format --check .
echo "-- pytest";     uv run pytest
echo "-- tsc";        ( cd client && npm run --silent typecheck )
echo "-- vitest";     ( cd client && npm test --silent )
echo "-- eslint";     ( cd client && npm run --silent lint )
echo "OK"
