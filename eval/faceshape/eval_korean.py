"""저장한 얼굴형 CNN 을 AI 생성 한국인 얼굴에 돌려 정확도를 잰다 (#60 한국인 확인).

  python eval/faceshape/eval_korean.py --ckpt ~/dhe-data/models/faceshape_efficientnet_b0.pt

입력: DHE_DATA_DIR(기본 ~/dhe-data)/kr_faces/{heart,oblong,oval,round,square}/*.png
      (train/gen_korean_faces.py 로 생성, 폴더 이름 = 요청한 얼굴형)
출력: DHE_DATA_DIR/results/faceshape_kr_<모델>.json  (정확도·얼굴형별 정확도·혼동표·사진별 예측)

주의: 정답은 "생성할 때 요청한 얼굴형"이다. 생성 모델이 요청대로 그리지 않은 사진이 섞여 있으면
정확도가 실제보다 낮게 나온다. 사람이 검수한 결과(review.json)가 있으면 그 라벨을 우선한다.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np
import timm
import torch
from PIL import Image

BASE = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--faces", default=str(BASE / "kr_faces"))
    args = ap.parse_args()
    ck = torch.load(args.ckpt, map_location="cpu", weights_only=False)
    classes = ck["classes"]
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = timm.create_model(ck["model"], pretrained=False, num_classes=len(classes))
    model.load_state_dict(ck["state_dict"])
    model.to(device).eval()
    tf = timm.data.create_transform(**ck["data_config"])

    faces = Path(args.faces)
    review = json.loads((faces / "review.json").read_text()) if (faces / "review.json").exists() else {}
    items = []
    for c in classes:
        for p in sorted((faces / c).glob("*.png")):
            label = review.get(f"{c}/{p.name}", c)
            if label == "exclude":
                continue
            items.append((p, classes.index(label)))

    rows, cm = [], np.zeros((len(classes), len(classes)), int)
    with torch.no_grad():
        for p, y in items:
            prob = model(tf(Image.open(p).convert("RGB")).unsqueeze(0).to(device)).softmax(1)[0].cpu().numpy()
            pred = int(prob.argmax())
            cm[y, pred] += 1
            rows.append(
                {
                    "file": f"{p.parent.name}/{p.name}",
                    "label": classes[y],
                    "pred": classes[pred],
                    "conf": round(float(prob.max()), 3),
                }
            )
    acc = float(np.trace(cm) / cm.sum()) if cm.sum() else 0.0
    per = {c: (float(cm[i, i] / cm[i].sum()) if cm[i].sum() else None) for i, c in enumerate(classes)}
    rec = {
        "model": ck["model"],
        "ckpt": str(args.ckpt),
        "n": int(cm.sum()),
        "acc": acc,
        "per_class": per,
        "confusion": cm.tolist(),
        "classes": classes,
        "reviewed": bool(review),
        "rows": rows,
    }
    out = BASE / "results" / f"faceshape_kr_{ck['model']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rec, ensure_ascii=False, indent=1))
    print(f"[{ck['model']}] 한국인 AI 얼굴 {cm.sum()}장 정확도 {acc:.3f}")
    print("얼굴형별", {k: (round(v, 3) if v is not None else None) for k, v in per.items()})
    print("정답(행) × 예측(열)", classes)
    print(cm)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
