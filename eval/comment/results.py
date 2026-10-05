"""화면 6 총평 확인 실험 (#287) — 요약 · 평가지 · 집계.

    uv run --extra vlm python eval/comment/results.py                         # 모델별 자동 지표
    uv run --extra vlm python eval/comment/results.py --sheet text-gemma4_e4b  # 평가지 (A · B · C 가림)
    uv run --extra vlm python eval/comment/results.py --ratings oneline-rating-*.json

관문은 저장된 응답에 지금 코드(comment.ts gateC)로 다시 건다 — 관문을 고치면 다시 묻지 않아도 된다.
부위별 한 줄(A)은 화면 6 에 늘 나오므로 비교 대상이 아니라 문항의 맥락이다. 비교는 총평 B(규칙) 대 C(LLM).
통과 기준 (미리 정함, #287): C 를 B 보다 고른 비율(비슷함 뺌)의 95% 신뢰구간 하한 > 50%.
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
        f"# 화면 6 총평 — 자동 지표 ({date.today()})",
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
    lines.append(f"| (B 규칙 총평) | — | — | — | — | {sum(bl) / len(bl):.0f}자 | — |")
    b2 = [len(s["B2"]) for s in S.values()]
    lines.append(f"| (B′ 규칙 총평 + 제품으로 할 일) | — | — | — | — | {sum(b2) / len(b2):.0f}자 | — |")
    return "\n".join(lines)


# ---------- 평가지 ----------


def sheet(model: str, rule: str = "B") -> Path:
    """평가지 — 부위별 한 줄(화면 6 에 늘 나옴)은 맥락, 총평 B · C 를 비교 (+ 비슷함).
    C 가 관문에서 거절된 세션은 앱이 B 를 보여 주므로 B 와 B 를 비교하게 된다 —
    평가지에서 빼고 개수만 적는다.
    rule = 비교할 규칙 총평 (B · B2 = 할 일을 붙인 B′). 정답표에는 늘 "B" 로 적는다"""
    S = sessions()
    R = [r for r in regate(model, S) if r["rep"] == 0]
    from_model = {r["session"]: r for r in R}
    rnd = random.Random(20261002)
    items, key = [], []
    for sid, s in S.items():
        r = from_model[sid]
        row = {
            "id": sid,
            "kind": s["kind"],
            "c_fallback": not r["gate"]["ok"],
            "c_reasons": r["gate"]["reasons"],
        }
        if row["c_fallback"]:
            key.append({**row, "map": {}})
            continue
        ids = rnd.sample(range(100, 999), 2)
        texts = {"B": s[rule], "C": r["gate"]["comment"]}
        cands = [{"id": f"c{i}", "text": texts[k]} for i, k in zip(ids, "BC", strict=True)]
        rnd.shuffle(cands)
        key.append({**row, "map": {f"c{i}": k for i, k in zip(ids, "BC", strict=True)}})
        parts = sorted(s["parts"], key=lambda p: STATUS_ORDER.index(p["partId"]))
        says = dict(line.split(": ", 1) for line in s["A"].splitlines())
        items.append(
            {
                "id": sid,
                "look": s["lookName"],
                "parts": [
                    {
                        "name": PART_KO[p["partId"]],
                        "status": p["status"],
                        "score": p["score"],
                        "say": says[PART_KO[p["partId"]]],
                    }
                    for p in parts
                ],
                "cands": cands,
            }
        )
    name = f"total-{model}" if rule == "B" else f"total-{rule.lower()}-{model}"
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
    picks: list[tuple[str, str, str, int]] = []  # (평가자, 세션, B · C · same, 보인 자리 — same 은 0)
    who_count: Counter = Counter()
    for f in files:
        r = json.loads(Path(f).read_text(encoding="utf-8"))
        who = r.get("who") or Path(f).stem
        for it in r["items"]:
            if not it["pick"]:
                continue
            if it["pick"] == "same":
                picks.append((who, it["id"], "same", 0))
            else:
                picks.append(
                    (who, it["id"], key[it["id"]]["map"][it["pick"]], it["shown"].index(it["pick"]) + 1)
                )
            who_count[who] += 1
    tot = Counter(p[2] for p in picks)
    k, n = tot["C"], tot["B"] + tot["C"]
    lo, hi = wilson(k, n)
    verdict = "통과 — LLM 총평을 넣는다" if lo > 0.5 else "못 넘음 — B(규칙 총평)를 넣고 LLM 은 MVP 에서 뺀다"
    fb = sum(v["c_fallback"] for v in key.values())
    lines = [
        f"# 화면 6 총평 — 사람 평가 ({name}, {date.today()})",
        "",
        f"평가자 {len(who_count)}명 ({', '.join(f'{w} {c}' for w, c in who_count.items())}) "
        f"· 답 {len(picks)}",
        f"- 고른 수: B 규칙 {tot['B']} · C LLM {tot['C']} · 비슷함 {tot['same']}",
        f"- **C 대 B** (비슷함 뺌): C {k}/{n} = {k / max(1, n):.1%} (95% {lo:.2f}~{hi:.2f}) → {verdict}",
        f"- C 가 관문에서 거절돼 평가지에서 뺀 세션: {fb}개 / {len(key)} — 앱에서는 이 세션에 B 가 나간다",
        "",
        "| 세션 종류 | B | C | 비슷함 |",
        "|---|---|---|---|",
    ]
    by_kind: dict[str, Counter] = defaultdict(Counter)
    for _, sid, x, _ in picks:
        by_kind[key[sid]["kind"]][x] += 1
    for kd, c in sorted(by_kind.items()):
        lines.append(f"| {kd} | {c['B']} | {c['C']} | {c['same']} |")
    pos = Counter(p[3] for p in picks if p[3])
    lines += ["", f"자리 쏠림 (보인 순서 1·2번 고른 수): {pos[1]} · {pos[2]}"]
    text = "\n".join(lines)
    (out_dir() / "out" / f"ratings-{name}.md").write_text(text, encoding="utf-8")
    return text


# ---------- 부위별 한 줄 (3차) ----------


def part_rows(model: str) -> tuple[dict, list[dict]]:
    """(세션 id → parts.json 항목, [{session, part, rep, ms, line, gate}]) — 관문은 지금 코드로 다시 건다"""
    P = {s["id"]: s for s in json.loads((out_dir() / "parts.json").read_text(encoding="utf-8"))}
    raw = (out_dir() / "runs" / f"{model}.parts.jsonl").read_text(encoding="utf-8").splitlines()
    R = [json.loads(x) for x in raw if x.strip()]
    out, reqs = [], []
    for r in R:
        s = P[r["session"]]
        try:
            lines = json.loads(r.get("content") or "{}").get("lines", {})
        except json.JSONDecodeError:
            lines = {}
        for t in s["targets"]:
            line = lines.get(t["part"], "")
            out.append({"session": s["id"], "part": t["part"], "rep": r["rep"], "ms": r["ms"], "line": line})
            reqs.append({"op": "gateLine", "session": s["session"], "part": t["part"], "line": line})
    for o, g in zip(out, core(reqs), strict=True):
        o["gate"] = g
    return P, out


def part_summary(model: str) -> str:
    P, R = part_rows(model)
    ok = sum(r["gate"]["ok"] for r in R)
    by: dict[tuple, set] = defaultdict(set)
    for r in R:
        by[(r["session"], r["part"])].add(r["line"])
    same = sum(len(v) == 1 for v in by.values())
    ms = sorted({(r["session"], r["rep"]): r["ms"] for r in R}.values())
    why = Counter(x.split(":")[0] for r in R for x in r["gate"]["reasons"])
    ln = [len(r["line"]) for r in R]
    rl = [len(t["rule"]) for s in P.values() for t in s["targets"]]
    return "\n".join(
        [
            f"# 화면 6 부위별 한 줄 — 자동 지표 ({date.today()})",
            "",
            "| 모델 | 관문 통과 (줄) | 같은 입력 같은 답 | 세션당 p50 / p95 ms | 줄 길이 | 거절 이유 |",
            "|---|---|---|---|---|---|",
            f"| {model} | {ok}/{len(R)} | {same}/{len(by)} | {pct(ms, 0.5):.0f} / {pct(ms, 0.95):.0f} | "
            f"{sum(ln) / len(ln):.0f}자 | {', '.join(f'{k} {v}' for k, v in why.most_common()) or '—'} |",
            f"| (R 규칙 한 줄) | — | — | — | {sum(rl) / len(rl):.0f}자 | — |",
        ]
    )


def part_sheet(model: str) -> Path:
    """평가지 — 부위 하나의 채점 사실(수치 · 기준)을 보여 주고 R(규칙) · L(LLM) 한 줄을 비교 (+ 비슷함).
    LLM 줄이 관문에서 거절되면 앱은 R 을 보여 주므로 그 줄은 빼고 개수만 적는다.
    정답표에는 R = "B", L = "C" 로 적는다"""
    P, R = part_rows(model)
    rnd = random.Random(20261003)
    items, key = [], []
    for r in (x for x in R if x["rep"] == 0):
        s = P[r["session"]]
        t = next(x for x in s["targets"] if x["part"] == r["part"])
        iid = f"{s['id']}-{t['part']}"
        row = {
            "id": iid,
            "kind": PART_KO[t["part"]],
            "c_fallback": not r["gate"]["ok"],
            "c_reasons": r["gate"]["reasons"],
        }
        if row["c_fallback"]:
            key.append({**row, "map": {}})
            continue
        ids = rnd.sample(range(100, 999), 2)
        texts = {"B": t["rule"], "C": r["gate"]["line"]}
        cands = [{"id": f"c{i}", "text": texts[k]} for i, k in zip(ids, "BC", strict=True)]
        rnd.shuffle(cands)
        key.append({**row, "map": {f"c{i}": k for i, k in zip(ids, "BC", strict=True)}})
        items.append(
            {
                "id": iid,
                "look": f"{s['lookName']} · {PART_KO[t['part']]}",
                "parts": [
                    {
                        "name": PART_KO[t["part"]],
                        "status": "passed",
                        "score": t["score"],
                        "say": " / ".join(t["facts"]),
                    }
                ],
                "cands": cands,
            }
        )
    name = f"parts-{model}"
    data = json.dumps({"sheet": name, "items": items}, ensure_ascii=False).replace("</", r"<\/")
    page = (HERE / "parts_page.html").read_text(encoding="utf-8")
    page = page.replace("{{COUNT}}", str(len(items))).replace("{{DATA}}", data)
    out = out_dir() / "out"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{name}.html").write_text(page, encoding="utf-8")
    (out / f"{name}.key.json").write_text(json.dumps(key, ensure_ascii=False, indent=1), encoding="utf-8")
    return out / f"{name}.html"


# ---------- 수치 전부 넣은 부위별 한 줄 (4차) ----------


def raw_rows(model: str, task: str) -> tuple[dict, list[dict]]:
    """(세션 id → parts_raw.json 항목, [{session, rep, ms, reasoning_chars, score: scoreRaw 결과}])"""
    P = {s["id"]: s for s in json.loads((out_dir() / "parts_raw.json").read_text(encoding="utf-8"))}
    lines = (out_dir() / "runs" / f"{model}.{task}.jsonl").read_text(encoding="utf-8").splitlines()
    R = [json.loads(x) for x in lines if x.strip()]
    reqs = [{"op": "scoreRaw", "session": P[r["session"]]["session"], "raw": r.get("content", "")} for r in R]
    for r, sc in zip(R, core(reqs), strict=True):
        r["score"] = sc
    return P, R


def raw_summary(model: str, task: str) -> str:
    P, R = raw_rows(model, task)
    parts = [(r, p) for r in R for p in r["score"]["parts"]]
    tp = sum(p["tp"] for _, p in parts)
    fp = sum(p["fp"] for _, p in parts)
    fn = sum(p["fn"] for _, p in parts)
    exact = sum(set(p["said"]) == set(p["truth"]) for _, p in parts)
    bad = [p for _, p in parts if not p["truth"]]
    iss = [p for _, p in parts if p["truth"]]
    by: dict[str, set] = defaultdict(set)
    for r in R:
        by[r["session"]].add(r.get("content"))
    ms = [r["ms"] for r in R]
    why = Counter(x.split(":")[0] for _, p in parts for x in p["reasons"])
    think = sum(r.get("reasoning_chars", 0) for r in R) / len(R)
    same = sum(len(v) == 1 for v in by.values())
    return "\n".join(
        [
            f"## {model} · {task} ({date.today()})",
            f"- 답 읽힘 {sum(r['score']['parsed'] for r in R)}/{len(R)} · 같은 입력 같은 답 {same}/{len(by)}",
            f"- 세션당 p50 {pct(ms, 0.5) / 1000:.1f}초 · p95 {pct(ms, 0.95) / 1000:.1f}초 "
            f"· 생각 글 평균 {think:.0f}자",
            f"- **문제 찾기** (진짜 = 채점 진단): 정밀도 {tp / max(1, tp + fp):.0%} · "
            f"재현율 {tp / max(1, tp + fn):.0%} · 부위 정확히 맞춤 {exact}/{len(parts)}",
            f"- **한 줄 관문**: 문제 부위 {sum(p['ok'] for p in iss)}/{len(iss)} · "
            f"잘된 부위 {sum(p['ok'] for p in bad)}/{len(bad)}",
            f"- 거절 이유: {', '.join(f'{k} {v}' for k, v in why.most_common()) or '—'}",
        ]
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models", nargs="*", default=["text-gemma4_e4b", "text-qwen3_14b"])
    ap.add_argument("--sheet")
    ap.add_argument("--rule", default="B", help="평가지에서 C 와 비교할 규칙 총평 (B · B2)")
    ap.add_argument("--ratings", nargs="*")
    ap.add_argument("--parts", help="부위별 한 줄: 모델 이름 — 자동 지표 + 평가지")
    ap.add_argument(
        "--raw", nargs=2, metavar=("MODEL", "TASK"), help="수치 전부 넣은 한 줄: 모델 · raw|nocode"
    )
    a = ap.parse_args()
    if a.raw:
        print(raw_summary(*a.raw))
    elif a.parts:
        print(part_summary(a.parts))
        print(f"평가지 → {part_sheet(a.parts)}")
    elif a.sheet:
        print(f"평가지 → {sheet(a.sheet, a.rule)}")
    elif a.ratings:
        print(ratings(a.ratings))
    else:
        text = summary([m for m in a.models if (out_dir() / "runs" / f"{m}.jsonl").exists()])
        (out_dir() / "out").mkdir(parents=True, exist_ok=True)
        (out_dir() / "out" / "summary.md").write_text(text, encoding="utf-8")
        print(text)


if __name__ == "__main__":
    main()
