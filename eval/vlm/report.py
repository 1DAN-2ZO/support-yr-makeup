"""VLM 선정 실험 — 결과 요약 · 사람 평가지 · 평가 집계.

    uv run --extra vlm python eval/vlm/report.py --model qwen3vl8b                 # 0~4단계 요약
    uv run --extra vlm python eval/vlm/report.py --model qwen3vl8b --sheet   # 5·6단계 평가지(HTML)
    uv run --extra vlm python eval/vlm/report.py --ratings a.json b.json c.json    # 평가 결과 모으기
    uv run --extra vlm python eval/vlm/report.py --compare sel-qwen3vl8b sel-qwen3vl4b ...  # 선정 비교표

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
import os
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from landmarks import core, data_dir  # noqa: E402
from metrics import (  # noqa: E402
    change_rate,
    field_agreement,
    field_change_mean,
    fleiss_kappa,
    follows_rule,
    kappa_from_runs,
    mode,
    quantile,
    rationale_mismatch,
    share,
    wilson,
)

# 측정값이 정하는 필드 (글이 같으면 같아야 한다) · 나머지는 사진에만 기대는 필드
MEASURED = ["liner.style", "shadow.range", "lip.overline"]
IMAGE_BASE = ["blush.position", "blush.size", "highlight.tZone", "linerThick.scale", "faceShape.label"]


def image_fields(pairs: list[tuple[dict, dict]]) -> list[str]:
    extra = sorted({f for a, b in pairs for f in (*a, *b) if f.startswith("intensity.")})
    return IMAGE_BASE + extra


def raw_rationale(r: dict) -> dict:
    """관문이 거절한 근거까지 — 불일치는 모델이 쓴 문장 그대로 본다"""
    try:
        x = json.loads(r.get("content") or "")
        return x.get("rationale") or {} if isinstance(x, dict) else {}
    except json.JSONDecodeError:
        return {}


PASS = {"schema": 1.0, "gate": 0.95, "agree": 0.90, "follow": 0.90, "win": 0.5}
# 시간은 통과 기준이 아니라 비교 항목 — 품질과 나란히 본다. 기획 예산(feature-spec 3~5초)은 참고로만 적는다.
# 사용자가 기다릴 수 있는 상한은 팀이 정한다 (정해지면 여기 두고 탈락에 쓴다)
BUDGET_MS = 5000


def results_dir() -> Path:
    """숫자 요약(CSV)을 둘 곳 — 기본은 저장소 eval/results. 시험은 DHE_RESULTS_DIR 로 임시 폴더를 준다
    (시험이 저장소의 진짜 결과를 덮어쓰거나 지우지 않게)"""
    d = Path(os.environ.get("DHE_RESULTS_DIR", ROOT / "eval" / "results"))
    d.mkdir(parents=True, exist_ok=True)
    return d


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
                f"p95 {best[1]:.0f}ms (참고: 기획 예산 {BUDGET_MS / 1000:.0f}초 "
                f"{'안' if best[1] <= BUDGET_MS else '밖'} — 통과 기준 아님)",
                "",
            ]

    # 2 형식
    r2 = rows(model, 2)
    best_cond = None
    if r2:
        g2 = gate_all(r2, faces)
        lines += [
            "## 2. 입력 형식 (관문 = 앱 resolvePlan)",
            "| 형식 | 제약 디코딩 | 스키마 통과 | 관문 통과 | 결정 값만 | 근거 문장만 "
            "| 응답 p50 ms | 응답 p95 ms | 자주 걸린 규칙 |",
            "|---|---|---|---|---|---|---|---|---|",
        ]
        groups = defaultdict(list)
        for r, g in zip(r2, g2, strict=True):
            v = r["variant"] + (f".{r['perturb']}" if r.get("perturb") else "")
            groups[(v, r["constrained"])].append((r, g))
        for k in sorted(groups, key=lambda k: (k[0], not k[1])):
            g = groups[k]
            schema_ok = sum(1 for r, x in g if "error" not in r and x["parsed"]) / len(g)
            gate_ok = sum(1 for _, x in g if x["ok"]) / len(g)
            # 거절을 둘로 — 결정 값(판단이 틀림)과 근거 문장(숫자·길이, 프롬프트로 고칠 수 있음)
            dec_ok = sum(
                1 for _, x in g if x["parsed"] and not any(not j.startswith("근거") for j in x["rejected"])
            ) / len(g)
            rat_ok = sum(
                1 for _, x in g if x["parsed"] and not any(j.startswith("근거") for j in x["rejected"])
            ) / len(g)
            top = Counter(rej.split(":")[0] for _, x in g for rej in x["rejected"]).most_common(3)
            ms = [r["ms"] for r, _ in g if "error" not in r and "ms" in r]
            p50, p95 = (quantile(ms, 0.5), quantile(ms, 0.95)) if ms else (None, None)
            lines.append(
                f"| {k[0]} | {'켬' if k[1] else '끔'} | {pct(schema_ok)} | {pct(gate_ok)} "
                f"| {pct(dec_ok)} | {pct(rat_ok)} "
                f"| {'—' if p50 is None else f'{p50:.0f}'} | {'—' if p95 is None else f'{p95:.0f}'} "
                f"| {', '.join(f'{a}({b})' for a, b in top) or '—'} |"
            )
            num[f"s2_{k[0]}{'c' if k[1] else 'u'}_gate_dec"] = round(dec_ok, 3)
            num[f"s2_{k[0]}{'c' if k[1] else 'u'}_gate_rat"] = round(rat_ok, 3)
            if p95 is not None:
                num[f"s2_{k[0]}{'c' if k[1] else 'u'}_p95_ms"] = round(p95)
            num[f"s2_{k[0]}{'c' if k[1] else 'u'}_schema"] = round(schema_ok, 3)
            num[f"s2_{k[0]}{'c' if k[1] else 'u'}_gate"] = round(gate_ok, 3)
            if k[1] and "." not in k[0] and (best_cond is None or gate_ok > best_cond[1]):
                best_cond = (k[0], gate_ok)  # 대조군(빈 사진 등)은 고르지 않는다
        if best_cond:
            num["s2_best"] = best_cond[0]
            lines += [
                "",
                f"- 가장 좋은 형식 {best_cond[0]} (관문 {pct(best_cond[1])}) "
                f"→ {mark(best_cond[1] >= PASS['gate'])} · 스키마 100% 여부는 위 표",
                "",
            ]
        # 값 쏠림 — 관문을 통과해도 얼굴과 상관없이 늘 같은 값이면 개인화가 아니다 (예시 값 베끼기)
        # 근거-값 불일치 — 근거 문장이 말한 방향과 값이 반대 (5단계 '지어냄' 을 미리 센다, 하한)
        fields = ["liner.style", "shadow.range", "lip.overline", "blush.position", "linerThick.scale"]
        lines += [
            "### 값 쏠림 · 근거 불일치",
            "값 쏠림 = 가장 흔한 값의 비율 (100% 면 얼굴과 상관없이 늘 같은 값)",
            "",
            "| 형식 | 제약 | " + " | ".join(fields) + " | 근거-값 불일치 |",
            "|---|---|" + "---|" * (len(fields) + 1),
        ]
        for k in sorted(groups, key=lambda k: (k[0], not k[1])):
            ok = [(r, x) for r, x in groups[k] if x["parsed"]]
            ds = [x["decisions"] for _, x in ok]
            if not ds:
                continue
            shares = [Counter(str(d.get(f)) for d in ds).most_common(1)[0][1] / len(ds) for f in fields]
            mis = sum(bool(rationale_mismatch(raw_rationale(r), x["decisions"])) for r, x in ok) / len(ok)
            cells = " | ".join(pct(s) for s in shares)
            lines.append(f"| {k[0]} | {'켬' if k[1] else '끔'} | {cells} | {pct(mis)} |")
            tag = f"s2_{k[0]}{'c' if k[1] else 'u'}"
            num[f"{tag}_mode_max"] = round(max(shares), 3)
            num[f"{tag}_mismatch"] = round(mis, 3)
        # 대조군 — 같은 글에 사진만 바꿨을 때 결정이 바뀐 비율. 끝의 '사진 근거' 표에서 모은다
        key = lambda r: (r["photo_id"], r["look"], r["rep"])  # noqa: E731
        for k in [k for k in groups if "." in k[0]]:
            base_v, ctl = k[0].split(".", 1)
            if (base_v, k[1]) not in groups:
                continue
            ref = {key(r): x["decisions"] for r, x in groups[(base_v, k[1])] if x["parsed"]}
            pairs = [(ref[key(r)], x["decisions"]) for r, x in groups[k] if x["parsed"] and key(r) in ref]
            if pairs:
                num[f"g_{base_v}_{ctl}_img"] = round(field_change_mean(pairs, image_fields(pairs)), 3)
                num[f"g_{base_v}_{ctl}_meas"] = round(change_rate(pairs, MEASURED), 3)
                num[f"g_{base_v}_{ctl}_n"] = len(pairs)
        lines.append("")

    # 3 결정론 — 형식마다
    r3 = [r for r in rows(model, 3) if "error" not in r]
    if r3:
        g3 = gate_all(r3, faces)
        for v in sorted({r["variant"] for r in r3}):
            same = defaultdict(list)  # (사진) → 원래 사진 반복의 결정들 (재시작 전후 합침)
            before, after = defaultdict(list), defaultdict(list)
            pert = defaultdict(list)
            for r, g in zip(r3, g3, strict=True):
                if r["variant"] != v or not g["parsed"]:
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
                f"## 3. 결정론 — 형식 {v} (같은 입력 반복 — 필드별 최빈값 비율 평균)",
                "| 필드 | 일치 | κ |",
                "|---|---|---|",
            ]
            worst = 1.0
            for f in sorted(per_field):
                a = sum(per_field[f]) / len(per_field[f])
                worst = min(worst, a)
                k = kappa_from_runs([[d.get(f) for d in runs] for runs in same.values()])
                lines.append(f"| {f} | {pct(a)} | {'—' if k is None else f'{k:.2f}'} |")
            restart_same = [mode(before[p]) == mode(after[p]) for p in before if after.get(p)]
            pert_pairs = [(mode(same[p]), d) for (p, _), ds in pert.items() if same.get(p) for d in ds]
            pert_same = [mode(same[p]) == mode(ds) for (p, _), ds in pert.items() if same.get(p)]
            tag = "s3" if v == "A" else f"s3_{v}"
            num.update(
                {
                    f"{tag}_worst_field": round(worst, 3),
                    f"{tag}_restart_same": round(share(restart_same)[0] / max(1, len(restart_same)), 3),
                    f"{tag}_perturb_same": round(share(pert_same)[0] / max(1, len(pert_same)), 3),
                }
            )
            if pert_pairs:
                num[f"g_{v}_perturb_img"] = round(field_change_mean(pert_pairs, image_fields(pert_pairs)), 3)
                num[f"g_{v}_perturb_meas"] = round(change_rate(pert_pairs, MEASURED), 3)
            lines += [
                "",
                f"- 가장 흔들린 필드 일치 {pct(worst)} → {mark(worst >= PASS['agree'])}",
                f"- 서버 재시작 전후 같은 답(사진별 최빈 계획): {share(restart_same)[0]}/{len(restart_same)}",
                f"- 밝기·자르기 조금 바꿔도 같은 답: {share(pert_same)[0]}/{len(pert_same)}",
                "",
            ]

    # 4 뒤집기 — 형식마다
    r4 = [r for r in rows(model, 4) if "error" not in r]
    if r4:
        fl = flipped(faces)
        g4 = gate_all(r4, faces, fl)
        for v in sorted({r["variant"] for r in r4}):
            both = [(r, g) for r, g in zip(r4, g4, strict=True) if r["variant"] == v]
            base = {r["photo_id"]: g["decisions"] for r, g in both if not r.get("flip") and g["parsed"]}
            res = defaultdict(list)
            for r, g in both:
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
                f"## 4. 측정값 뒤집기 — 형식 {v} (규칙과 같은 방향으로 바뀐 비율)",
                "| 뒤집은 것 | 따름 | 판정 수 |",
                "|---|---|---|",
            ]
            total_k = total_n = 0
            for name, flags in sorted(res.items()):
                k, n = share(flags)
                total_k, total_n = total_k + k, total_n + n
                lines.append(f"| {name} | {pct(k / n if n else None)} | {n} |")
            rate = total_k / total_n if total_n else None
            num["s4_follow" if v == "A" else f"s4_{v}_follow"] = None if rate is None else round(rate, 3)
            lines += [
                "",
                f"- 전체 {pct(rate)} → {mark(None if rate is None else rate >= PASS['follow'])}",
                "",
            ]

    # 사진 근거 — 선정의 핵심 지표. 사진만 바꾼 대조군에서 '사진 항목'(측정값이 없는 필드)이 얼마나 바뀌나
    #   다른 사람 사진에서 많이 바뀌고, 밝기·자르기 조금에서는 안 바뀌어야 사진을 근거로 쓴다
    vs = sorted({k.split("_")[1] for k in num if k.startswith("g_")})
    if vs:
        lines += [
            "## 사진 근거 (사진만 바꿨을 때 결정이 바뀐 비율)",
            "사진 항목 = 측정값이 없는 필드(블러셔·하이라이트·라이너 두께·얼굴형·진하기), "
            "필드마다 바뀐 비율의 평균. "
            "측정 항목 = 라이너 스타일·섀도 범위·오버라인 (글이 같으니 안 바뀌는 게 정상)",
            "",
            "| 형식 | 다른 사람 사진: 사진 항목 | 빈 사진: 사진 항목 | 밝기·자르기: 사진 항목 "
            "| 간격 (다른 사람 − 밝기·자르기) | 다른 사람 사진: 측정 항목 |",
            "|---|---|---|---|---|---|",
        ]
        for v in vs:
            # 잡음 쪽은 3단계 밝기·자르기, 없으면 2단계 밝기 대조군(1차 선별)
            if f"g_{v}_perturb_img" not in num and f"g_{v}_bright_img" in num:
                num[f"g_{v}_perturb_img"] = num[f"g_{v}_bright_img"]
            sw, bl, pe = (num.get(f"g_{v}_{c}_img") for c in ("swap", "blank", "perturb"))
            gap = None if sw is None or pe is None else round(sw - pe, 3)
            num[f"g_{v}_gap"] = gap
            lines.append(
                f"| {v} | {pct(sw)} | {pct(bl)} | {pct(pe)} | "
                f"{'—' if gap is None else f'{gap * 100:+.1f}%p'} | {pct(num.get(f'g_{v}_swap_meas'))} |"
            )
        lines += [
            "",
            "- 간격이 클수록 얼굴 차이에 반응하고 잡음에는 덜 흔들린다 (0 근처면 사진을 근거로 쓰지 않음)",
            "",
        ]

    return "\n".join(lines), num


# ---------- 5·6단계 평가지 ----------
# 6단계(선호): 앱 렌더러로 두 계획을 실제로 그린 얼굴 A·B 를 보고 A · B · 비슷함 하나만 고른다 (가려서).
# 5단계(한국어): VLM 근거 문장만 따로 — 사진과 문장을 보고 자연스러움·지어냄. 한두 명이면 된다.
# 사진이 들어가므로 만든 파일은 DHE_DATA_DIR 에만 둔다. 정답표(key.json)는 평가자에게 주지 않는다.

INTENSITY_KO = {"brow": "눈썹", "liner": "라이너", "shadow": "섀도", "cheek": "볼", "lip": "입술"}


def look_label(look_id: str) -> str:
    """화장 이름 + 부위 색 견본 — 평가자가 어떤 화장인지 알고 고르게 (rules/looks.json)"""
    data = json.loads((ROOT / "rules" / "looks.json").read_text(encoding="utf-8"))
    looks = data["looks"] if isinstance(data, dict) and "looks" in data else data
    lk = next((x for x in looks if x.get("id") == look_id), None)
    if not lk:
        return html.escape(look_id)
    sw = "".join(
        f'<span class=sw title="{INTENSITY_KO.get(p, p)}" '
        f'style="background:rgb({",".join(map(str, c))})"></span>'
        for p in ("liner", "shadow", "cheek", "lip")
        if (c := lk["parts"].get(p, {}).get("color"))
    )
    return f"{html.escape(lk.get('name', look_id))} {sw}"


def _photo_url(face: dict) -> str:
    import base64  # noqa: PLC0415

    p = data_dir() / "vlm-eval" / "photos" / face["photo"]
    return "data:image/jpeg;base64," + base64.b64encode(p.read_bytes()).decode()


# 머리카락 가림 — 앱 AR(fullrender)과 같은 모델·크기. 앱은 브라우저에서 돌리지만
# 평가지는 인터넷 없이 열려야 해서 같은 모델로 미리 계산해 넣는다
# (screens/hair-segmenter.ts MODELS[0] · fullrender HAIR_AR.width)
HAIR_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite"
HAIR_WIDTH = 320
HAIR_INDEX = 1


def hair_masks(faces: list[dict]) -> dict[str, dict]:
    """사진마다 머리카락 확률 마스크 → {id: {w, h, b64}} (0~255 한 바이트 — 앱 hairBytes 와 같은 양자화)

    mediapipe 가 없거나(vlm 묶음을 안 깐 곳 — CI 는 dev·eval 만 깐다) 모델을 못 받으면 빈 사전을 돌려준다.
    평가지는 머리카락 가림 없이 그려진다 (sheet_page 가 마스크 없는 사진을 그대로 그린다).
    2026-10-01: 이 가드가 없어 #258 뒤로 main CI 가 빨갰다 (로컬은 vlm 묶음이 깔려 있어 통과)
    """
    import base64  # noqa: PLC0415
    import urllib.request  # noqa: PLC0415

    try:
        import mediapipe as mp  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415
        from mediapipe.tasks.python import BaseOptions  # noqa: PLC0415
        from mediapipe.tasks.python.vision import (  # noqa: PLC0415
            ImageSegmenter,
            ImageSegmenterOptions,
            RunningMode,
        )
    except ImportError:
        print("mediapipe 가 없어 머리카락 가림 없이 그립니다 (uv run --extra vlm)", file=sys.stderr)
        return {}
    from PIL import Image  # noqa: PLC0415

    model = data_dir() / "models" / "hair_segmenter.tflite"
    if not model.exists():
        model.parent.mkdir(parents=True, exist_ok=True)
        try:
            urllib.request.urlretrieve(HAIR_MODEL_URL, model)
        except OSError as e:
            print(f"머리카락 모델을 못 받아 가림 없이 그립니다: {e}", file=sys.stderr)
            return {}
    opts = ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=str(model)),
        running_mode=RunningMode.IMAGE,
        output_confidence_masks=True,
        output_category_mask=False,
    )
    out = {}
    with ImageSegmenter.create_from_options(opts) as seg:
        for f in faces:
            im = Image.open(data_dir() / "vlm-eval" / "photos" / f["photo"]).convert("RGB")
            w, h = HAIR_WIDTH, round(im.height * HAIR_WIDTH / im.width)
            small = np.asarray(im.resize((w, h), Image.Resampling.BILINEAR))
            r = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=small))
            conf = r.confidence_masks[HAIR_INDEX].numpy_view()
            b = np.clip(np.round(np.nan_to_num(conf) * 255), 0, 255).astype(np.uint8)
            out[f["id"]] = {"w": w, "h": h, "b64": base64.b64encode(b.tobytes()).decode()}
    return out


def _blind(x: object) -> object:
    """평가지에 넣는 계획에서 누가 만들었는지 드러나는 칸을 지운다 — 항목마다 source: vlm|rule,
    거절 목록, 근거 문장. 렌더러는 이 칸을 읽지 않는다 (makeup-paint · personal-guide · contour)"""
    if isinstance(x, dict):
        return {k: _blind(v) for k, v in x.items() if k not in ("source", "rejected", "rationale")}
    if isinstance(x, list):
        return [_blind(v) for v in x]
    return x


def _fill(tpl: str, **kv: str) -> str:
    for k, v in kv.items():
        tpl = tpl.replace("{{" + k + "}}", v)
    return tpl


def sheet(model: str, variant: str = "A") -> None:
    import subprocess  # noqa: PLC0415

    faces = faces_by_id()
    r2 = [
        r
        for r in rows(model, 2)
        if r["variant"] == variant and r["constrained"] and not r.get("perturb") and "error" not in r
    ]
    if not r2:
        sys.exit(f"2단계(형식 {variant}, 제약 켬, 원래 사진) 결과가 없습니다")
    g2 = gate_all(r2, faces)
    # 사진·화장마다 한 응답 — 반복이 있으면 가장 흔한 결정을 낸 응답 (관문을 거친 계획을 앱이 그대로 그린다)
    per: dict[tuple, list] = defaultdict(list)
    for r, g in zip(r2, g2, strict=True):
        if g["parsed"]:
            per[(r["photo_id"], r["look"])].append((r, g))
    chosen = []
    for (pid, look), runs in per.items():
        dec = mode([g["decisions"] for _, g in runs])
        r, g = next((r, g) for r, g in runs if g["decisions"] == dec)
        chosen.append((pid, look, r, g))
    reqs = []
    for pid, _, r, _ in chosen:  # 사진마다 (규칙 계획, 관문 거친 VLM 계획)
        reqs += [
            {"op": "plan", "m": faces[pid]["m"]},
            {"op": "plan", "m": faces[pid]["m"], "raw": r["content"]},
        ]
    plans = core(reqs)
    first_look = sorted({lk for _, lk, _, _ in chosen})[0]
    rnd = random.Random(7)
    items, key, cards, why_cards, photos = [], [], [], [], {}
    for n, (pid, look, _, g) in enumerate(chosen, start=1):
        rule_plan, vlm_plan = _blind(plans[2 * n - 2]), _blind(plans[2 * n - 1])
        a_is_vlm = rnd.random() < 0.5
        A, B = (vlm_plan, rule_plan) if a_is_vlm else (rule_plan, vlm_plan)
        key.append({"n": n, "photo_id": pid, "look": look, "A": "vlm" if a_is_vlm else "rule"})
        photos.setdefault(pid, _photo_url(faces[pid]))
        items.append({"n": n, "photo": pid, "lm": faces[pid]["lm"], "look": look, "A": A, "B": B})
        card_tpl = (HERE / "sheet_card.html").read_text(encoding="utf-8")
        cards.append(_fill(card_tpl, N=str(n), LOOK=look_label(look), PHOTO=pid))
        if look == first_look:  # 근거 문장은 사진마다 한 번 (화장 하나만)
            lis = "".join(f"<li>{html.escape(t)}</li>" for t in (g["rationale"] or {}).values() if t)
            why_cards.append(
                _fill(
                    (HERE / "why_card.html").read_text(encoding="utf-8"),
                    N=str(n),
                    PHOTO=pid,
                    WHY=f"<ul>{lis or '<li>— (관문이 근거 문장을 모두 거절함)</li>'}</ul>",
                )
            )
    bundle = subprocess.run(
        ["node", str(HERE / "sheet_bundle.mjs")], capture_output=True, text=True, encoding="utf-8", check=True
    ).stdout
    # <script> 안에 넣는 JSON·JS — "</" 가 태그를 닫지 않게 (JSON 에서 "\/" 는 "/" 와 같다)
    hair = hair_masks([faces[p] for p in photos])
    data = json.dumps({"photos": photos, "hair": hair, "items": items}, ensure_ascii=False).replace(
        "</", r"<\/"
    )
    out = data_dir() / "vlm-eval" / "out"
    out.mkdir(parents=True, exist_ok=True)
    page = _fill(
        (HERE / "sheet_page.html").read_text(encoding="utf-8"),
        MODEL=json.dumps(model),
        COUNT=str(len(cards)),
        DATA=data,
        BUNDLE=bundle.replace("</script", r"<\/script"),
        CARDS="".join(cards),
    )
    (out / f"sheet-{model}.html").write_text(page, encoding="utf-8")
    (out / f"sheet-{model}.key.json").write_text(json.dumps(key, ensure_ascii=False), encoding="utf-8")
    why = _fill(
        (HERE / "why_page.html").read_text(encoding="utf-8"),
        MODEL=json.dumps(model),
        COUNT=str(len(why_cards)),
        DATA=json.dumps({"photos": photos}).replace("</", r"<\/"),
        CARDS="".join(why_cards),
    )
    (out / f"why-{model}.html").write_text(why, encoding="utf-8")
    print(f"화장 비교 {len(key)}문항 → {out / f'sheet-{model}.html'}")
    print(f"근거 문장 {len(why_cards)}문항 → {out / f'why-{model}.html'}")
    print(f"(정답표 sheet-{model}.key.json 은 평가자에게 주지 않는다)")


def ratings(files: list[str]) -> None:
    """평가자가 돌려준 파일 모으기 — rating-*.json (6단계 화장 비교) · why-*.json (5단계 근거 문장)"""
    pref: dict[str, list[dict]] = defaultdict(list)
    why: dict[str, list[dict]] = defaultdict(list)
    for f in files:
        r = json.loads(Path(f).read_text(encoding="utf-8"))
        who = r.get("who") or Path(f).stem  # 이름을 안 적었으면 파일 이름으로
        if r.get("kind") == "why":
            for it in r["items"]:
                why[r["model"]].append(
                    {"who": who, "n": it["n"], "nat": it.get("nat"), "made_up": it.get("made_up")}
                )
            continue
        key = {
            k["n"]: k
            for k in json.loads(
                (data_dir() / "vlm-eval" / "out" / f"sheet-{r['model']}.key.json").read_text(encoding="utf-8")
            )
        }
        for it in r["items"]:
            vlm = "A" if key[it["n"]]["A"] == "vlm" else "B"
            pick = it.get("pick")
            pref[r["model"]].append(
                {
                    "who": who,
                    "n": it["n"],
                    "win": None if pick in (None, "same") else pick == vlm,
                    "pick": pick,
                }
            )

    for model in sorted(set(pref) | set(why)):
        lines = [f"# {model} — 사람 평가 · {dt.date.today().isoformat()}", ""]
        xs = pref.get(model, [])
        if xs:
            answered = [x for x in xs if x["pick"]]
            k, n = share(x["win"] for x in answered)
            ci = wilson(k, n)
            whos = sorted({x["who"] for x in xs})
            same = sum(1 for x in answered if x["pick"] == "same")
            # 평가자끼리 얼마나 같은 쪽을 골랐나 — 문항마다 (VLM · 규칙 · 비슷함) 고른 수
            per_item: dict[int, Counter] = defaultdict(Counter)
            for x in answered:
                per_item[x["n"]][{True: "vlm", False: "rule", None: "same"}[x["win"]]] += 1
            full = [c for c in per_item.values() if sum(c.values()) == len(whos)]
            kappa = fleiss_kappa([[c["vlm"], c["rule"], c["same"]] for c in full]) if len(whos) > 1 else None
            lines += [
                "## 6단계 화장 비교 (VLM 계획 대 규칙 계획, 앱 렌더러로 그려 가려서)",
                f"평가자 {len(whos)}명 ({', '.join(whos)}) · 답 {len(answered)}",
                "",
                f"- VLM 이 낫다 {k} · 규칙이 낫다 {n - k} · 비슷하다 {same}",
                f"- VLM 승률 (비슷함 제외) {k}/{n} = {pct(k / n if n else None)} "
                f"(95% {'—' if ci is None else f'{ci[0]:.2f}~{ci[1]:.2f}'}) "
                f"→ {mark(None if not n else k / n > PASS['win'])} (기준 > 50%)",
                f"- 평가자 일치 Fleiss κ {'—' if kappa is None else f'{kappa:.2f}'} "
                f"(모두 답한 {len(full)}문항)",
                "",
                "| 평가자 | VLM 이 낫다 | 규칙이 낫다 | 비슷하다 | 안 고름 |",
                "|---|---|---|---|---|",
            ]
            for w in whos:
                ws = [x for x in xs if x["who"] == w]
                lines.append(
                    f"| {w} | {sum(x['win'] is True for x in ws)} | {sum(x['win'] is False for x in ws)} "
                    f"| {sum(x['pick'] == 'same' for x in ws)} | {sum(not x['pick'] for x in ws)} |"
                )
            lines.append("")
        ys = why.get(model, [])
        if ys:
            nat = [float(y["nat"]) for y in ys if y["nat"] not in (None, "")]
            made_up = sum(1 for y in ys if y["made_up"])
            avg = sum(nat) / len(nat) if nat else None
            lines += [
                "## 5단계 근거 문장 (VLM)",
                f"평가자 {len({y['who'] for y in ys})}명 · 답 {len(nat)}",
                "",
                f"- 자연스러움 평균 {'—' if avg is None else f'{avg:.2f}'} "
                f"→ {mark(None if avg is None else avg >= 4)} (기준 4 이상)",
                f"- 지어냄 표시 {made_up}건 → {mark(made_up == 0)} (기준 0)",
                "",
            ]
        text = "\n".join(lines)
        out = data_dir() / "vlm-eval" / "out"
        out.mkdir(parents=True, exist_ok=True)
        (out / f"ratings-{model}.md").write_text(text, encoding="utf-8")
        print(text)
        print(f"\n→ {out / f'ratings-{model}.md'}")


# ---------- 모델 비교 (선정) ----------


def rule_baseline(faces: dict[str, dict]) -> dict:
    """규칙만 (VLM 없음) — VLM 이 이 줄을 이겨야 쓸 이유가 있다"""
    plans = core([{"op": "rule", "m": f["m"]} for f in faces.values()])
    fields = ["liner.style", "shadow.range", "lip.overline", "blush.position", "linerThick.scale"]
    shares = [Counter(str(p.get(f)) for p in plans).most_common(1)[0][1] / len(plans) for f in fields]
    return {"gate": 1.0, "follow": 1.0, "mode_max": round(max(shares), 3), "gap": 0.0, "swap_img": 0.0}


def compare(models: list[str]) -> None:
    faces = faces_by_id()
    rows_out = []
    used: set[str] = set()
    for m in models:
        used |= {r["photo_id"] for r in rows(m, 2)}
        _, n = summarize(m)
        for v in sorted({k.split("_")[1][0] for k in n if k.startswith("s2_") and k.endswith("c_gate")}):
            if f"s2_{v}c_gate" not in n or f"s4_{v}_follow" not in n:
                continue
            rows_out.append(
                {
                    "model": m,
                    "v": v,
                    "broken": n.get("s0_broken"),
                    "gate": n.get(f"s2_{v}c_gate"),
                    "gate_dec": n.get(f"s2_{v}c_gate_dec"),
                    "gate_rat": n.get(f"s2_{v}c_gate_rat"),
                    "agree": n.get(f"s3_{v}_worst_field"),
                    "p95": n.get(f"s2_{v}c_p95_ms"),
                    "follow": n.get(f"s4_{v}_follow"),
                    "gap": n.get(f"g_{v}_gap"),
                    "swap_img": n.get(f"g_{v}_swap_img"),
                    "perturb_img": n.get(f"g_{v}_perturb_img"),
                    "mismatch": n.get(f"s2_{v}c_mismatch"),
                    "mode_max": n.get(f"s2_{v}c_mode_max"),
                }
            )
    faces = {k: v for k, v in faces.items() if k in used} or faces  # 실제로 돌린 사진만
    rb = rule_baseline(faces)

    def ok(x: dict) -> bool:
        return (
            (x["broken"] in (0, None))
            and (x["gate"] or 0) >= PASS["gate"]
            and (x["agree"] is None or x["agree"] >= PASS["agree"])
        )

    lines = [
        f"# VLM 선정 비교 ({dt.date.today().isoformat()}) — 사진 {len(faces)}장",
        "",
        "탈락 기준: 깨진 출력 0 · 관문 ≥ 95% · 반복 일치 ≥ 90% (응답 시간 상한은 팀이 정하면 추가). "
        "순위 지표는 탈락을 넘은 줄끼리 본다.",
        "",
        "| 모델 | 형식 | 탈락 기준 | 관문 | 결정 값만 | 근거 문장만 | 반복 일치 | p95 ms | 뒤집기 따름 "
        "| 사진 근거 간격 | 다른 사람 사진 변화 | 밝기·자르기 변화 | 근거-값 불일치 | 값 쏠림 최대 |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
        f"| 규칙만 (VLM 없음) | — | 기준선 | {pct(rb['gate'])} | 100.0% | — | 100.0% | 0 "
        f"| {pct(rb['follow'])} "
        f"| +0.0%p | {pct(rb['swap_img'])} | 0.0% | 0.0% | {pct(rb['mode_max'])} |",
    ]
    for x in sorted(rows_out, key=lambda x: (not ok(x), -(x["gap"] or -9), -(x["follow"] or 0))):
        gap = "—" if x["gap"] is None else f"{x['gap'] * 100:+.1f}%p"
        cells = [
            x["model"],
            x["v"],
            "통과" if ok(x) else "탈락",
            pct(x["gate"]),
            pct(x["gate_dec"]),
            pct(x["gate_rat"]),
            pct(x["agree"]),
            str(x["p95"] or "—"),
            pct(x["follow"]),
            gap,
            pct(x["swap_img"]),
            pct(x["perturb_img"]),
            pct(x["mismatch"]),
            pct(x["mode_max"]),
        ]
        lines.append("| " + " | ".join(cells) + " |")
    lines += [
        "",
        "- 사진 근거 간격 = 다른 사람 사진일 때 사진 항목이 바뀐 비율 − 밝기·자르기 조금일 때 바뀐 비율. "
        "0 근처면 사진을 근거로 쓰지 않는다 → 규칙만 대비 VLM 을 쓸 이유가 약하다",
        "- 5·6단계(사람 평가)는 이 표에서 남은 후보만 한다",
    ]
    text = "\n".join(lines)
    out = data_dir() / "vlm-eval" / "out"
    out.mkdir(parents=True, exist_ok=True)
    (out / "compare.md").write_text(text, encoding="utf-8")
    # 같은 날 비교를 여럿 하면 덮어쓰지 않게 — 모델 이름 앞머리(sel-·fin-)가 같으면 붙인다
    heads = {m.split("-")[0] for m in models if "-" in m}
    tag = f"-{heads.pop()}" if len(heads) == 1 and all("-" in m for m in models) else ""
    res = results_dir() / f"{dt.date.today().isoformat()}_vlm_compare{tag}.csv"
    keys = list(rows_out[0]) if rows_out else []
    res.write_text(
        ",".join(keys)
        + "\n"
        + "".join(",".join("" if x[k] is None else str(x[k]) for k in keys) + "\n" for x in rows_out),
        encoding="utf-8",
    )
    print(text)
    print(f"\n→ {out / 'compare.md'}\n→ {res}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model")
    ap.add_argument("--sheet", action="store_true")
    ap.add_argument("--sheet-variant", default="A", help="평가지에 쓸 프롬프트 형식 (예: E)")
    ap.add_argument("--ratings", nargs="*")
    ap.add_argument("--compare", nargs="*", help="모델 여럿 — 선정 비교표 (규칙만 기준선 포함)")
    args = ap.parse_args()
    if args.ratings:
        ratings(args.ratings)
        return
    if args.compare:
        compare(args.compare)
        return
    if not args.model:
        sys.exit("--model 을 주세요")
    if args.sheet:
        sheet(args.model, args.sheet_variant)
        return
    text, num = summarize(args.model)
    out = data_dir() / "vlm-eval" / "out"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{args.model}-summary.md").write_text(text, encoding="utf-8")
    res = results_dir() / f"{dt.date.today().isoformat()}_vlm_{args.model}.csv"
    res.write_text(
        ",".join(num) + "\n" + ",".join("" if v is None else str(v) for v in num.values()) + "\n",
        encoding="utf-8",
    )
    print(text)
    print(f"\n→ {out / f'{args.model}-summary.md'}\n→ {res}")


if __name__ == "__main__":
    main()
