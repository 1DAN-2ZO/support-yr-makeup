"""화면 6 종합 코멘트 확인 실험 (#287) — 요약 · 평가지 · 집계.

    uv run --extra vlm python eval/comment/results.py                         # 모델별 자동 지표
    uv run --extra vlm python eval/comment/results.py --sheet text-gemma4_e4b  # 평가지 (A · B · C 가림)
    uv run --extra vlm python eval/comment/results.py --ratings comment-rating-*.json

관문은 저장된 응답에 지금 코드(comment.ts gateC)로 다시 건다 — 관문을 고치면 다시 묻지 않아도 된다.
평가지의 C 는 앱이 보여 줄 그대로: 관문을 통과한 LLM 글, 거절되면 B (앱의 대신 쓰기와 같다).
통과 기준 (미리 정함, #287): C 를 B 보다 고른 비율의 95% 신뢰구간 하한 > 50%.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from bridge import core, out_dir  # noqa: E402

ROOT = HERE.parent.parent
STATUS_ORDER = ["brow", "liner", "shadow", "lip", "cheek", "contour"]


def sessions() -> dict[str, dict]:
    return {s["id"]: s for s in json.loads((out_dir() / "sessions.json").read_text(encoding="utf-8"))}


def rows(model: str) -> list[dict]:
    p = out_dir() / "runs" / f"{model}.jsonl"
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


def regate(model: str, S: dict[str, dict]) -> list[dict]:
    R = rows(model)
    G = core([{"op": "gate", "session": S[r["session"]], "raw": r.get("content", "")} for r in R])
    for r, g in zip(R, G, strict=True):
        r["gate"] = g
    return R


def pct(xs: list[float], q: float) -> float:
    s = sorted(xs)
    return s[min(len(s) - 1, int(len(s) * q))]


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if not n:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def summary(models: list[str]) -> str:
    S = sessions()
    lines = [
        f"# 화면 6 종합 코멘트 — 자동 지표 ({date.today()})",
        "",
        "| 모델 | 관문 통과 | 같은 입력 같은 답 | p50 ms | p95 ms | 글 길이 평균 | 거절 이유 |",
        "|---|---|---|---|---|---|---|",
    ]
    bl = [len(s["B"]) for s in S.values()]
    for m in models:
        R = regate(m, S)
        ok = sum(r["gate"]["ok"] for r in R)
        by: dict[str, set] = defaultdict(set)
        for r in R:
            by[r["session"]].add(r.get("content"))
        same = sum(len(v) == 1 for v in by.values())
        ms = [r["ms"] for r in R]
        ln = [len(r["gate"]["comment"]) for r in R]
        why = Counter(x for r in R for x in r["gate"]["reasons"])
        lines.append(
            f"| {m} | {ok}/{len(R)} | {same}/{len(by)} | {pct(ms, 0.5):.0f} | {pct(ms, 0.95):.0f} | "
            f"{sum(ln) / len(ln):.0f}자 | {', '.join(f'{k} {v}' for k, v in why.most_common()) or '—'} |"
        )
    lines.append(f"| (B 규칙 요약) | — | — | — | — | {sum(bl) / len(bl):.0f}자 | — |")
    return "\n".join(lines)


# ---------- 평가지 ----------


def sheet(model: str) -> Path:
    S = sessions()
    R = [r for r in regate(model, S) if r["rep"] == 0]
    from_model = {r["session"]: r for r in R}
    rnd = random.Random(20261002)
    items, key = [], []
    for sid, s in S.items():
        r = from_model[sid]
        c_text = r["gate"]["comment"] if r["gate"]["ok"] else s["B"]
        # C 가 관문에서 거절되면 앱은 B 를 보여 준다 —
        # 같은 글 두 개를 내지 않고 A · B 만 (C 대 B 계산에서 뺀다)
        kinds = "ABC" if r["gate"]["ok"] else "AB"
        texts = {"A": s["A"], "B": s["B"], "C": c_text}
        ids = rnd.sample(range(100, 999), len(kinds))
        cands = [{"id": f"c{i}", "text": texts[k]} for i, k in zip(ids, kinds, strict=True)]
        rnd.shuffle(cands)
        key.append(
            {
                "id": sid,
                "kind": s["kind"],
                "map": {f"c{i}": k for i, k in zip(ids, kinds, strict=True)},
                "c_fallback": not r["gate"]["ok"],
                "c_reasons": r["gate"]["reasons"],
            }
        )
        parts = sorted(s["parts"], key=lambda p: STATUS_ORDER.index(p["partId"]))
        items.append(
            {
                "id": sid,
                "look": s["lookName"],
                "parts": [
                    {"name": PART_KO[p["partId"]], "status": p["status"], "score": p["score"]} for p in parts
                ],
                "cands": cands,
            }
        )
    name = f"comment-{model}"
    data = json.dumps({"sheet": name, "items": items}, ensure_ascii=False).replace("</", r"<\/")
    page = (HERE / "sheet_page.html").read_text(encoding="utf-8")
    page = page.replace("{{COUNT}}", str(len(items))).replace("{{DATA}}", data)
    out = out_dir() / "out"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{name}.html").write_text(page, encoding="utf-8")
    (out / f"{name}.key.json").write_text(json.dumps(key, ensure_ascii=False, indent=1), encoding="utf-8")
    return out / f"{name}.html"


PART_KO = {
    "brow": "눈썹",
    "liner": "아이라이너",
    "shadow": "섀도우",
    "lip": "입술",
    "cheek": "볼터치",
    "contour": "쉐딩·하이라이트",
}


# ---------- 집계 ----------


def ratings(files: list[str]) -> str:
    sheets = {json.loads(Path(f).read_text(encoding="utf-8"))["sheet"] for f in files}
    if len(sheets) != 1:
        sys.exit(f"평가지가 섞였습니다: {sheets}")
    name = sheets.pop()
    key = {
        k["id"]: k for k in json.loads((out_dir() / "out" / f"{name}.key.json").read_text(encoding="utf-8"))
    }
    picks: list[tuple[str, str, str, int]] = []  # (평가자, 세션, A·B·C, 보인 자리)
    who_count: Counter = Counter()
    for f in files:
        r = json.loads(Path(f).read_text(encoding="utf-8"))
        who = r.get("who") or Path(f).stem
        for it in r["items"]:
            if not it["pick"]:
                continue
            picks.append((who, it["id"], key[it["id"]]["map"][it["pick"]], it["shown"].index(it["pick"]) + 1))
            who_count[who] += 1
    tot = Counter(p[2] for p in picks)
    cb = [p for p in picks if p[2] in "BC" and not key[p[1]]["c_fallback"]]
    k = sum(p[2] == "C" for p in cb)
    lo, hi = wilson(k, len(cb))
    verdict = "통과 — LLM 을 넣는다" if lo > 0.5 else "못 넘음 — B(규칙 요약)를 넣고 LLM 은 MVP 에서 뺀다"
    lines = [
        f"# 화면 6 종합 코멘트 — 사람 평가 ({name}, {date.today()})",
        "",
        f"평가자 {len(who_count)}명 ({', '.join(f'{w} {n}' for w, n in who_count.items())}) "
        f"· 답 {len(picks)}",
        f"- 고른 수: A 이어 붙이기 {tot['A']} · B 규칙 요약 {tot['B']} · C LLM {tot['C']}",
        f"- **C 대 B** (둘 중 하나를 고른 답만): C {k}/{len(cb)} = {k / max(1, len(cb)):.1%} "
        f"(95% {lo:.2f}~{hi:.2f}) → {verdict}",
        f"- C 가 관문에서 거절돼 B 로 대신한 문항: {sum(v['c_fallback'] for v in key.values())}개 "
        "— A · B 만 보여 줬고 C 대 B 에서 뺐다",
        "",
        "| 세션 종류 | A | B | C |",
        "|---|---|---|---|",
    ]
    by_kind: dict[str, Counter] = defaultdict(Counter)
    for _, sid, x, _ in picks:
        by_kind[key[sid]["kind"]][x] += 1
    for kd, c in sorted(by_kind.items()):
        lines.append(f"| {kd} | {c['A']} | {c['B']} | {c['C']} |")
    pos = Counter(p[3] for p in picks)
    lines += ["", f"자리 쏠림 (보인 순서 1·2·3번 고른 수): {pos[1]} · {pos[2]} · {pos[3]}"]
    text = "\n".join(lines)
    (out_dir() / "out" / f"ratings-{name}.md").write_text(text, encoding="utf-8")
    return text


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models", nargs="*", default=["text-gemma4_e4b", "text-qwen3_14b"])
    ap.add_argument("--sheet")
    ap.add_argument("--ratings", nargs="*")
    a = ap.parse_args()
    if a.sheet:
        print(f"평가지 → {sheet(a.sheet)}")
    elif a.ratings:
        print(ratings(a.ratings))
    else:
        text = summary([m for m in a.models if (out_dir() / "runs" / f"{m}.jsonl").exists()])
        (out_dir() / "out").mkdir(parents=True, exist_ok=True)
        (out_dir() / "out" / "summary.md").write_text(text, encoding="utf-8")
        print(text)


if __name__ == "__main__":
    main()
