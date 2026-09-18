#!/usr/bin/env bash
# 처음 한 번: 같은 환경 만들기. Windows는 Git Bash, mac/Linux는 그대로.
#   bash scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null 2>&1 || { echo "필요: $1 — $2"; exit 1; }; }
need uv   "https://docs.astral.sh/uv/getting-started/installation/"
need node "Node 22 LTS — https://nodejs.org"
need git  "https://git-scm.com"

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
[ "$NODE_MAJOR" -ge 22 ] || { echo "Node 22 이상 필요 (지금 $(node -v))"; exit 1; }

echo "== Python 3.11 + 의존성 (uv.lock 그대로)"
uv sync --frozen --extra dev --extra eval

echo "== 클라이언트 의존성 (package-lock.json 그대로)"
( cd client && npm ci --no-audit --no-fund )

echo "== 검사"
bash scripts/check.sh

echo
echo "완료. 다음:"
echo "  uv run uvicorn server.app.main:app --reload --port 8000   # 서버"
echo "  cd client && npm run dev                                  # 클라이언트 http://localhost:5173"
echo "  uv run python eval/run_all.py                             # 평가"
