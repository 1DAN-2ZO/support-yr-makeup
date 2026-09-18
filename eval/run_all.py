"""전부 순서대로. 각 평가는 eval/<이름>/run.py 이며 없으면 건너뛴다.
uv run python eval/run_all.py [--only score]
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ORDER = ["score", "faceshape", "transfer", "region", "gate", "live", "funnel"]
HERE = Path(__file__).resolve().parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=None)
    args = ap.parse_args()
    names = args.only or ORDER
    rc = 0
    for n in names:
        script = HERE / n / "run.py"
        if not script.exists():
            print(f"[{n}] no run.py yet — skipped")
            continue
        print(f"[{n}] running")
        r = subprocess.run([sys.executable, str(script)])
        rc = rc or r.returncode
    subprocess.run([sys.executable, str(HERE / "report.py")])
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
