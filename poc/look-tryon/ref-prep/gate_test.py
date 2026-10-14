"""가림 판정 시험: 사진마다 판정 · 부위별 가림 비율 · 확인용 겹침 그림 · (채우기면) 채운 사진을 낸다.
인자: <출력폴더> <사진> [<사진> ...]
"""
import sys
import time
from pathlib import Path

from PIL import Image

import occlusion_gate as og

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
for p in sys.argv[2:]:
    src = Path(p)
    t0 = time.perf_counter()
    res, rep = og.prep(Image.open(src).convert("RGB"))
    rep["sec"] = time.perf_counter() - t0
    ov = og.overlay(rep)
    if ov is not None:
        ov.save(out / f"{src.stem}_overlay.png")
    if rep["verdict"] == "fill":
        res.save(out / f"{src.stem}_filled.png")
    pose = rep.get("pose") or {}
    print(f"\n[{src.name}] 판정={rep['verdict']}  {rep['why']}  각도(도) 좌우={pose.get('yaw', float('nan')):+.0f} 위아래={pose.get('pitch', float('nan')):+.0f} 기울임={pose.get('roll', float('nan')):+.0f}  판별 {rep['sec']:.2f}s")
    for s in ("L", "R"):
        if "scores" in rep:
            print("  ", s, "머리·옷", " ".join(f"{k}={v:.2f}" for k, v in rep["hair"][s].items()), "| 손", " ".join(f"{k}={v:.2f}" for k, v in rep["hand"][s].items()))
