"""VLM 선정 실험 실행기 — 학원 PC(RTX 3060 12GB)에서 돌린다.
GPU 가 다른 PC 에서 돌리면 속도·메모리 숫자가 달라진다.

    uv run --extra vlm python eval/vlm/run.py --model qwen3vl8b --stages 0,1,2,3,4
    uv run --extra vlm python eval/vlm/run.py --model qwen3vl8b --stages 1 --dry-run   # 요청 수·예상 시간만

순서: landmarks.py 로 측정 → run.py (모델마다) → report.py 로 요약.
모델 설정은 eval/vlm/models.json (models.example.json 을 복사해 경로를 채운다).
llama-server 를 모델마다 이 스크립트가 켜고 끈다 (슬롯 1개, 온도 0, 고정 seed — 조사 보고서 권장).

단계 (docs/research/vlm-2026-09-29/보고서.md 표와 같다)
  0 구동   연속 이미지 요청 N회 — 깨진 출력·VRAM
  1 속도   해상도 512/768 × 출력 상한 150/300 × prompt 캐시 켬/끔
  2 형식   입력 A(숫자+말)·B(말만)·C(숫자만)·D(측정 없음) × 제약 디코딩 켬, A 는 끔도
  3 결정론 같은 입력 반복 + 서버 재시작 뒤 + 밝기·자르기 조금 바꾼 사진
  4 뒤집기 측정값 하나만 뒤집기 (눈꼬리 처짐·눈두덩·윗입술)
  (5 한국어·6 사람 선호는 report.py 가 평가지를 만든다)

결과  $DHE_DATA_DIR/vlm-eval/runs/<모델>/stage<N>.jsonl — 사진은 id(해시 앞 12자리)로만 적는다
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from landmarks import core, data_dir  # noqa: E402

SEED = 42


# ---------- 사진 ----------


def load_faces(limit: int | None) -> list[dict]:
    work = data_dir() / "vlm-eval" / "work"
    faces = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(work.glob("*.json"))]
    if not faces:
        sys.exit(f"측정 결과가 없습니다 — 먼저 landmarks.py 를 돌려 주세요 ({work})")
    return faces[:limit] if limit else faces


def swap_pool() -> list[dict]:
    """다른 사람 사진 대조군의 후보 — 동양인 후보 240장 (landmarks.py 를 DHE_DATA_DIR=<pool> 로 돌려 둔 것)"""
    work = Path(os.environ.get("DHE_SWAP_POOL", data_dir() / "pool" / "vlm-eval")) / "work"
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(work.glob("*.json"))]


def ffhq_id(photo: str) -> str:
    """ffhq_012345.jpg · c012_012345.jpg → 012345 (같은 사람을 대조군에서 빼려고)"""
    return Path(photo).stem.split("_")[-1]


def pick_swap(face: dict, pool: list[dict], look: str, rep: int) -> dict:
    """같은 사람이 아닌 사진 하나 — 요청마다 정해진 seed 라 다시 돌려도 같다"""
    import random

    others = [p for p in pool if ffhq_id(p["photo"]) != ffhq_id(face["photo"])]
    return random.Random(f"{face['id']}|{look}|{rep}").choice(others)


def face_image(face: dict, res: int, perturb: str | None = None, photos: Path | None = None) -> str:
    """얼굴 가운데 정사각형으로 자르고 res×res 로.
    해상도를 고정해야 이미지 토큰 수·시간이 일정하다 (보고서)"""
    from PIL import Image, ImageEnhance

    if perturb == "blank":
        # 대조군 — 사진 없이 같은 글만. 답이 그대로면 모델이 사진을 안 본다 (Zhou 2026 · VLind-Bench)
        im = Image.new("RGB", (res, res), (128, 128, 128))
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=90)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    photos = photos or data_dir() / "vlm-eval" / "photos"
    im = Image.open(photos / face["photo"]).convert("RGB")
    xs = [p["x"] for p in face["lm"]]
    ys = [p["y"] for p in face["lm"]]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    side = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.35
    if perturb == "crop":
        cx += side * 0.03
        cy -= side * 0.03
    box = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))
    im = im.crop(box).resize((res, res), Image.Resampling.LANCZOS)
    if perturb == "bright":
        im = ImageEnhance.Brightness(im).enhance(1.08)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=90)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------- 서버 ----------


class Server:
    def __init__(self, cfg: dict, bin_path: str | list[str], port: int, log_dir: Path):
        self.cfg, self.bin, self.port, self.log_dir = cfg, bin_path, port, log_dir
        self.proc: subprocess.Popen | None = None
        self.url = f"http://127.0.0.1:{port}"

    def start(self) -> None:
        exe = self.bin if isinstance(self.bin, list) else [self.bin]  # 시험 때는 [python, fake_server.py]
        args = [
            *exe,
            "-m",
            self.cfg["gguf"],
            "--mmproj",
            self.cfg["mmproj"],
            "-ngl",
            "99",
            "-np",
            "1",
            "-c",
            str(self.cfg.get("ctx", 8192)),
            "--port",
            str(self.port),
            "--host",
            "127.0.0.1",
            "--seed",
            str(SEED),
            "--temp",
            "0",
            *self.cfg.get("server_args", []),
        ]
        self.log_dir.mkdir(parents=True, exist_ok=True)
        log = open(self.log_dir / "llama-server.log", "a", encoding="utf-8")
        self.proc = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT)
        t0 = time.time()
        while time.time() - t0 < 600:
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"llama-server 가 꺼졌습니다 — {self.log_dir / 'llama-server.log'} 를 보세요"
                )
            try:
                if httpx.get(self.url + "/health", timeout=2).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(2)
        raise RuntimeError("llama-server 가 10분 안에 준비되지 않았습니다")

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None

    def ask(
        self, image: str, text: str, *, schema: dict | None, max_tokens: int, cache: bool, extra: dict
    ) -> dict:
        body = {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": image}},
                        {"type": "text", "text": text},
                    ],
                }
            ],
            "temperature": 0,
            "seed": SEED,
            "max_tokens": max_tokens,
            "cache_prompt": cache,
            **extra,
        }
        if schema is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "plan", "schema": schema, "strict": True},
            }
        t0 = time.perf_counter()
        try:
            r = httpx.post(self.url + "/v1/chat/completions", json=body, timeout=180)
            ms = (time.perf_counter() - t0) * 1000
            if r.status_code != 200:
                return {"ms": ms, "error": f"HTTP {r.status_code}: {r.text[:300]}"}
            j = r.json()
            ch = j["choices"][0]
            return {
                "ms": ms,
                "content": ch["message"].get("content") or "",
                # 생각 모드가 켜진 모델은 답을 여기에 다 쓰고 본문이 빈다 (Gemma 4 · MiniCPM-V 4.5, 1차 선별)
                "reasoning_chars": len(ch["message"].get("reasoning_content") or ""),
                "finish": ch.get("finish_reason"),
                "usage": j.get("usage"),
                "timings": j.get("timings"),
            }
        except httpx.HTTPError as e:
            return {"ms": (time.perf_counter() - t0) * 1000, "error": f"{type(e).__name__}: {e}"}


def vram_mb() -> int | None:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout
        return int(out.strip().splitlines()[0])
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        return None


# ---------- 단계 ----------


def parse_cond(c: str) -> tuple[str, bool, str | None]:
    """2단계 조건 — 형식 글자 + 선택 꼬리. 'A' 제약 켬, 'Au' 제약 끔, 'E.blank' 빈 사진"""
    c, _, pert = c.partition(".")
    return c[0], not c.endswith("u"), pert or None


def plan_jobs(stage: int, faces: list[dict], looks: list[str], args) -> list[dict]:
    """요청 목록 (실행 전에 개수·시간을 보여 주려고 먼저 만든다)"""
    jobs: list[dict] = []
    variants = [v for v in args.variant.split(",") if v]
    base = {
        "variant": variants[0],
        "constrained": True,
        "res": args.res,
        "max_tokens": args.max_tokens,
        "cache": False,
        "perturb": None,
        "flip": None,
    }
    if stage == 0:
        for i in range(args.smoke):
            f = faces[i % len(faces)]
            jobs.append({**base, "face": f, "look": looks[i % len(looks)], "rep": i})
    elif stage == 1:
        for f in faces[: args.speed_photos]:
            for res in (512, 768):
                for mt in (150, 300):
                    for cache in (True, False):
                        for rep in range(3):
                            jobs.append(
                                {
                                    **base,
                                    "face": f,
                                    "look": looks[0],
                                    "res": res,
                                    "max_tokens": mt,
                                    "cache": cache,
                                    "rep": rep,
                                }
                            )
    elif stage == 2:
        conds = [parse_cond(c) for c in args.conds.split(",") if c]
        for f in faces:
            for look in looks:
                for v, con, pert in conds:
                    for rep in range(args.reps):
                        jobs.append(
                            {
                                **base,
                                "face": f,
                                "look": look,
                                "variant": v,
                                "constrained": con,
                                "perturb": pert,
                                "rep": rep,
                            }
                        )
    elif stage == 3:
        # 사진마다 반복의 앞 절반은 지금 서버, 뒤 절반은 다시 켠 서버 — 같은 사진이 재시작 전후로 같은가
        # 형식이 여럿이면 형식마다 (재시작은 한 번 — 앞 절반을 전부 돈 뒤)
        half = args.reps_det // 2
        for phase, reps in (("before", range(half)), ("after", range(half, args.reps_det))):
            for v in variants:
                for f in faces:
                    for look in looks[:1]:
                        for rep in reps:
                            jobs.append(
                                {**base, "variant": v, "face": f, "look": look, "rep": rep, "phase": phase}
                            )
        for v in variants:
            for f in faces:
                for look in looks[:1]:
                    for p in ("bright", "crop"):
                        for rep in range(args.perturb_reps):
                            jobs.append(
                                {
                                    **base,
                                    "variant": v,
                                    "face": f,
                                    "look": look,
                                    "perturb": p,
                                    "rep": rep,
                                    "phase": "after",
                                }
                            )
    elif stage == 4:
        flips = core([{"op": "flips", "m": f["m"]} for f in faces])
        for v in variants:
            for f, fl in zip(faces, flips, strict=True):
                for look in looks[:1]:
                    jobs.append({**base, "variant": v, "face": f, "look": look, "rep": 0})  # 뒤집기 전
                    for x in fl:
                        jobs.append(
                            {
                                **base,
                                "variant": v,
                                "face": {**f, "m": x["m"]},
                                "look": look,
                                "flip": x["name"],
                                "rep": 0,
                            }
                        )
    return jobs


def run_stage(
    stage: int, server: Server, cfg: dict, faces: list[dict], looks: list[str], args, out: Path
) -> None:
    jobs = plan_jobs(stage, faces, looks, args)
    est = len(jobs) * args.sec_per_req / 60
    print(f"단계 {stage}: 요청 {len(jobs)}개 (한 건 {args.sec_per_req}초 가정 시 약 {est:.0f}분)")
    if args.dry_run:
        return
    schemas = core([{"op": "schema", "variant": j["variant"], "m": j["face"]["m"]} for j in jobs])
    prompts = core(
        [{"op": "prompt", "m": j["face"]["m"], "look": j["look"], "variant": j["variant"]} for j in jobs]
    )
    extra = cfg.get("request_extra", {})
    pool = swap_pool() if any(j.get("perturb") == "swap" for j in jobs) else []
    if any(j.get("perturb") == "swap" for j in jobs) and not pool:
        sys.exit("다른 사람 사진 대조군의 후보가 없습니다 — DHE_SWAP_POOL/work 를 확인해 주세요")
    pool_photos = Path(os.environ.get("DHE_SWAP_POOL", data_dir() / "pool" / "vlm-eval")) / "photos"
    images: dict[tuple, str] = {}
    peak = vram_mb() or 0
    restarted = False
    with open(out / f"stage{stage}.jsonl", "a", encoding="utf-8") as fh:
        for i, (j, text, schema) in enumerate(zip(jobs, prompts, schemas, strict=True)):
            if j.get("phase") == "after" and not restarted:
                server.stop()
                server.start()
                restarted = True
            f = j["face"]
            swap = pick_swap(f, pool, j["look"], j["rep"]) if j.get("perturb") == "swap" else None
            key = (swap["id"] if swap else f["id"], j["res"], j["perturb"])
            if key not in images:
                images[key] = (
                    face_image(swap, j["res"], None, pool_photos)
                    if swap
                    else face_image(f, j["res"], j["perturb"])
                )
            r = server.ask(
                images[key],
                text,
                schema=schema if j["constrained"] else None,
                max_tokens=j["max_tokens"],
                cache=j["cache"],
                extra=extra,
            )
            row = {k: v for k, v in j.items() if k != "face"}
            row.update({"stage": stage, "model": args.model, "photo_id": f["id"], **r})
            if swap:
                row["swap_id"] = swap["id"]
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            if i % 10 == 0:
                peak = max(peak, vram_mb() or 0)
                print(
                    f"  {i + 1}/{len(jobs)}  {r.get('ms', 0):.0f}ms  "
                    + (f"오류 {r['error']}" if "error" in r else "")
                )
    (out / f"stage{stage}.meta.json").write_text(
        json.dumps({"vram_peak_mb": peak, "n": len(jobs)}), encoding="utf-8"
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True, help="models.json 의 이름")
    ap.add_argument("--stages", default="0,1,2,3,4")
    ap.add_argument("--looks", default="daily,smoky", help="화장 id (rules/looks.json)")
    ap.add_argument("--photos", type=int, default=None, help="앞에서 몇 장만 (시험 삼아)")
    ap.add_argument("--res", type=int, default=512, help="2·3·4단계 이미지 한 변 (1단계 결과로 정한다)")
    ap.add_argument("--max-tokens", type=int, default=300)
    ap.add_argument(
        "--variant", default="A", help="0·1단계는 첫 형식, 3·4단계는 형식마다 (예: E,F). A = 앱 그대로"
    )
    ap.add_argument(
        "--conds",
        default="A,B,C,D,Au",
        help="2단계 조건 — 형식 글자, u = 제약 끔, .blank = 빈 사진, .swap = 다른 사람 사진 (예: E,F,E.swap)",
    )
    ap.add_argument("--smoke", type=int, default=100, help="0단계 연속 요청 수")
    ap.add_argument("--speed-photos", type=int, default=5)
    ap.add_argument("--reps", type=int, default=5, help="2단계 반복 (보고서 10 — 시간 보고 늘린다)")
    ap.add_argument("--reps-det", type=int, default=10, help="3단계 반복")
    ap.add_argument(
        "--perturb-reps", type=int, default=3, help="3단계 밝기·자르기 반복 (온도 0 이면 1 로 충분)"
    )
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--sec-per-req", type=float, default=4.0, help="예상 시간 계산용")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conf_path = Path(os.environ.get("DHE_VLM_MODELS", HERE / "models.json"))
    if not conf_path.exists():
        sys.exit("eval/vlm/models.json 이 없습니다 — models.example.json 을 복사해 경로를 채워 주세요")
    conf = json.loads(conf_path.read_text(encoding="utf-8"))
    if args.model not in conf["models"]:
        sys.exit(f"models.json 에 {args.model} 이 없습니다: {', '.join(conf['models'])}")
    cfg = conf["models"][args.model]
    faces = load_faces(args.photos)
    looks = [x for x in args.looks.split(",") if x]
    known = set(core([{"op": "looks"}])[0])
    if bad := [x for x in looks if x not in known]:
        sys.exit(f"모르는 화장 id: {bad}")

    out = data_dir() / "vlm-eval" / "runs" / args.model
    out.mkdir(parents=True, exist_ok=True)
    stages = [int(s) for s in args.stages.split(",") if s]
    server = Server(cfg, conf["llama_server"], args.port, out)
    if not args.dry_run:
        server.start()
    try:
        for st in stages:
            run_stage(st, server, cfg, faces, looks, args, out)
    finally:
        server.stop()
    print(f"끝 → {out}  (요약: uv run --extra vlm python eval/vlm/report.py --model {args.model})")


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
