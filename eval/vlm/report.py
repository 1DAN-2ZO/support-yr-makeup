"""VLM 선정 실험 — 결과 요약 · 사람 평가지 · 평가 집계.

    uv run --extra vlm python eval/vlm/report.py --model qwen3vl8b                 # 0~4단계 요약
    uv run --extra vlm python eval/vlm/report.py --model qwen3vl8b --sheet   # 5·6단계 평가지(HTML)
    uv run --extra vlm python eval/vlm/report.py --ratings a.json b.json c.json    # 평가 결과 모으기

요약    $DHE_DATA_DIR/vlm-eval/out/<모델>-summary.md
        + eval/results/<날짜>_vlm_<모델>.csv (숫자만, 사진 없음 — 커밋해도 된다)
평가지  $DHE_DATA_DIR/vlm-eval/out/sheet-<모델>.html (사진이 들어 있어 저장소에 넣지 않는다)
        + 정답표 sheet-<모델>.key.json
통과 기준은 조사 보고서 표 그대로다 (공개 표준이 아니라 첫 실험용 엔지니어링 기준).
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from landmarks import core, data_dir  # noqa: E402
from metrics import (  # noqa: E402
    field_agreement,
    follows_rule,
    kappa_from_runs,
    mode,
    quantile,
    share,
    wilson,
)

PASS = {"p95_ms": 5000, "schema": 1.0, "gate": 0.95, "agree": 0.90, "follow": 0.90, "win": 0.5}


def rows(model: str, stage: int) -> list[dict]:
    p = data_dir() / "vlm-eval" / "runs" / model / f"stage{stage}.jsonl"
    if not p.exists():
        return []
    return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]


def faces_by_id() -> dict[str, dict]:
    work = data_dir() / "vlm-eval" / "work"
    return {f["id"]: f for f in (json.loads(p.read_text(encoding="utf-8")) for p in work.glob("*.json"))}


def flipped(faces: dict[str, dict]) -> dict[tuple[str, str], dict]:
    ids = list(faces)
    out = core([{"op": "flips", "m": faces[i]["m"]} for i in ids])
    return {(i, x["name"]): x for i, fl in zip(ids, out, strict=True) for x in fl}


def gate_all(rs: list[dict], faces: dict[str, dict], flips: dict | None = None) -> list[dict]:
    """각 응답을 앱 관문에 넣는다 — 뒤집기 응답은 뒤집은 측정값으로"""
    reqs = []
    for r in rs:
        m = flips[(r["photo_id"], r["flip"])]["m"] if flips and r.get("flip") else faces[r["photo_id"]]["m"]
        reqs.append({"op": "gate", "m": m, "raw": r.get("content", "") if "error" not in r else "요청 실패"})
    return core(reqs) if reqs else []


def pct(x: float | None) -> str:
    return "—" if x is None else f"{x * 100:.1f}%"


def mark(ok: bool | None) -> str:
    return "—" if ok is None else ("통과" if ok else "탈락")


# ---------- 0~4단계 요약 ----------


def summarize(model: str) -> tuple[str, dict]:
    faces = faces_by_id()
    lines = [f"# {model} — VLM 선정 실험 요약 ({dt.date.today().isoformat()})", ""]
    num: dict[str, object] = {"model": model}

    # 0 구동
    r0 = rows(model, 0)
    if r0:
        g0 = gate_all(r0, faces)
        broken = sum(1 for r, g in zip(r0, g0, strict=True) if "error" in r or not g["parsed"])
        meta = json.loads(
            (data_dir() / "vlm-eval" / "runs" / model / "stage0.meta.json").read_text(encoding="utf-8")
        )
        num.update(s0_n=len(r0), s0_broken=broken, vram_peak_mb=meta.get("vram_peak_mb"))
        lines += [
            "## 0. 구동",
            f"- 요청 {len(r0)} · 깨진 출력(요청 실패·JSON 아님) **{broken}** → {mark(broken == 0)}",
            f"- VRAM 최대 {meta.get('vram_peak_mb')} MB",
            "",
        ]

    # 1 속도
    r1 = [r for r in rows(model, 1) if "error" not in r]
    if r1:
        lines += [
            "## 1. 속도 (전체 응답 시간)",
            "| 해상도 | 출력 상한 | prompt 캐시 | p50 | p95 | 입력 처리 ms | 생성 ms | 출력 토큰 |",
            "|---|---|---|---|---|---|---|---|",
        ]
        groups = defaultdict(list)
        for r in r1:
            groups[(r["res"], r["max_tokens"], r["cache"])].append(r)
        best = None
        for k in sorted(groups):
            g = groups[k]
            ms = [r["ms"] for r in g]
            p50, p95 = quantile(ms, 0.5), quantile(ms, 0.95)
            pm = quantile([(r.get("timings") or {}).get("prompt_ms", 0) for r in g], 0.5)
            gm = quantile([(r.get("timings") or {}).get("predicted_ms", 0) for r in g], 0.5)
            tok = quantile([(r.get("usage") or {}).get("completion_tokens", 0) for r in g], 0.5)
            lines.append(
                f"| {k[0]} | {k[1]} | {'켬' if k[2] else '끔'} | {p50:.0f} | {p95:.0f} "
                f"| {pm:.0f} | {gm:.0f} | {tok:.0f} |"
            )
            if not k[2] and (best is None or p95 < best[1]):
                best = (k, p95)
        if best:
            num.update(s1_best=f"{best[0][0]}px/{best[0][1]}tok", s1_p95_ms=round(best[1]))
            lines += [
                "",
                f"- 캐시 끔(결정론 설정) 중 가장 빠른 조건 {best[0][0]}px·{best[0][1]}토큰 "
                f"p95 {best[1]:.0f}ms → {mark(best[1] <= PASS['p95_ms'])}",
                "",
            ]

    # 2 형식
    r2 = rows(model, 2)
    best_cond = None
    if r2:
        g2 = gate_all(r2, faces)
        lines += [
            "## 2. 입력 형식 (관문 = 앱 resolvePlan)",
            "| 형식 | 제약 디코딩 | 스키마 통과 | 관문 통과 | 자주 걸린 규칙 |",
            "|---|---|---|---|---|",
        ]
        groups = defaultdict(list)
        for r, g in zip(r2, g2, strict=True):
            groups[(r["variant"], r["constrained"])].append((r, g))
        for k in sorted(groups, key=lambda k: (k[0], not k[1])):
            g = groups[k]
            schema_ok = sum(1 for r, x in g if "error" not in r and x["parsed"]) / len(g)
            gate_ok = sum(1 for _, x in g if x["ok"]) / len(g)
            top = Counter(rej.split(":")[0] for _, x in g for rej in x["rejected"]).most_common(3)
            lines.append(
                f"| {k[0]} | {'켬' if k[1] else '끔'} | {pct(schema_ok)} | {pct(gate_ok)} "
                f"| {', '.join(f'{a}({b})' for a, b in top) or '—'} |"
            )
            num[f"s2_{k[0]}{'c' if k[1] else 'u'}_schema"] = round(schema_ok, 3)
            num[f"s2_{k[0]}{'c' if k[1] else 'u'}_gate"] = round(gate_ok, 3)
            if k[1] and (best_cond is None or gate_ok > best_cond[1]):
                best_cond = (k[0], gate_ok)
        if best_cond:
            num["s2_best"] = best_cond[0]
            lines += [
                "",
                f"- 가장 좋은 형식 {best_cond[0]} (관문 {pct(best_cond[1])}) "
                f"→ {mark(best_cond[1] >= PASS['gate'])} · 스키마 100% 여부는 위 표",
                "",
            ]

    # 3 결정론
    r3 = [r for r in rows(model, 3) if "error" not in r]
    if r3:
        g3 = gate_all(r3, faces)
        same = defaultdict(list)  # (사진) → 원래 사진 반복의 결정들 (재시작 전후 합침)
        before, after = defaultdict(list), defaultdict(list)
        pert = defaultdict(list)
        for r, g in zip(r3, g3, strict=True):
            if not g["parsed"]:
                continue
            if r.get("perturb"):
                pert[(r["photo_id"], r["perturb"])].append(g["decisions"])
            else:
                same[r["photo_id"]].append(g["decisions"])
                (before if r.get("phase") == "before" else after)[r["photo_id"]].append(g["decisions"])
        per_field = defaultdict(list)
        for runs in same.values():
            for f, a in field_agreement(runs).items():
                per_field[f].append(a)
        lines += [
            "## 3. 결정론 (같은 입력 반복 — 필드별 최빈값 비율 평균)",
            "| 필드 | 일치 | κ |",
            "|---|---|---|",
        ]
        worst = 1.0
        for f in sorted(per_field):
            a = sum(per_field[f]) / len(per_field[f])
            worst = min(worst, a)
            k = kappa_from_runs([[d.get(f) for d in runs] for runs in same.values()])
            lines.append(f"| {f} | {pct(a)} | {'—' if k is None else f'{k:.2f}'} |")
        restart_same = [
            mode([d for d in before[p]]) == mode([d for d in after[p]]) for p in before if after.get(p)
        ]
        pert_same = [mode(same[p]) == mode(ds) for (p, _), ds in pert.items() if same.get(p)]
        num.update(
            s3_worst_field=round(worst, 3),
            s3_restart_same=share(restart_same)[0] / max(1, len(restart_same)),
            s3_perturb_same=share(pert_same)[0] / max(1, len(pert_same)),
        )
        lines += [
            "",
            f"- 가장 흔들린 필드 일치 {pct(worst)} → {mark(worst >= PASS['agree'])}",
            f"- 서버 재시작 전후 같은 답(사진별 최빈 계획): {share(restart_same)[0]}/{len(restart_same)}",
            f"- 밝기·자르기 조금 바꿔도 같은 답: {share(pert_same)[0]}/{len(pert_same)}",
            "",
        ]

    # 4 뒤집기
    r4 = [r for r in rows(model, 4) if "error" not in r]
    if r4:
        fl = flipped(faces)
        g4 = gate_all(r4, faces, fl)
        base = {
            r["photo_id"]: g["decisions"]
            for r, g in zip(r4, g4, strict=True)
            if not r.get("flip") and g["parsed"]
        }
        res = defaultdict(list)
        for r, g in zip(r4, g4, strict=True):
            if not r.get("flip") or not g["parsed"] or r["photo_id"] not in base:
                continue
            x = fl[(r["photo_id"], r["flip"])]
            res[r["flip"]].append(
                follows_rule(
                    base[r["photo_id"]].get(x["field"]),
                    g["decisions"].get(x["field"]),
                    x["ruleBefore"],
                    x["ruleAfter"],
                )
            )
        lines += [
            "## 4. 측정값 뒤집기 (규칙과 같은 방향으로 바뀐 비율)",
            "| 뒤집은 것 | 따름 | 판정 수 |",
            "|---|---|---|",
        ]
        total_k = total_n = 0
        for name, flags in sorted(res.items()):
            k, n = share(flags)
            total_k, total_n = total_k + k, total_n + n
            lines.append(f"| {name} | {pct(k / n if n else None)} | {n} |")
        rate = total_k / total_n if total_n else None
        num["s4_follow"] = None if rate is None else round(rate, 3)
        lines += ["", f"- 전체 {pct(rate)} → {mark(None if rate is None else rate >= PASS['follow'])}", ""]

    return "\n".join(lines), num


# ---------- 5·6단계 평가지 ----------

LABEL = {
    "liner.style": ("라이너", {"winged": "꼬리 올림", "extend": "곧게 연장", "drop": "눈매 따라 내림"}),
    "shadow.range": ("섀도 범위", None),
    "lip.overline": ("입술 오버라인", None),
    "blush.position": ("블러셔 위치", {"higher": "조금 위", "standard": "표준", "lower": "조금 아래"}),
    "blush.size": ("블러셔 크기", None),
    "linerThick.scale": ("라이너 두께", None),
    "highlight.tZone": ("T존 하이라이트", {True: "넣음", False: "안 넣음"}),
    "faceShape.label": ("얼굴형", None),
}


def describe(d: dict, rationale: dict) -> str:
    items = []
    for k, (name, words) in LABEL.items():
        v = d.get(k)
        items.append(f"<li><b>{name}</b> {html.escape(str(words.get(v, v) if words else v))}</li>")
    for k, v in sorted(d.items()):
        if k.startswith("intensity.") and v != 1:
            items.append(f"<li><b>진하기 {k.split('.')[1]}</b> ×{v}</li>")
    why = "".join(f"<li>{html.escape(t)}</li>" for t in (rationale or {}).values() if t)
    return f"<ul>{''.join(items)}</ul><p class=why>근거</p><ul>{why or '<li>—</li>'}</ul>"


def sheet(model: str) -> None:
    sys.path.insert(0, str(HERE))
    from run import face_image  # noqa: PLC0415

    faces = faces_by_id()
    r2 = [r for r in rows(model, 2) if r["variant"] == "A" and r["constrained"] and "error" not in r]
    if not r2:
        sys.exit("2단계(형식 A, 제약 켬) 결과가 없습니다")
    g2 = gate_all(r2, faces)
    per = defaultdict(list)
    for r, g in zip(r2, g2, strict=True):
        if g["ok"]:
            per[(r["photo_id"], r["look"])].append((g["decisions"], g["rationale"]))
    rules = core([{"op": "rule", "m": faces[p]["m"]} for p, _ in per])
    rnd = random.Random(7)
    key, cards = [], []
    for n, (((pid, look), runs), rule) in enumerate(zip(per.items(), rules, strict=True), start=1):
        dec = mode([d for d, _ in runs])
        rat = next(r for d, r in runs if d == dec)
        rule_rat = rule.pop("rationale")
        a_is_vlm = rnd.random() < 0.5
        A, B = ((dec, rat), (rule, rule_rat)) if a_is_vlm else ((rule, rule_rat), (dec, rat))
        key.append({"n": n, "photo_id": pid, "look": look, "A": "vlm" if a_is_vlm else "rule"})
        img = face_image(faces[pid], 384)
        card = (HERE / "sheet_card.html").read_text(encoding="utf-8")
        fill = {
            "{{N}}": str(n),
            "{{LOOK}}": html.escape(look),
            "{{IMG}}": img,
            "{{A}}": describe(*A),
            "{{B}}": describe(*B),
        }
        for k, v in fill.items():
            card = card.replace(k, v)
        cards.append(card)
    out = data_dir() / "vlm-eval" / "out"
    out.mkdir(parents=True, exist_ok=True)
    page = (HERE / "sheet_page.html").read_text(encoding="utf-8")
    page = page.replace("{{MODEL}}", json.dumps(model)).replace("{{CARDS}}", "".join(cards))
    (out / f"sheet-{model}.html").write_text(page, encoding="utf-8")
    (out / f"sheet-{model}.key.json").write_text(json.dumps(key, ensure_ascii=False), encoding="utf-8")
    print(
        f"평가지 {len(key)}문항 → {out / f'sheet-{model}.html'} "
        f"(정답표 sheet-{model}.key.json 은 평가자에게 주지 않는다)"
    )


def ratings(files: list[str]) -> None:
    by_model: dict[str, list[dict]] = defaultdict(list)
    for f in files:
        r = json.loads(Path(f).read_text(encoding="utf-8"))
        key = {
            k["n"]: k
            for k in json.loads(
                (data_dir() / "vlm-eval" / "out" / f"sheet-{r['model']}.key.json").read_text(encoding="utf-8")
            )
        }
        for it in r["items"]:
            k = key[it["n"]]
            vlm, rule = ("a", "b") if k["A"] == "vlm" else ("b", "a")
            pick = it["pick"]
            win = None if pick in (None, "same") else (pick.lower() == vlm)
            by_model[r["model"]].append(
                {
                    "who": r["who"],
                    "n": it["n"],
                    "win": win,
                    "fit_vlm": it[f"f{vlm}"],
                    "fit_rule": it[f"f{rule}"],
                    "nat_vlm": it[f"n{vlm}"],
                    "made_up_vlm": it[f"x{vlm}"],
                }
            )
    for model, xs in by_model.items():
        k, n = share(x["win"] for x in xs)
        ci = wilson(k, n)

        def num(key: str, xs: list[dict] = xs) -> list[float]:
            return [float(x[key]) for x in xs if x[key] not in (None, "")]

        def avg(v: list[float]) -> float | None:
            return sum(v) / len(v) if v else None

        made_up = sum(1 for x in xs if x["made_up_vlm"])
        print(f"## {model} — 평가자 {len({x['who'] for x in xs})}명, 문항 {len(xs)}")
        print(
            f"- VLM 승률 {k}/{n} = {pct(k / n if n else None)} "
            f"(95% {'—' if ci is None else f'{ci[0]:.2f}~{ci[1]:.2f}'}) "
            f"→ {mark(None if not n else k / n > PASS['win'])}"
        )
        print(f"- 맞는 정도 평균 VLM {avg(num('fit_vlm'))} · 규칙 {avg(num('fit_rule'))}")
        print(
            f"- VLM 근거 자연스러움 평균 {avg(num('nat_vlm'))} (기준 4 이상) "
            f"· 지어냄 표시 {made_up}건 (기준 0)"
        )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model")
    ap.add_argument("--sheet", action="store_true")
    ap.add_argument("--ratings", nargs="*")
    args = ap.parse_args()
    if args.ratings:
        ratings(args.ratings)
        return
    if not args.model:
        sys.exit("--model 을 주세요")
    if args.sheet:
        sheet(args.model)
        return
    text, num = summarize(args.model)
    out = data_dir() / "vlm-eval" / "out"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{args.model}-summary.md").write_text(text, encoding="utf-8")
    res = ROOT / "eval" / "results" / f"{dt.date.today().isoformat()}_vlm_{args.model}.csv"
    res.write_text(
        ",".join(num) + "\n" + ",".join("" if v is None else str(v) for v in num.values()) + "\n",
        encoding="utf-8",
    )
    print(text)
    print(f"\n→ {out / f'{args.model}-summary.md'}\n→ {res}")


if __name__ == "__main__":
    main()
