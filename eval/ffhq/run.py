"""공개 데이터셋(FFHQ-Makeup) 채점 확인 — harness.html 결과를 결과 CSV 한 장으로 남긴다.

입력: DHE_DATA_DIR(기본 ~/dhe-data)/results/ffhq_score.json
FFHQ-Makeup 샘플 중 맨얼굴·화장 5종이 모두 있는 10명 × 6장 × 부위 5개 = 300건. 화장은 합성이다.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.common import result_path, write_rows  # noqa: E402

DATA = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data")) / "results"
NOTE = "FFHQ-Makeup 샘플 10명(합성 화장)"


def main() -> int:
    src = DATA / "ffhq_score.json"
    rows: list[dict] = []
    if src.exists():
        R = json.loads(src.read_text())
        bare = [r for r in R if r["style"] == "bare"]
        mk = [r for r in R if r["style"] != "bare"]
        detected = lambda rs: sum(r["status"] == "scored" for r in rs)  # noqa: E731
        rows.append(
            {
                "eval": "공개채점",
                "metric": "맨얼굴 대 맨얼굴 '화장 없음' 판정",
                "baseline": "",
                "current": f"{len(bare) - detected(bare)}/{len(bare)}",
                "pass": "전부 화장 없음",
                "n": len(bare),
                "note": NOTE,
            }
        )
        res = [r["residual"] for r in mk if isinstance(r.get("residual"), (int, float))]
        rows.append(
            {
                "eval": "공개채점",
                "metric": "정합 잔차 평균(눈 사이 거리 대비)",
                "baseline": "",
                "current": f"{sum(res) / len(res):.3f}",
                "pass": "0.05 이하",
                "n": len(res),
                "note": f"최대 {max(res):.3f}",
            }
        )
        for part, label in [
            ("liner", "아이라이너"),
            ("shadow", "섀도우"),
            ("cheek", "볼터치"),
            ("brow", "눈썹"),
            ("lip", "입술"),
        ]:
            rs = [r for r in mk if r["part"] == part]
            note = NOTE + (
                ". 라이너가 없는 화장본도 '있음' — 샘플 범위에 섀도우·속눈썹이 섞임"
                if part == "liner"
                else ""
            )
            rows.append(
                {
                    "eval": "공개채점",
                    "metric": f"화장본 '있음' 판정 · {label}",
                    "baseline": "",
                    "current": f"{detected(rs)}/{len(rs)}",
                    "pass": "",
                    "n": len(rs),
                    "note": note,
                }
            )
    path = result_path("공개채점", "score-v0.1", "ffhq-sample10")
    write_rows(path, rows)
    print(path.name, f"{len(rows)} rows" if rows else "skipped (결과 파일 없음)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
