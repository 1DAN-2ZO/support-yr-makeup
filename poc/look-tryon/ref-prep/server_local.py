"""서버(app_klein.py) 방식 그대로 — 실제 `_run` 을 Gradio 없이 불러 쓰고, 참고 사진 앞에 전처리 B 를 끼워 본다 (PoC).

app_klein.py 는 복사하지 않는다. 파일을 읽어서 메모리에서만 이렇게 고친 뒤 실행한다:
  - gradio 는 껍데기로 대신한다 (오류 클래스 · 임시 폴더만 쓰인다)
  - 파일 끝의 Gradio 화면 · 서버 띄우기(`demo = gr.Interface(...)` 부터)는 자른다
  - 모델 · 얼굴 점 모델 · 지시문 해석 저장 위치를 로컬 D 드라이브로 바꾼다 (서버용 ~/.cache/nudy 를 건드리지 않는다)
  - `_run` 안의 `ref = makeup_image.convert("RGB")` 바로 뒤에 `ref = REF_PREP(ref)` 한 줄을 끼운다 — 서버에 넣을 때의 한 줄과 같다
전처리 B 는 서버가 올려 둔 그리는 부품 · VAE 를 그대로 나눠 쓰는 Flux2KleinPipeline 이고, 지시문 해석은 미리 구해 둔 저장본을 쓴다
(글 해석 부품 7.5GB 는 서빙 때 올리지 않는다).

    D:\\envs\\flux2-poc\\python.exe server_local.py cases.json
cases.json: {"edit": {"prompt": "...", "seed": 1234, "long_side": 768},
             "cases": [{"bare": "...", "ref": "...", "mode": "raw|b", "out": "...", "expect_prep": "(선택) 같아야 할 사진"}]}
"""
import gc
import json
import sys
import tempfile
import time
import types
from pathlib import Path

import numpy as np
import torch
from PIL import Image

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import klein_edit  # noqa: E402  (fit · embeds_for 를 같이 쓴다)

SERVER_SRC = HERE.parent / "server-bench" / "app_klein.py"
LOCAL = Path(r"D:\flux2-poc")


def load_server() -> dict:
    """app_klein.py 를 고쳐 불러온 이름공간 — 모델이 그래픽카드에 올라간 상태"""
    gr = types.ModuleType("gradio")
    gr.Error = type("Error", (Exception,), {})
    gu = types.ModuleType("gradio.utils")
    tmp = tempfile.mkdtemp(prefix="srv_local_")
    gu.get_upload_folder = lambda: tmp
    sys.modules["gradio"], sys.modules["gradio.utils"] = gr, gu

    src = SERVER_SRC.read_text(encoding="utf8")
    cut = src.index("\ndemo = gr.Interface(")
    src = src[:cut]

    def swap(old: str, new: str) -> None:
        nonlocal src
        assert src.count(old) == 1, f"끼울 자리를 못 찾음 또는 여러 곳: {old!r}"
        src = src.replace(old, new)

    swap('MODEL_ID = "black-forest-labs/FLUX.2-klein-4B"', f'MODEL_ID = r"{klein_edit.MODEL}"')
    swap('LANDMARKER_PATH = Path.home() / ".cache" / "nudy" / "face_landmarker.task"', f'LANDMARKER_PATH = Path(r"{LOCAL / "models" / "face_landmarker.task"}")')
    swap('EMBEDS_PATH = Path.home() / ".cache" / "nudy" / "klein_prompt_embeds.pt"', f'EMBEDS_PATH = Path(r"{LOCAL / "embeds" / "server_prompt_embeds.pt"}")')
    swap('    ref = makeup_image.convert("RGB")\n', '    ref = makeup_image.convert("RGB")\n    ref = REF_PREP(ref)\n')

    ns: dict = {"__name__": "app_klein_local", "REF_PREP": lambda im: im}
    exec(compile(src, str(SERVER_SRC), "exec"), ns)
    return ns


def make_prep_b(ns: dict, emb: torch.Tensor, seed: int, long_side: int):
    """서버가 올려 둔 부품을 나눠 쓰는 사진 전체 고치기 — 추가 VRAM 없이"""
    from diffusers import Flux2KleinPipeline

    p = ns["pipe"]
    edit = Flux2KleinPipeline(scheduler=p.scheduler, vae=p.vae, text_encoder=None, tokenizer=None, transformer=p.transformer, is_distilled=True)
    shared = edit.transformer is p.transformer and edit.vae is p.vae
    print("부품 공유:", shared, flush=True)
    seen: dict = {}

    def prep(img: Image.Image) -> Image.Image:
        src, w, h = klein_edit.fit(img, long_side)
        gen = torch.Generator("cpu").manual_seed(seed)
        t = time.perf_counter()
        out = edit(image=src, prompt_embeds=emb.to("cuda", torch.bfloat16), height=h, width=w,
                   num_inference_steps=4, guidance_scale=1.0, generator=gen).images[0]
        seen["sec"] = time.perf_counter() - t
        seen["img"] = out
        return out

    prep.seen = seen  # type: ignore[attr-defined]
    return prep


def main() -> None:
    cfg = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
    e = cfg["edit"]
    prompts = {e["prompt"]} | {c["prompt"] for c in cfg["cases"] if c.get("prompt")}   # 케이스마다 다른 지시문 가능
    embs = klein_edit.embeds_for(sorted(prompts)) if any(c["mode"] in ("b", "gate") for c in cfg["cases"]) else {}                # 서버를 올리기 전에 — 글 해석 부품과 그리는 부품이 한꺼번에 안 올라가게
    gc.collect(); torch.cuda.empty_cache()
    ns = load_server()
    preps: dict = {}
    for c in cfg["cases"]:
        bare, ref = Image.open(c["bare"]).convert("RGB"), Image.open(c["ref"]).convert("RGB")
        if c["mode"] in ("b", "gate"):
            key = (c.get("prompt") or e["prompt"], int(c.get("seed", e.get("seed", 1234))))
            if key not in preps:
                preps[key] = make_prep_b(ns, embs[key[0]], key[1], int(e.get("long_side", 768)))
            prep_b = preps[key]
        rep = None
        if c["mode"] == "gate":              # 판정 → (각도가 크면) FLUX 정면화 → (한쪽 가림이면) 뒤집어 채우기 → 서버. 거절은 원본 그대로 (서비스는 원본을 통과시킨다)
            import occlusion_gate as og
            ref, rep = og.prep(ref, frontalize=prep_b)
            ref.save(Path(c["out"]).with_name(Path(c["out"]).stem + "_ref.png"))
            print(f"   판정={rep['verdict']}  {rep['why']}", flush=True)
        ns["REF_PREP"] = prep_b if c["mode"] == "b" else (lambda im: im)
        t = time.perf_counter()
        path, status = ns["_run"](bare, ref, 4, 0.85, True, 1234)       # 서버가 Gradio 로 받은 값과 같다
        total = time.perf_counter() - t
        out = Image.open(path).convert("RGB")
        Path(c["out"]).parent.mkdir(parents=True, exist_ok=True)
        out.save(c["out"])
        line = f"{Path(c['out']).name}  mode={c['mode']}  전체 {total:.1f}s"
        if c["mode"] == "b":
            prepped = prep_b.seen["img"]
            prepped.save(Path(c["out"]).with_name(Path(c["out"]).stem + "_prep.png"))
            line += f"  (전처리 {prep_b.seen['sec']:.1f}s)"
            if c.get("expect_prep"):
                exp = Image.open(c["expect_prep"]).convert("RGB")
                if exp.size == prepped.size:
                    mae = float(np.abs(np.asarray(exp, np.float32) - np.asarray(prepped, np.float32)).mean())
                    line += f"  단독 실행과 평균 차이 {mae:.2f}/255"
                else:
                    line += f"  (크기가 달라 못 견줌 {exp.size} vs {prepped.size})"
        print(line + f"\n   서버 측정: {status}", flush=True)


if __name__ == "__main__":
    main()
