"""E-1 채점 평가 — 골든 세트의 사람 정답 vs 채점기 판정.

채점기(`client/src/core/score-part.ts`)는 폰에서 도는 JS라 Python으로 옮기지 않는다.
Node로 `eval/score/score_cli.mjs`(③)를 불러 결과 JSON을 받고, 사람 정답과 맞춘다.
시험지 양식은 `eval/golden/manifest.json` 의 item_fields (③과 2026-09-22 합의).

세는 규칙
- 채점기가 "못 재겠음"(status = check_only)이라고 하면 틀린 답이 아니다.
  정답률에서 빼고 무응답 비율로 따로 센다
- 정답률은 채점기가 점수를 낸 것(scored) 중 사람 정답(label)이 있는 것만으로 낸다
- 위험한 오답 = 사람은 off(많이 벗어남)인데 채점기는 ok(맞음). 잘못 그렸는데 칭찬하는 실수
- 사람끼리 일치 = labels.a vs labels.b 단순 일치율 + 카파(우연히 같은 답을 고른 몫을 뺀 값)

골든 세트가 비어 있으면 'skipped' 한 줄을 남긴다.
"""

from __future__ import annotations

import argparse
import json
import shutil
import statistics
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.common import ROOT, data_dir, load_golden, result_path, write_rows  # noqa: E402

# 채점 버전 = rules/score.json (앱과 같은 파일, #44) — 결과 파일 이름·표에 찍힌다
SCORE_VERSION = json.loads(
    (Path(__file__).resolve().parents[2] / "rules" / "score.json").read_text(encoding="utf-8")
)["version"]
CLI = ROOT / "eval" / "score" / "score_cli.mjs"
ORDER = {"ok": 0, "slight": 1, "off": 2}


def run_node(items: list[dict], base: Path) -> list[dict]:
    if shutil.which("node") is None:
        raise RuntimeError("node not found — 채점기는 JS라 Node가 필요하다")
    payload = json.dumps({"items": items, "data_dir": str(base)})
    out = subprocess.run(["node", str(CLI)], input=payload, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def kappa(a: list[str], b: list[str]) -> float | None:
    """두 사람 판정의 코언 카파. 1 = 완전 일치, 0 = 우연 수준."""
    n = len(a)
    if n == 0:
        return None
    po = sum(x == y for x, y in zip(a, b, strict=True)) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[k] * cb[k] for k in set(ca) | set(cb)) / (n * n)
    return None if pe == 1 else (po - pe) / (1 - pe)


def summarize(preds: list[dict], items: list[dict], note: str = "") -> list[dict]:
    """채점기 결과(preds)와 시험지(items)로 결과표 줄을 만든다. Node 없이 시험할 수 있게 따로 뺐다."""
    by_id = {it.get("id"): it for it in items}
    total = len(preds)
    scored = [p for p in preds if p.get("status") == "scored"]
    check = [p for p in preds if p.get("status") == "check_only"]
    errors = [p for p in preds if p.get("error")]
    judged = [p for p in scored if p.get("label") in ORDER and p.get("pred") in ORDER]

    def row(metric: str, current, n: int, extra: str = "") -> dict:
        return {
            "eval": "E-1",
            "metric": metric,
            "baseline": "",
            "current": current,
            "pass": "",
            "n": n,
            "note": "; ".join(s for s in (note, extra) if s),
        }

    def rate(k: int, n: int):
        return round(k / n, 3) if n else ""

    rows = []
    agree = sum(p["pred"] == p["label"] for p in judged)
    rows.append(row("부위 판정 일치율 (점수 낸 것만)", rate(agree, len(judged)), len(judged)))
    near = sum(abs(ORDER[p["pred"]] - ORDER[p["label"]]) <= 1 for p in judged)
    rows.append(row("부위 판정 일치율 · 한 칸 차이까지 허용", rate(near, len(judged)), len(judged)))
    reasons = Counter(p.get("check_reason") or "?" for p in check)
    rows.append(
        row(
            "무응답(확인만) 비율",
            rate(len(check), total),
            total,
            "이유: " + ", ".join(f"{k} {v}" for k, v in reasons.most_common()) if check else "",
        )
    )
    off = [p for p in judged if p["label"] == "off"]
    danger = sum(p["pred"] == "ok" for p in off)
    rows.append(row("위험한 오답 (사람 off → 채점기 ok)", rate(danger, len(off)), len(off)))
    for part in sorted({p.get("part") for p in judged if p.get("part")}):
        ps = [p for p in judged if p.get("part") == part]
        hit = sum(p["pred"] == p["label"] for p in ps)
        rows.append(row(f"부위별 일치율 · {part}", rate(hit, len(ps)), len(ps)))

    pairs = []
    for p in preds:
        labels = by_id.get(p.get("id"), {}).get("labels")
        if isinstance(labels, dict) and labels.get("a") in ORDER and labels.get("b") in ORDER:
            pairs.append((labels["a"], labels["b"]))
    if pairs:
        k = kappa([x for x, _ in pairs], [y for _, y in pairs])
        rows.append(
            row(
                "사람끼리 일치율 (a vs b)",
                rate(sum(x == y for x, y in pairs), len(pairs)),
                len(pairs),
                f"카파 {k:.3f}" if k is not None else "",
            )
        )
    ms = [p["ms"] for p in preds if isinstance(p.get("ms"), (int, float))]
    if ms:
        rows.append(row("채점 시간 중앙값(ms)", round(statistics.median(ms), 1), len(ms)))
    if errors:
        rows.append(row("채점 오류", len(errors), total, "오류 난 항목은 위 계산에서 빠진다"))
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidate", default=None, help="S-4 색 보정 후보 등 채점기 변형 이름")
    args = ap.parse_args()

    g = load_golden()
    base = data_dir(g)
    rows: list[dict] = []
    if g["items"] and base and CLI.exists():
        preds = run_node(g["items"], base)
        rows = summarize(preds, g["items"], args.candidate or "")
    path = result_path("score", (args.candidate or SCORE_VERSION), g["golden_version"])
    write_rows(path, rows)
    print(path.name, "rows" if rows else "skipped (golden empty or score_cli.mjs missing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
