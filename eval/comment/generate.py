"""화면 6 종합 코멘트 확인 실험 (#287) — 텍스트 LLM 으로 C 코멘트를 만든다. 사진은 넘기지 않는다.

    uv run --extra vlm python eval/comment/generate.py --model text-gemma4_e4b
    uv run --extra vlm python eval/comment/generate.py --model text-qwen3_14b

모델 설정은 eval/vlm/models.json (gguf 만, mmproj 없음).
llama-server 를 켜고 끄는 코드는 eval/vlm/run.py 를 그대로 쓴다.
세션마다 --reps 번 묻는다 (같은 입력에 같은 답이 나오는지). 결과: $DHE_DATA_DIR/comment-eval/runs/<모델>.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "vlm"))
from bridge import core, out_dir  # noqa: E402
from run import SEED, Server  # noqa: E402  (eval/vlm/run.py)


def ask(url: str, text: str, schema: dict, extra: dict, max_tokens: int) -> dict:
    body = {
        "messages": [{"role": "user", "content": text}],
        "temperature": 0,
        "seed": SEED,
        "max_tokens": max_tokens,
        "cache_prompt": False,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "comment", "schema": schema, "strict": True},
        },
        **extra,
    }
    t0 = time.perf_counter()
    try:
        r = httpx.post(url + "/v1/chat/completions", json=body, timeout=180)
        ms = (time.perf_counter() - t0) * 1000
        if r.status_code != 200:
            return {"ms": ms, "error": f"HTTP {r.status_code}: {r.text[:300]}"}
        ch = r.json()["choices"][0]
        return {
            "ms": ms,
            "content": ch["message"].get("content") or "",
            "reasoning_chars": len(ch["message"].get("reasoning_content") or ""),
            "finish": ch.get("finish_reason"),
        }
    except httpx.HTTPError as e:
        return {"ms": (time.perf_counter() - t0) * 1000, "error": f"{type(e).__name__}: {e}"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True)
    ap.add_argument("--reps", type=int, default=2)
    ap.add_argument("--max-tokens", type=int, default=400)
    ap.add_argument("--port", type=int, default=8092)
    a = ap.parse_args()

    conf = json.loads((HERE.parent / "vlm" / "models.json").read_text(encoding="utf-8"))
    cfg = conf["models"][a.model]
    sessions = core([{"op": "sessions"}])[0]
    out = out_dir() / "runs"
    out.mkdir(parents=True, exist_ok=True)
    (out_dir() / "sessions.json").write_text(json.dumps(sessions, ensure_ascii=False), encoding="utf-8")
    meta = core([{"op": "meta"}])[0]

    srv = Server(cfg, conf["llama_server"], a.port, out / a.model)
    srv.start()
    rows = []
    try:
        for rep in range(a.reps):
            for s in sessions:
                r = ask(srv.url, s["prompt"], s["schema"], cfg.get("request_extra", {}), a.max_tokens)
                g = (
                    core([{"op": "gate", "session": s, "raw": r.get("content", "")}])[0]
                    if "content" in r
                    else None
                )
                rows.append(
                    {
                        "model": a.model,
                        "session": s["id"],
                        "kind": s["kind"],
                        "rep": rep,
                        "prompt_ver": meta["promptVer"],
                        **r,
                        "gate": g,
                    }
                )
                print(s["id"], rep, round(r["ms"]), (g or {}).get("ok"), (g or {}).get("reasons"), flush=True)
    finally:
        srv.stop()
    with (out / f"{a.model}.jsonl").open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"끝 → {out / (a.model + '.jsonl')}")


if __name__ == "__main__":
    main()
