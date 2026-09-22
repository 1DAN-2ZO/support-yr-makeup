"""E-2 얼굴형 (정리한 데이터) — 겹침을 정리한 뒤의 비교 결과를 결과 CSV 한 장으로 남긴다.

v1(eval/faceshape/run.py)의 시험 사진 998장은 학습 사진(컬러 원본)을 흑백·얼굴만 잘라 가공한 복사본이 섞여
CNN 80.8% 가 데이터 누수로 과대평가됐다. train/prep_clean.py 로 흑백 복사본을 빼고 같은 사진을 묶어
학습·검증·시험을
묶음 단위로 나눈 뒤 다시 쟀다. 이 파일이 최신 결과가 되고 v1 CSV 는 이력으로 내려간다.

입력: eval/results/faceshape/clean_*.json (각 실험 스크립트 결과에서 사진 경로를 뺀 것)
  - clean_cnn_efficientnet_b0_s0.json   train/faceshape_cnn.py --data faceshape_clean
  - clean_landmark_lr_mlp_ep400.json    eval/faceshape/landmark_models.py (LM_CACHE=정리 데이터)
  - clean_hairline_5seeds.json          eval/faceshape/forehead.py compare (ONLY=①,② SEEDS=0..4)
  - clean_bangs_eval.json               시험 사진 중 앞머리 있는 151장 따로 채점
  - clean_leakage_check.json            가장 비슷한 학습 사진 라벨 베끼기 점검

  python eval/faceshape/run_clean.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.common import result_path, write_rows  # noqa: E402

SRC = Path(__file__).resolve().parents[1] / "results" / "faceshape"
TEST = "정리한 공개 얼굴형 시험 643장(컬러·앱 여백, 서양·동양 혼합, 학습과 묶음 단위 분리)"
RULE_V1 = 0.222  # v1 시험 998장 기준 (eval/faceshape/run.py)


def load(name: str) -> dict:
    return json.loads((SRC / name).read_text())


def main() -> int:
    cnn = load("clean_cnn_efficientnet_b0_s0.json")
    lm = load("clean_landmark_lr_mlp_ep400.json")["results"]
    hl = load("clean_hairline_5seeds.json")
    bangs = load("clean_bangs_eval.json")
    leak = load("clean_leakage_check.json")

    def seeds(prefix: str, key: str) -> np.ndarray:
        return np.array([v[key] for k, v in hl.items() if k.startswith(prefix)])

    def seeds_class(prefix: str, c: str) -> float:
        return float(np.mean([v["per_class"][c] for k, v in hl.items() if k.startswith(prefix)]))

    base = {"eval": "E-2", "baseline": RULE_V1, "pass": "", "n": 643}
    rows = [
        {**base, "metric": "겹침 점검 · 가장 비슷한 학습 사진 라벨 베끼기", "baseline": leak[
            "v1 데이터(시험=흑백 가공본 997장)"], "current": leak["정리한 데이터(시험=컬러 643장)"],
         "note": "낮을수록 겹침이 적다. v1 은 시험 사진이 학습 사진의 흑백 가공본이라 76.5%"},
        {**base, "metric": "얼굴형 정확도 · (v1 정정) CNN 80.8%", "current": "", "n": 998,
         "note": "v1 CNN 80.8% 는 데이터 누수(학습·시험 겹침)로 과대평가된 숫자. 정리 후 아래 줄 참고"},
        {**base, "metric": "얼굴형 정확도 · 얼굴 점 478점 + 로지스틱 회귀",
         "current": round(lm["다항 로지스틱 회귀 · 전체 478점"]["test_acc"], 3), "note": TEST},
        {**base, "metric": f"얼굴형 정확도 · CNN 파인튜닝 {cnn['model']}",
         "current": round(cnn["test_acc"], 3),
         "note": f"{TEST}. 학습 {cnn['n_train']}장, {cnn['epochs']}에폭. "
                 f"앞머리 있음 {bangs['cnn']['bangs']:.3f}"},
        {**base, "metric": "얼굴형 정확도 · 얼굴 점 478점 + MLP (5회 평균)",
         "current": round(float(seeds("①", "test").mean()), 3),
         "note": f"{TEST}. 앞머리 있음 {bangs['mlp']['bangs']:.3f} / 없음 {bangs['mlp']['no']:.3f} "
                 "(검증을 무작위로 뗀 1회 측정)"},
        {**base, "metric": "얼굴형 정확도 · 얼굴 점 478점 + 머리선 점 10개 + MLP (5회 평균) — 최종",
         "current": round(float(seeds("②", "test").mean()), 3), "pass": "촬영 기준: 앞머리 넘기고 촬영",
         "note": f"{TEST}. ±{seeds('②', 'test').std():.3f}, 5회 모두 머리선 없는 MLP 보다 높음. "
                 f"앞머리 없음 {seeds('②', 'test_no_bangs').mean():.3f}"},
    ]  # fmt: skip
    ko = {"oval": "계란형", "heart": "역삼각형", "round": "둥근형", "oblong": "긴형", "square": "각진형"}
    for c in ["square", "oblong", "round", "heart", "oval"]:
        rows.append(
            {
                **base,
                "metric": f"얼굴형별 정확도 · 최종 MLP · {ko[c]}",
                "current": round(seeds_class("②", c), 3),
                "n": 129,
                "note": "5회 평균",
            }
        )
    path = result_path("faceshape", "clean-v1", "faceshape-clean643")
    write_rows(path, rows)
    print(path.name, f"{len(rows)} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
