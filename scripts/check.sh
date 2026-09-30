#!/usr/bin/env bash
# 커밋 전 / CI 와 같은 검사. bash scripts/check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# 커밋 전에 반드시 통과해야 한다. 출력을 자르지 말 것 — 잘라 보면 실패를 놓친다
echo "-- ruff";       uv run ruff check .
                   uv run ruff format --check .   # && 로 이으면 set -e 가 앞 실패를 무시한다 — 두 줄로
echo "-- pytest";     uv run pytest
echo "-- tsc";        ( cd client && npm run --silent typecheck )
echo "-- vitest";     ( cd client && npm test --silent )
echo "-- eslint";     ( cd client && npm run --silent lint )
echo
echo "OK — 전부 통과"
