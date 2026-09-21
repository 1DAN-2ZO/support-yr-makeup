"""Inference-time / VRAM benchmark harness for diffusion makeup-transfer candidates.

Each candidate needs its own conda env (incompatible dependency stacks), so this
script is invoked once per candidate, inside that candidate's env:

    conda run -n makeup-bench-sm   python bench.py --candidate stable_makeup
    conda run -n makeup-bench-shmt python bench.py --candidate shmt --variant h4

It always measures: 1 untimed warmup run, then 5 timed inference runs (model
already loaded, weights resident on GPU — mirrors a warm server process), plus a
one-shot model-load time. Results are appended to results/results.csv.
"""
import argparse
import csv
import os
import sys
import time
from pathlib import Path

SERVER_BENCH_DIR = Path(__file__).resolve().parent
RESULTS_DIR = SERVER_BENCH_DIR / "results"
RESULTS_CSV = RESULTS_DIR / "results.csv"
CSV_FIELDS = ["candidate", "variant", "run_number", "phase", "time_sec", "vram_peak_mb", "notes"]


def write_rows(rows):
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    is_new = not RESULTS_CSV.exists()
    with open(RESULTS_CSV, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if is_new:
            writer.writeheader()
        for row in rows:
            writer.writerow(row)


def bench_stable_makeup(dtype_name, steps=30, guidance=1.6, lcm=False):
    import torch

    sm_dir = SERVER_BENCH_DIR / "stable_makeup"
    os.chdir(sm_dir)          # infer_kps.py-style code uses relative paths like "./models/..."
    sys.path.insert(0, str(sm_dir))

    from diffusers import UNet2DConditionModel as OriginalUNet2DConditionModel
    from pipeline_sd15 import StableDiffusionControlNetPipeline  # NOTE: repo README/import says
    # "from utils.pipeline_sd15 import ..." but there is no utils/ package in the actual repo —
    # pipeline_sd15.py lives at repo root. Fixed here.
    from diffusers import DDIMScheduler, ControlNetModel
    from diffusers.utils import load_image
    from detail_encoder.encoder_plus import detail_encoder
    from spiga_draw import spiga_process, spiga_segmentation
    from spiga.inference.config import ModelConfig
    from spiga.inference.framework import SPIGAFramework
    from facelib import FaceDetector

    dtype = torch.float16 if dtype_name == "fp16" else torch.float32

    sd15_snapshot = os.environ["SD15_SNAPSHOT"]  # local diffusers-format SD1.5 checkout

    t0 = time.perf_counter()
    processor = SPIGAFramework(ModelConfig("300wpublic"))
    detector = FaceDetector(weight_path="./models/mobilenet0.25_Final.pth")

    Unet = OriginalUNet2DConditionModel.from_pretrained(sd15_snapshot, subfolder="unet").to("cuda", dtype)
    id_encoder = ControlNetModel.from_unet(Unet)
    pose_encoder = ControlNetModel.from_unet(Unet)
    makeup_encoder = detail_encoder(Unet, "openai/clip-vit-large-patch14", "cuda", dtype=dtype)

    makeup_encoder.load_state_dict(torch.load("./models/stablemakeup/pytorch_model.bin", map_location="cuda"), strict=False)
    id_encoder.load_state_dict(torch.load("./models/stablemakeup/pytorch_model_1.bin", map_location="cuda"), strict=False)
    pose_encoder.load_state_dict(torch.load("./models/stablemakeup/pytorch_model_2.bin", map_location="cuda"), strict=False)
    id_encoder.to("cuda", dtype)
    pose_encoder.to("cuda", dtype)
    makeup_encoder.to("cuda", dtype)

    pipe = StableDiffusionControlNetPipeline.from_pretrained(
        sd15_snapshot,
        safety_checker=None,
        unet=Unet,
        controlnet=[id_encoder, pose_encoder],
        torch_dtype=dtype,
    ).to("cuda")
    if lcm:
        # LCM-LoRA: SD1.5용 few-step 증류 LoRA + LCMScheduler (벤더링 diffusers 0.23.1이 지원)
        from diffusers import LCMScheduler
        pipe.load_lora_weights("latent-consistency/lcm-lora-sdv1-5")
        pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
    else:
        pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config)
    torch.cuda.synchronize()
    load_time = time.perf_counter() - t0

    def get_draw(pil_img, size):
        spigas = spiga_process(pil_img, detector)
        if spigas is False:
            from PIL import Image as PILImage
            w, h = pil_img.size
            return PILImage.new("RGB", (w, h), color=(0, 0, 0))
        return spiga_segmentation(spigas, size=size)

    id_image = load_image(str(sm_dir / "test_imgs/id/1.jpg")).resize((512, 512))
    makeup_image = load_image(str(sm_dir / "test_imgs/makeup/1.jpg")).resize((512, 512))
    pose_image = get_draw(id_image, size=512)

    candidate = "lcm_lora" if lcm else "stable_makeup"
    variant_label = f"{dtype_name}_{steps}steps"
    if lcm or guidance != 1.6:
        variant_label += f"_g{guidance}"
    rows = [{"candidate": candidate, "variant": variant_label, "run_number": 0, "phase": "load",
             "time_sec": round(load_time, 3), "vram_peak_mb": "", "notes": "model load + weights to GPU"}]

    result_img = None
    for run in range(6):  # run 0 = warmup, 1-5 = timed
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()
        t0 = time.perf_counter()
        result_img = makeup_encoder.generate(
            id_image=[id_image, pose_image], makeup_image=makeup_image, pipe=pipe, guidance_scale=guidance,
            num_inference_steps=steps,
        )
        torch.cuda.synchronize()
        dt = time.perf_counter() - t0
        vram = torch.cuda.max_memory_allocated() / (1024 ** 2)
        if run == 0:
            print(f"[warmup] {dt:.3f}s  vram={vram:.0f}MB")
            continue
        print(f"[run {run}] {dt:.3f}s  vram={vram:.0f}MB")
        rows.append({"candidate": candidate, "variant": variant_label, "run_number": run, "phase": "infer",
                      "time_sec": round(dt, 3), "vram_peak_mb": round(vram, 1), "notes": ""})

    sample_name = f"{candidate}_{variant_label}_sample.jpg" if lcm or guidance != 1.6 else f"stable_makeup_{dtype_name}_{steps}steps_sample.jpg"
    result_img.save(RESULTS_DIR / sample_name)
    from identity import face_cosine
    cos = face_cosine(id_image, result_img)
    print(f"[identity] face_cosine(source, result)={cos}")
    rows.append({"candidate": candidate, "variant": variant_label, "run_number": "-", "phase": "identity",
                 "time_sec": "", "vram_peak_mb": "", "notes": f"facenet_vggface2_cos={cos}"})
    id_image.save(RESULTS_DIR / "stable_makeup_source.jpg")
    makeup_image.save(RESULTS_DIR / "stable_makeup_reference.jpg")
    write_rows(rows)


def bench_shmt(variant, ddim_steps=50):
    import torch
    import torch.nn.functional as F
    from omegaconf import OmegaConf

    shmt_dir = SERVER_BENCH_DIR / "shmt"
    os.chdir(shmt_dir)
    sys.path.insert(0, str(shmt_dir))

    from ldm.util import instantiate_from_config
    from ldm.data.makeup_dataset import MakeupDatasetTest

    is_model2 = variant == "h4"  # h4 = SHMT's "recommended" dual-model blend (model2 script)
    if variant == "h0":
        config_path = "configs/latent-diffusion/shmt_h0.yaml"
        ckpt_path = "checkpoints_dl/h0/epoch=000755.ckpt"
    else:
        config_path = "configs/latent-diffusion/shmt_h4.yaml"
        ckpt_path = "checkpoints_dl/h4/epoch=000710.ckpt"

    device = torch.device("cuda")

    def load_one(cfg_path, ck_path):
        config = OmegaConf.load(cfg_path)
        pl_sd = torch.load(ck_path, map_location="cpu")
        m = instantiate_from_config(config.model)
        m.load_state_dict(pl_sd["state_dict"], strict=False)
        m.cuda()
        m.eval()
        return m

    t0 = time.perf_counter()
    model = load_one(config_path, ckpt_path)
    if is_model2:
        from ldm.models.diffusion.ddim_test_model2 import DDIMSampler
        model2 = load_one("configs/latent-diffusion/shmt_h0.yaml", "checkpoints_dl/h0/epoch=000755.ckpt")
        model.model2 = model2
        model.proportionOFmodel1 = 0.3
    else:
        from ldm.models.diffusion.ddim_test import DDIMSampler
    sampler = DDIMSampler(model)
    torch.cuda.synchronize()
    load_time = time.perf_counter() - t0

    dataset = MakeupDatasetTest(
        mode="test_pair",
        source_image_path="examples/images/non_makeup", source_seg_path="examples/seg2/non_makeup",
        source_depth_path="examples/3d/non_makeup",
        ref_image_path="examples/images/makeup", ref_seg_path="examples/seg2/makeup",
    )
    loader = torch.utils.data.DataLoader(dataset, batch_size=1, shuffle=False, num_workers=0)
    batch = next(iter(loader))

    source_image = batch["source_image"].to(device).float()
    ref_image = batch["ref_image"].to(device).float()
    source_depth = batch["source_depth"].to(device).float()
    source_bg = batch["source_bg"].to(device).float()
    source_face_gray = batch["source_face_gray"].to(device).float()
    ref_face = batch["ref_face"].to(device).float()
    source_seg_onehot = batch["source_seg_onehot"].to(device).float()
    ref_seg_onehot = batch["ref_seg_onehot"].to(device).float()
    source_face_seg = batch["source_face_seg"].to(device).float()

    variant_label = f"{variant}_{ddim_steps}steps"
    rows = [{"candidate": "shmt", "variant": variant_label, "run_number": 0, "phase": "load",
             "time_sec": round(load_time, 3), "vram_peak_mb": "", "notes": "model load + weights to GPU"}]

    result_img = None
    with torch.no_grad(), torch.autocast("cuda"), model.ema_scope():
        for run in range(6):  # run 0 = warmup, 1-5 = timed
            torch.cuda.reset_peak_memory_stats()
            torch.cuda.synchronize()
            t0 = time.perf_counter()

            source_depth_down4 = F.pixel_unshuffle(source_depth, downscale_factor=4)
            ref_LF_64 = F.pixel_unshuffle(ref_face, downscale_factor=4)
            source_face_seg_64 = F.interpolate(source_face_seg, size=(64, 64), mode="bilinear")

            z_bg = model.get_first_stage_encoding(model.encode_first_stage(source_bg)).detach()
            z_ref_LF = model.get_first_stage_encoding(model.encode_first_stage(ref_face)).detach()

            test_model_kwargs = {
                "z_bg": z_bg, "z_ref_LF": z_ref_LF,
                "ref_LF_64": ref_LF_64, "source_face_seg_64": source_face_seg_64,
                "source_seg_onehot": source_seg_onehot, "ref_seg_onehot": ref_seg_onehot,
            }
            if is_model2:
                # h4 (model2) blends a coarser pyramid level (source_HF, upsampled from level 4)
                # with the fine level-0 detail (source_HF2), per makeup_inference_model2.py
                source_HF_4 = model.lap_pyr_c1.pyramid_decom(source_face_gray)[4]
                source_HF = F.interpolate(source_HF_4, size=(64, 64))
                source_HF = torch.cat([source_HF, source_depth_down4], dim=1)
                source_HF_0 = model.lap_pyr_c1.pyramid_decom(source_face_gray)[0]
                source_HF2 = F.pixel_unshuffle(source_HF_0, downscale_factor=4)
                source_HF2 = torch.cat([source_HF2, source_depth_down4], dim=1)
                test_model_kwargs["source_HF"] = source_HF
                test_model_kwargs["source_HF2"] = source_HF2
            else:
                source_HF_0 = model.lap_pyr_c1.pyramid_decom(source_face_gray)[0]
                source_HF_0_down4 = F.pixel_unshuffle(source_HF_0, downscale_factor=4)
                test_model_kwargs["source_HF"] = torch.cat([source_HF_0_down4, source_depth_down4], dim=1)
            samples_ddim, _ = sampler.sample(
                S=ddim_steps, batch_size=1, shape=[3, 64, 64], verbose=False,
                unconditional_guidance_scale=1, unconditional_conditioning=None,
                eta=0.0, x_T=None, log_every_t=1, test_model_kwargs=test_model_kwargs,
            )
            x_samples = model.decode_first_stage(samples_ddim)
            torch.cuda.synchronize()
            dt = time.perf_counter() - t0
            vram = torch.cuda.max_memory_allocated() / (1024 ** 2)
            if run == 0:
                print(f"[warmup] {dt:.3f}s  vram={vram:.0f}MB")
                continue
            print(f"[run {run}] {dt:.3f}s  vram={vram:.0f}MB")
            rows.append({"candidate": "shmt", "variant": variant_label, "run_number": run, "phase": "infer",
                          "time_sec": round(dt, 3), "vram_peak_mb": round(vram, 1), "notes": ""})
            if run == 1:
                x_clamped = torch.clamp((x_samples + 1.0) / 2.0, min=0.0, max=1.0)
                from torchvision.transforms.functional import to_pil_image
                result_img = to_pil_image(x_clamped[0].cpu())

    result_img.save(RESULTS_DIR / f"shmt_{variant_label}_sample.jpg")
    from torchvision.transforms.functional import to_pil_image
    source_pil = to_pil_image(torch.clamp((source_image[0] + 1.0) / 2.0, 0.0, 1.0).cpu())
    source_pil.save(RESULTS_DIR / "shmt_source.jpg")
    try:
        from identity import face_cosine
    except ImportError:  # shmt env에 facenet-pytorch가 없으면 코사인 측정 생략
        face_cosine = None
    if face_cosine is not None:
        cos = face_cosine(source_pil, result_img)
        rows.append({"candidate": "shmt", "variant": variant_label, "run_number": "-", "phase": "identity",
                     "time_sec": "", "vram_peak_mb": "", "notes": f"facenet_vggface2_cos={cos}"})
    to_pil_image(torch.clamp((ref_image[0] + 1.0) / 2.0, 0.0, 1.0).cpu()).save(RESULTS_DIR / "shmt_reference.jpg")
    write_rows(rows)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidate", required=True, choices=["stable_makeup", "shmt", "lcm_lora"])
    ap.add_argument("--variant", default=None, help="stable_makeup: fp32|fp16 (default fp32). shmt: h0|h4 (default h0)")
    ap.add_argument("--steps", type=int, default=None, help="DDIM steps (default: 30 for stable_makeup, 50 for shmt)")
    ap.add_argument("--guidance", type=float, default=1.6, help="stable_makeup/lcm_lora guidance_scale (default 1.6)")
    args = ap.parse_args()

    if args.candidate == "stable_makeup":
        bench_stable_makeup(args.variant or "fp32", args.steps or 30, args.guidance)
    elif args.candidate == "lcm_lora":
        bench_stable_makeup(args.variant or "fp16", args.steps or 4, args.guidance, lcm=True)
    else:
        bench_shmt(args.variant or "h0", args.steps or 50)
