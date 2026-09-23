"""겹침을 걸러낸 얼굴형 데이터 — 컬러 + 앱 촬영 여백 + 묶음 단위 학습/시험 분리.

공개 얼굴형 데이터의 test(흑백·얼굴만 잘림)는 학습 폴더 컬러 원본을 가공한 복사본이 많아
데이터 누수로 정확도가 과대평가됐다(가장 가까운 학습 사진 라벨만 베껴도 76.5%). 그래서
1) 흑백 사진은 모두 빼고 컬러 원본만 쓴다
2) 같은 사진을 한 묶음으로 잇는다 (흑백 얼굴 crop 임베딩 유사도 ≥ SIM_T, 또는 얼굴 점 거리 < LM_T)
3) 묶음 단위로 학습/시험을 나눈다 — 같은 묶음이 양쪽에 들어갈 수 없다

  python train/prep_clean.py --src ~/dhe-data/faceshape --out ~/dhe-data/faceshape_clean

출력: <out>/{heart,...}/*.jpg (학습), <out>/test/{Heart,...}/*.jpg (시험),
      <out>/landmarks.npz (eval/faceshape/landmark_models.py 가 읽는 형식), <out>/prep.json (통계)
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision
from PIL import Image, ImageFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from eval.faceshape.landmark_models import normalize  # noqa: E402
from train.prep_applike import BOTTOM, SIDE, TOP, is_gray  # noqa: E402

ImageFile.LOAD_TRUNCATED_IMAGES = True
CLASSES = ["heart", "oblong", "oval", "round", "square"]
# 표준화한 얼굴 점 478개 거리. 이 아래는 사실상 같은 사진(가장 가까운 사진 라벨 베끼기 92~100%)
LM_T = 9.0
# 얼굴 임베딩 코사인 유사도. 0.95↑ 는 거의 같은 사진·같은 사람,
# 0.93 은 다른 사람끼리 327장이 한 묶음으로 이어져 0.94 로 정함
SIM_T = 0.94


def embed(faces: list[Image.Image]) -> np.ndarray:
    """ImageNet 으로 미리 학습된 이미지 모델이 보는 얼굴 특징(흑백 얼굴 crop).

    같은 사진은 흑백·자르기로 가공해도 거의 같게 나온다.
    """
    import timm
    import torch

    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    m = timm.create_model("efficientnet_b0.ra_in1k", pretrained=True, num_classes=0).to(dev).eval()
    tf = timm.data.create_transform(**timm.data.resolve_data_config({}, model=m))
    out = []
    with torch.no_grad():
        for i in range(0, len(faces), 64):
            x = torch.stack([tf(f.convert("RGB")) for f in faces[i : i + 64]]).to(dev)
            out.append(torch.nn.functional.normalize(m(x), dim=1).cpu().numpy())
    return np.concatenate(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--test-frac", type=float, default=0.12)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    models = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data")) / "models"
    fl = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(models / "face_landmarker.task"))
        )
    )
    src, out = Path(args.src), Path(args.out)

    items = []  # (경로, 라벨, 앱 여백 crop, 얼굴 박스, 정규화 얼굴 점)
    n_gray = n_noface = 0
    cache_f = out.parent / f"{out.name}_detect_cache.json"
    cache = json.loads(cache_f.read_text()) if cache_f.exists() else {}
    for y, c in enumerate(CLASSES):
        for p in sorted(q for q in (src / c).glob("*") if q.suffix.lower() in {".jpg", ".jpeg", ".png"}):
            try:
                im = Image.open(p)
                im.load()
            except OSError:
                continue
            if is_gray(im):
                n_gray += 1
                continue
            rgb = im.convert("RGB")
            if str(p) not in cache:
                r = fl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(rgb)))
                cache[str(p)] = (
                    [[q.x * rgb.width, q.y * rgb.height, q.z * rgb.width] for q in r.face_landmarks[0]]
                    if len(r.face_landmarks) == 1
                    else None
                )
            if cache[str(p)] is None:
                n_noface += 1
                continue
            lm = np.array(cache[str(p)])
            x0, x1 = lm[:, 0].min(), lm[:, 0].max()
            y0, y1 = lm[:, 1].min(), lm[:, 1].max()
            w, top_y, chin_y = x1 - x0, lm[10, 1], lm[152, 1]
            h = chin_y - top_y
            box = (
                max(0, round(x0 - w * SIDE)),
                max(0, round(top_y - h * TOP)),
                min(rgb.width, round(x1 + w * SIDE)),
                min(rgb.height, round(chin_y + h * BOTTOM)),
            )
            items.append(
                (p, y, rgb.crop(box), rgb.crop((x0, y0, x1, y1)).convert("L"), normalize(lm).ravel())
            )
        print(c, "읽음", sum(1 for it in items if it[1] == y), flush=True)
    out.parent.mkdir(parents=True, exist_ok=True)
    cache_f.write_text(json.dumps(cache))

    n = len(items)
    E = embed([rgb_face for _, _, _, rgb_face, _ in items])
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    L = np.stack([it[4] for it in items]).astype(np.float32)
    L = (L - L.mean(0)) / (L.std(0) + 1e-6)
    sq = (L**2).sum(1)
    n_edges = n_edges_lm = 0
    best_sim = np.zeros(n)
    for i0 in range(0, n, 512):
        sim = E[i0 : i0 + 512] @ E.T
        dist = np.sqrt(np.maximum(sq[i0 : i0 + 512, None] + sq[None, :] - 2 * L[i0 : i0 + 512] @ L.T, 0))
        for k in range(sim.shape[0]):
            sim[k, i0 + k] = -1
            dist[k, i0 + k] = 1e9
        best_sim[i0 : i0 + 512] = sim.max(1)
        for a, b in zip(*np.nonzero((sim >= SIM_T) | (dist < LM_T)), strict=True):
            a += i0
            if a < b:
                n_edges += int(sim[a - i0, b] >= SIM_T)
                n_edges_lm += int(dist[a - i0, b] < LM_T)
                parent[find(a)] = find(b)
    if os.environ.get("ANALYZE"):
        np.save(out.parent / f"{out.name}_emb.npy", E)
        (out.parent / f"{out.name}_files.json").write_text(json.dumps([str(it[0]) for it in items]))
        print(
            "가장 비슷한 다른 사진과의 유사도 분위수(10/25/50/75/90%)",
            np.quantile(best_sim, [0.1, 0.25, 0.5, 0.75, 0.9]).round(3),
        )
        return 0
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    multi = [g for g in groups.values() if len(g) > 1]
    conflict = [g for g in multi if len({items[i][1] for i in g}) > 1]
    sizes = sorted((len(g) for g in multi), reverse=True)
    print(
        f"컬러 {n}장 → 묶음 {len(groups)}개 (2장 이상 {len(multi)}개, 가장 큰 묶음 {sizes[:5]}), "
        f"라벨이 엇갈리는 묶음 {len(conflict)}개",
        flush=True,
    )

    # 라벨이 엇갈리는 묶음은 정답을 믿을 수 없어 뺀다
    bad = {i for g in conflict for i in g}
    rnd = random.Random(args.seed)
    glist = [g for g in groups.values() if not (set(g) & bad)]
    rnd.shuffle(glist)
    target = {
        y: args.test_frac * sum(1 for i in range(n) if items[i][1] == y and i not in bad) for y in range(5)
    }
    got = dict.fromkeys(range(5), 0)
    split = {}
    for g in glist:
        y = items[g[0]][1]
        is_test = got[y] + len(g) <= target[y]
        if is_test:
            got[y] += len(g)
        for i in g:
            split[i] = "test" if is_test else "train"

    npz = {
        "train_X": [],
        "train_y": [],
        "train_f": [],
        "train_g": [],
        "test_X": [],
        "test_y": [],
        "test_f": [],
        "test_g": [],
    }
    raw = np.stack([it[4] for it in items]).astype(np.float32).reshape(n, 478, 3)
    for i, (p, y, crop, _, _) in enumerate(items):
        if i in bad:
            continue
        s = split[i]
        d = out / "test" / CLASSES[y].capitalize() if s == "test" else out / CLASSES[y]
        d.mkdir(parents=True, exist_ok=True)
        f = d / f"{p.stem}.jpg"
        crop.save(f, quality=92)
        npz[f"{s}_X"].append(raw[i])
        npz[f"{s}_y"].append(y)
        npz[f"{s}_f"].append(str(f))
        npz[f"{s}_g"].append(find(i))  # 같은 사진 묶음 번호 — 검증용 분리도 묶음 단위로 하기 위해
    np.savez_compressed(out / "landmarks.npz", **{k: np.array(v) for k, v in npz.items()})
    stats = {
        "흑백 제외": n_gray,
        "얼굴 못 찾음": n_noface,
        "컬러 사용": n,
        "묶음 수": len(groups),
        "2장 이상 묶음": len(multi),
        "가장 큰 묶음 크기": sizes[:10],
        "잇기 기준": {"얼굴 임베딩 유사도 ≥": SIM_T, "얼굴 점 거리 <": LM_T},
        "임베딩으로 이은 쌍": n_edges,
        "얼굴 점으로 이은 쌍": n_edges_lm,
        "라벨 엇갈림 묶음(제외)": len(conflict),
        "라벨 엇갈림 사진(제외)": len(bad),
        "학습": {CLASSES[y]: npz["train_y"].count(y) for y in range(5)},
        "시험": {CLASSES[y]: npz["test_y"].count(y) for y in range(5)},
    }
    (out / "prep.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1))
    print(json.dumps(stats, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
