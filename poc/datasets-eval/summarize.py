"""results/*/summary.json 을 한 표로 모아 마크다운으로 찍는다.  python summarize.py [results]"""
import json
import sys
from pathlib import Path

for _s in (sys.stdout,):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "results")


def g(d, *ks):
    for k in ks:
        if not isinstance(d, dict) or k not in d or d[k] is None:
            return None
        d = d[k]
    return d


def f(x, nd=2):
    return "—" if x is None else (f"{x:.{nd}f}" if isinstance(x, float) else str(x))


rows = []
for p in sorted(root.glob("*/summary.json")):
    s = json.loads(p.read_text(encoding="utf-8"))
    if "T1_detect_rate" not in s:
        continue
    lm = s.get("T2_landmark_iou", {})
    brow = [g(lm, k, "mean") for k in ("browL", "browR") if g(lm, k, "mean") is not None]
    eye = [g(lm, k, "mean") for k in ("eyeL", "eyeR") if g(lm, k, "mean") is not None]
    rows.append({
        "데이터셋": s["dataset"], "n": s["n"],
        "검출률": f(s["T1_detect_rate"]), "ms/장": f(s["T1_ms_per_image"], 0),
        "홍채px 중앙": f(g(s, "T1_iris_px", "median"), 1), "홍채≥25px": f(s.get("T1_iris_ge_25px_ratio")),
        "|yaw| 중앙°": f(g(s, "T1_abs_yaw_deg", "median"), 1), "yaw>30°": f(s.get("T1_yaw_over_30_ratio")),
        "LM-IoU 눈썹": f(sum(brow) / len(brow)) if brow else "—",
        "LM-IoU 눈": f(sum(eye) / len(eye)) if eye else "—",
        "LM-IoU 입": f(g(lm, "lip", "mean")), "LM-IoU 홍채": f(g(lm, "iris", "mean")),
        "좌우뒤집힘": f(g(s, "T2_lr_swapped_ratio", "brow")),
        "모델IoU 눈썹": f(g(s, "T3_model_iou", "brow", "mean")), "모델IoU 입": f(g(s, "T3_model_iou", "lip", "mean")),
        "맨얼굴 오검출(섀도우)": f(g(s, "T3_model_false_positive_pixel_ratio", "shadow", "mean"), 3),
        "해상도 중앙": f"{f(g(s, 'T4_image_size', 'w', 'median'), 0)}×{f(g(s, 'T4_image_size', 'h', 'median'), 0)}",
    })

if not rows:
    sys.exit("summary.json 없음")
keys = list(rows[0].keys())
print("| " + " | ".join(keys) + " |")
print("|" + "---|" * len(keys))
for r in rows:
    print("| " + " | ".join(str(r[k]) for k in keys) + " |")
