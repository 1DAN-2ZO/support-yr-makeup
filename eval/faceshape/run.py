"""E-2 얼굴형 — 규칙 기준선과 모델 후보를 같은 시험 사진으로 비교해 결과 CSV 한 장으로 남긴다.

입력 (DHE_DATA_DIR, 기본 ~/dhe-data)
- results/faceshape_rule_landmarks.json : harness.html 결과 (앱 규칙 판정 + 얼굴 점 478개)
- results/faceshape_cnn_<모델>_s<시드>.json : train/faceshape_cnn.py 결과

시험 사진: 공개 얼굴형 데이터(codernotme/face_shape) test 998장, 5종 약 200장씩. 서양인 사진이다.
얼굴 점 기준(S-2 후보 B)은 같은 998장을 5번 나눠 번갈아 학습·시험한 평균(교차검증)이라,
CNN(학습 폴더로 학습 → 998장 시험)과 측정 방식이 다르다. 비고 칸에 적는다.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import FACE_OVAL, _upright, features  # noqa: E402

from eval.common import result_path, write_rows  # noqa: E402

DATA = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data")) / "results"
TEST = "공개 얼굴형 test 998장(서양)"


def cv_acc(X, y) -> float:
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    m = make_pipeline(SimpleImputer(), StandardScaler(), LogisticRegression(max_iter=3000))
    return float(cross_val_score(m, X, y, cv=StratifiedKFold(5, shuffle=True, random_state=0)).mean())


def main() -> int:
    rule_path = DATA / "faceshape_rule_landmarks.json"
    rows: list[dict] = []
    if rule_path.exists():
        R = json.loads(rule_path.read_text())
        ok = [r for r in R if r["status"] == "ok"]
        base = sum(r["pred"] == r["label"] for r in R) / len(R)
        rows.append(
            {
                "eval": "E-2",
                "metric": "얼굴형 정확도 · 앱 규칙(estimateFaceShape)",
                "baseline": "",
                "current": round(base, 3),
                "pass": "",
                "n": len(R),
                "note": f"{TEST}. 865장을 각진형으로 판정",
            }
        )
        y = np.array([r["label"] for r in ok])
        F = [features(r["lm"]) for r in ok]
        X = np.array([[f[k] for k in F[0]] for f in F])
        old = np.array([[r["ratio"], r["jaw"], r["fore"]] for r in ok])
        oval = np.array(
            [
                (_upright(np.array(r["lm"], float))[FACE_OVAL] / (r["lm"][152][1] - r["lm"][10][1])).ravel()
                for r in ok
            ]
        )
        for name, M in [
            ("얼굴 점 · 기존 비율 3개 + 로지스틱", old),
            ("얼굴 점 · 추천 기준 4종 + 로지스틱", X),
            ("얼굴 점 · 윤곽선 36점 + 로지스틱", oval),
        ]:
            rows.append(
                {
                    "eval": "E-2",
                    "metric": f"얼굴형 정확도 · {name}",
                    "baseline": round(base, 3),
                    "current": round(cv_acc(M, y), 3),
                    "pass": "",
                    "n": len(ok),
                    "note": f"{TEST}, 5겹 교차검증 (CNN과 측정 방식 다름)",
                }
            )
    for p in sorted(DATA.glob("faceshape_cnn_*.json")):
        c = json.loads(p.read_text())
        base_v = rows[0]["current"] if rows else ""
        rows.append(
            {
                "eval": "E-2",
                "metric": f"얼굴형 정확도 · CNN 파인튜닝 {c['model']}",
                "baseline": base_v,
                "current": round(c["test_acc"], 3),
                "pass": "규칙보다 높음 · 라벨러 일치율 미측정",
                "n": c["n_test"],
                "note": f"{TEST}. 학습 {c['n_train']}장, {c['epochs']}에폭, 파라미터 {c['params_m']}M, "
                f"시드 {c['seed']}",
            }
        )
    path = result_path("faceshape", "pub-v0", "faceshape-test998")
    write_rows(path, rows)
    print(path.name, f"{len(rows)} rows" if rows else "skipped (결과 파일 없음)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
