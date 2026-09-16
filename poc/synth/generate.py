"""합성 학습 데이터 대량 생성기.

브라우저 데모와 같은 계산(core.py == core.js, parity.py가 보증)으로 PNG를 찍어낸다.

    # 1) 브라우저에서 "랜드마크 내려받기"로 받은 JSON을 쓰는 방법 (mediapipe 불필요)
    python generate.py --photo ../samples/phone-portraits-20/person_1_front_open.jpg \
                       --landmarks person_1.json --n 100 --out out/

    # 2) mediapipe가 깔려 있으면 사진만 주면 된다
    python generate.py --photo ../samples/phone-portraits-20/person_1_front_open.jpg \
                       --n 100 --out out/

출력
    out/photo_0000.png   합성 사진 (RGB)
    out/label_0000.png   정수 라벨 마스크 (L 모드, 배경 0, 부위 1~5)
    out/manifest.json    시드·파라미터·면적·라벨 픽셀 수

라벨 PNG는 픽셀값이 곧 클래스 번호다. Pillow의 polygon은 안티앨리어싱이 없어
경계에 중간값이 생기지 않는다 (브라우저 쪽은 임계값으로 잘라 같은 결과를 만든다).
"""

from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFilter
except ImportError:
    sys.exit("Pillow가 필요합니다:  pip install pillow")

from core import PART_LABEL, build_sample, face_width, random_params, sample_stats

# 한글 윈도우 콘솔은 기본이 CP949라 일부 문자에서 죽는다. UTF-8로 고정한다.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

MULTIPLY_PARTS = {"brow", "liner", "lip"}   # 어두운 색은 곱하기가 자연스럽다


def load_landmarks(path: Path) -> list[tuple[float, float]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    pts = data["landmarks"] if isinstance(data, dict) else data
    return [(float(p[0]), float(p[1])) if isinstance(p, (list, tuple))
            else (float(p["x"]), float(p["y"])) for p in pts]


def detect_landmarks(photo: Path) -> list[tuple[float, float]]:
    try:
        import mediapipe as mp
    except ImportError:
        sys.exit(
            "mediapipe가 없습니다. 둘 중 하나로 하세요:\n"
            "  1) pip install mediapipe\n"
            "  2) 브라우저 데모에서 '랜드마크 내려받기'로 JSON을 받아 --landmarks 로 전달"
        )
    import numpy as np  # mediapipe가 있으면 numpy도 있다

    img = np.array(Image.open(photo).convert("RGB"))
    h, w = img.shape[:2]
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, refine_landmarks=True,
                                         max_num_faces=1) as fm:
        res = fm.process(img)
    if not res.multi_face_landmarks:
        sys.exit(f"{photo}에서 얼굴을 찾지 못했습니다.")
    return [(p.x * w, p.y * h) for p in res.multi_face_landmarks[0].landmark]


def render_photo(base: Image.Image, lm, sample: dict) -> Image.Image:
    out = base.convert("RGB")
    scale = face_width(lm) / 100
    for part in sample["parts"]:
        layer = Image.new("L", out.size, 0)
        d = ImageDraw.Draw(layer)
        for poly in part.polys:
            d.polygon([(p[0], p[1]) for p in poly], fill=255)

        blur = part.feather * 6 * scale
        if blur > 0.3:
            layer = layer.filter(ImageFilter.GaussianBlur(blur / 2))

        mask = layer.point(lambda v, a=part.alpha: int(v * a))
        colored = Image.new("RGB", out.size, part.color)
        mixed = ImageChops.multiply(out, colored) if part.id in MULTIPLY_PARTS else colored
        out = Image.composite(mixed, out, mask)
    return out


def render_label(size, sample: dict) -> Image.Image:
    img = Image.new("L", size, 0)
    d = ImageDraw.Draw(img)
    for part in sample["parts"]:          # 그리는 순서대로, 나중 것이 덮는다
        for poly in part.polys:
            d.polygon([(p[0], p[1]) for p in poly], fill=part.label)
    return img


def main() -> int:
    ap = argparse.ArgumentParser(description="합성 학습 데이터 대량 생성")
    ap.add_argument("--photo", required=True, type=Path, help="맨얼굴 사진")
    ap.add_argument("--landmarks", type=Path, help="랜드마크 JSON (없으면 mediapipe로 검출)")
    ap.add_argument("--n", type=int, default=20, help="생성할 장수")
    ap.add_argument("--seed", type=int, default=0, help="시작 시드")
    ap.add_argument("--out", type=Path, default=Path("out"), help="출력 폴더")
    args = ap.parse_args()

    if not args.photo.exists():
        sys.exit(f"사진이 없습니다: {args.photo}")

    base = Image.open(args.photo).convert("RGB")
    lm = load_landmarks(args.landmarks) if args.landmarks else detect_landmarks(args.photo)
    if len(lm) < 468:
        sys.exit(f"랜드마크가 {len(lm)}개뿐입니다. 468개 이상이어야 합니다.")

    iris = None
    if len(lm) >= 478:
        iris = ((lm[471][0] - lm[469][0]) ** 2 + (lm[471][1] - lm[469][1]) ** 2) ** 0.5
        if iris == 0:
            iris = None          # 홍채 랜드마크가 없는 입력 (검증용 가짜 얼굴 등)
        elif iris < 25:
            print(f"[경고] 홍채 지름 {iris:.1f}px. 기능 정의서 기준 25px 미만이라 "
                  f"학습 데이터로는 해상도가 부족합니다.")

    args.out.mkdir(parents=True, exist_ok=True)
    entries = []
    for i in range(args.n):
        seed = args.seed + i
        sample = build_sample(lm, random_params(seed))
        photo = render_photo(base, lm, sample)
        label = render_label(base.size, sample)

        photo.save(args.out / f"photo_{i:04d}.png")
        label.save(args.out / f"label_{i:04d}.png")

        counts = {v: n for v, n in enumerate(label.histogram()) if n}
        entries.append({
            "seed": seed,
            "photo": f"photo_{i:04d}.png",
            "label": f"label_{i:04d}.png",
            "params": sample["params"],
            "areas": sample_stats(sample),
            "labelPixels": {str(k): v for k, v in sorted(counts.items())},
        })
        if (i + 1) % 20 == 0 or i + 1 == args.n:
            print(f"  {i + 1}/{args.n}")

    manifest = {
        "generator": "danghaeung poc/synth (generate.py)",
        "source": str(args.photo),
        "image": {"w": base.width, "h": base.height},
        "irisPx": iris,
        "labels": PART_LABEL,
        "note": "라벨 PNG의 픽셀값이 곧 클래스 번호다. 배경 0, 부위 1~5.",
        "samples": entries,
    }
    (args.out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{args.n}장 생성 완료 → {args.out}/")
    print(f"라벨: {PART_LABEL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
