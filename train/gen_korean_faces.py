"""AI 생성 한국인 얼굴 — 얼굴형 5종 × N장 (#60 한국인 확인용).

얼굴형을 프롬프트로 지정해 만들어서 라벨이 처음부터 붙는다(파일이 들어간 폴더 이름 = 요청한 얼굴형).
다만 생성 모델이 요청대로 그리지 않는 경우가 있어서, 만든 뒤 사람이 훑어 틀린 것은 빼거나 옮긴다.
초상권이 없는 가짜 얼굴이라 학습에 쓸 수 있다. 실제 사용자 정확도는 실제 사진으로 따로 확인한다.

  python train/gen_korean_faces.py --out <폴더> --per 20 [--fast]

모델: stabilityai/stable-diffusion-xl-base-1.0 (CreativeML Open RAIL++-M, 상업 이용 가능)
--fast: ByteDance/SDXL-Lightning 4단계 LoRA (OpenRAIL++) — 25단계 대신 4단계로 그려 약 7배 빠르다.
얼굴형 모델은 사진을 224px 로 줄여 보므로 고해상도·많은 단계가 필요 없다.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import torch
from diffusers import StableDiffusionXLPipeline

SHAPES = {
    "heart": "heart-shaped face, inverted triangle face shape, wide forehead, narrow "
    "pointed chin, tapered jaw",
    "oblong": "long narrow face, oblong face shape, elongated face much longer than wide, "
    "long chin, straight cheek line",
    "oval": "oval face shape, balanced proportions, face slightly longer than wide, "
    "softly tapered rounded chin",
    "round": "round face shape, full rounded cheeks, face width almost equal to length, "
    "soft round jawline, short chin",
    "square": "square face shape, strong angular jawline, wide jaw corners, broad forehead, flat chin",
}
PEOPLE = [
    "Korean woman in her 20s",
    "Korean woman in her 30s",
    "Korean woman in her 40s",
    "Korean man in his 20s",
    "Korean man in his 30s",
]
# 실제 사용자처럼 머리카락이 이마·볼을 가리는 경우를 섞는다. (문구, 가림 여부)
HAIR = {
    "woman": [
        ("hair tied back in a ponytail", False),
        ("hair pulled back behind the ears", False),
        ("hair in a bun", False),
        ("thick straight full bangs covering the forehead", True),
        ("thin see-through wispy bangs", True),
        ("side-swept bangs over one eyebrow", True),
        ("long straight hair down framing and covering the cheeks", True),
    ],
    "man": [
        ("short hair pushed back", False),
        ("slicked back hair", False),
        ("dandy cut with bangs down covering the forehead", True),
        ("comma hair bangs curving over the forehead", True),
        ("two-block cut with long fringe covering the eyebrows", True),
    ],
}

BASE = (
    "a single photo of one person only, head and shoulders portrait of a {person}, {shape}, {hair}, "
    "facing the camera, neutral expression, plain light grey background, soft "
    "even lighting, no makeup, realistic photograph"
)
NEG = (
    "side view, tilted head, smiling widely, glasses, hat, hands, "
    "heavy makeup, cartoon, illustration, 3d render, painting, blurry, deformed "
    "face, multiple people, cropped chin"
)


class QC:
    """생성 결과 자동 검사: 얼굴이 정확히 하나, 손이 얼굴을 가리지 않음.

    MediaPipe 모델은 DHE_DATA_DIR/models.
    """

    def __init__(self):
        import os

        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision

        d = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data")) / "models"
        self.mp = mp
        self.face = vision.FaceLandmarker.create_from_options(
            vision.FaceLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(d / "face_landmarker.task")), num_faces=4
            )
        )
        self.hand = vision.HandLandmarker.create_from_options(
            vision.HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(d / "hand_landmarker.task")), num_hands=2
            )
        )

    def check(self, img) -> str | None:
        """문제가 없으면 None, 있으면 이유."""
        import numpy as np

        im = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.asarray(img.convert("RGB")))
        faces = self.face.detect(im).face_landmarks
        if len(faces) != 1:
            return f"얼굴 {len(faces)}개"
        fx = [p.x for p in faces[0]]
        fy = [p.y for p in faces[0]]
        box = (min(fx), min(fy), max(fx), max(fy))
        for h in self.hand.detect(im).hand_landmarks:
            if any(box[0] <= p.x <= box[2] and box[1] <= p.y <= box[3] for p in h):
                return "손이 얼굴을 가림"
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--per", type=int, default=20)
    ap.add_argument("--steps", type=int, default=25)
    ap.add_argument("--size", type=int, default=832)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--fast", action="store_true")
    args = ap.parse_args()
    device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    pipe = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        torch_dtype=torch.float16,
        variant="fp16",
        use_safetensors=True,
    ).to(device)
    pipe.set_progress_bar_config(disable=True)
    steps, cfg_scale, neg = args.steps, 6.0, NEG
    if args.fast:
        from diffusers import EulerDiscreteScheduler
        from huggingface_hub import hf_hub_download

        pipe.load_lora_weights(
            hf_hub_download("ByteDance/SDXL-Lightning", "sdxl_lightning_4step_lora.safetensors")
        )
        pipe.fuse_lora()
        pipe.scheduler = EulerDiscreteScheduler.from_config(
            pipe.scheduler.config, timestep_spacing="trailing"
        )
        steps, cfg_scale, neg = 4, 0.0, None  # Lightning 은 4단계·가이던스 0 으로 학습됨(부정 프롬프트 무시)

    qc = QC()
    out = Path(args.out)
    rnd = random.Random(args.seed)
    meta = []
    for shape, desc in SHAPES.items():
        (out / shape).mkdir(parents=True, exist_ok=True)
        for i in range(args.per):
            person = PEOPLE[i % len(PEOPLE)]
            hair, covered = rnd.choice(HAIR["woman" if "woman" in person else "man"])
            seed = args.seed * 100000 + list(SHAPES).index(shape) * 1000 + i
            path = out / shape / f"{shape}_{i:03d}.png"
            if path.exists():
                continue
            rejected = []
            for attempt in range(5):  # 자동 검사에 걸리면 시드를 바꿔 다시 그린다 (최대 5번)
                s_try = seed + attempt * 7919
                img = pipe(
                    BASE.format(person=person, shape=desc, hair=hair),
                    negative_prompt=neg,
                    num_inference_steps=steps,
                    guidance_scale=cfg_scale,
                    width=args.size,
                    height=int(args.size * 1.2) // 8 * 8,
                    generator=torch.Generator("cpu").manual_seed(s_try),
                ).images[0]
                why = qc.check(img)
                if why is None:
                    break
                rejected.append({"seed": s_try, "reason": why})
            else:
                print(f"{shape} {i + 1}/{args.per} 실패: {rejected}", flush=True)
                continue
            img.save(path)
            meta.append(
                {
                    "file": f"{shape}/{path.name}",
                    "label": shape,
                    "person": person,
                    "hair": hair,
                    "hair_covers_face": covered,
                    "seed": s_try,
                    "fast": args.fast,
                    "rejected": rejected,
                }
            )
            print(
                f"{shape} {i + 1}/{args.per}"
                + (f" (재생성 {len(rejected)}번: {rejected[-1]['reason']})" if rejected else ""),
                flush=True,
            )
    mp = out / "meta.json"
    old = json.loads(mp.read_text()) if mp.exists() else []
    mp.write_text(json.dumps(old + meta, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
