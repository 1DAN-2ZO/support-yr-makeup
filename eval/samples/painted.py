"""합성 화장 세트 — 실제 맨얼굴에 화장 템플릿을 네 단계로 칠해 채점해 보고, 라벨 붙인 그림과 표를 만든다.

    uv run --extra eval python eval/samples/painted.py                  # 30명 × 화장 10종
    uv run --extra eval python eval/samples/painted.py --looks edgy pure --limit 5

    덜 채움 · 적당함 · 조금 번짐 · 많이 번짐   → 기대 판정 조금 · 맞음 · 조금 · 많이

먼저 `eval/samples/ffhq_east_asian.py --landmarks` 로 맨얼굴과 얼굴 점을 꺼내 둔다.
결과는 전부 저장소 밖 `$DHE_DATA_DIR/samples/ffhq-painted/` — 사진은 저장소에 넣지 않는다.
    bare/            맨얼굴 PNG + 얼굴 점
    crops/           부위만 자른 그림
    sheets/          사람 × 화장마다 한 장 — 부위 5줄 × (맨얼굴 + 4단계), 칸마다 기대·채점 결과
    results.json     칸마다 판정
    summary.csv      부위 × 단계 표

칠하기·채점은 `paint_levels.mjs` (앱과 같은 채점 코드). 여기 일치율은 **합성 기준**이다 —
화장이 고른 색이라 실제보다 쉽고, '적당함' 은 채점과 같은 가이드로 칠해서 높게 나오는 게 당연하다.
기준값 확정·발표 숫자는 골든 세트(사람 라벨)로 한다.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import statistics
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CLI = HERE / "paint_levels.mjs"

PARTS = ["brow", "liner", "shadow", "lip", "cheek"]
LEVELS = ["under", "ok", "slight", "heavy"]
PART_KO = {"brow": "눈썹", "liner": "라이너", "shadow": "섀도우", "lip": "입술", "cheek": "볼"}
LEVEL_KO = {"under": "덜 채움", "ok": "적당함", "slight": "조금 번짐", "heavy": "많이 번짐"}
LABEL_KO = {"ok": "맞음", "slight": "조금", "off": "많이"}
REASON_KO = {
    "faint": "안 보임",
    "subtle": "피부와 가까움",
    "lighting": "밝기 다름",
    "align": "얼굴 안 맞음",
    "occluded": "가림",
    "no_band": "기준 없음",
}


def data_dir() -> Path:
    d = os.environ.get("DHE_DATA_DIR")
    if not d:
        sys.exit("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)")
    return Path(d)


def prepare_bare(src: Path, bare: Path) -> int:
    """꺼낸 맨얼굴(jpg + lm.json) → 채점기가 읽는 PNG + 얼굴 점"""
    from PIL import Image  # noqa: PLC0415

    bare.mkdir(parents=True, exist_ok=True)
    n = 0
    for lm in sorted(src.glob("*.lm.json")):
        jpg = lm.with_name(lm.name[: -len(".lm.json")] + ".jpg")
        if not jpg.exists():
            continue
        png = bare / (jpg.stem + ".png")
        if not png.exists():
            Image.open(jpg).convert("RGBA").save(png)
        shutil.copyfile(lm, bare / lm.name)
        n += 1
    return n


def verdict(r: dict) -> str:
    """한 칸의 채점 결과를 한 줄로"""
    if r["status"] != "scored":
        return f"확인만 ({REASON_KO.get(r['check_reason'], r['check_reason'])})"
    return f"{r['score']}점 {LABEL_KO[r['pred']]}"


def hit(r: dict) -> bool | None:
    """기대와 같은가. 확인만이면 None (틀린 답이 아니라 무응답 — eval/score/run.py 와 같은 규칙)"""
    return None if r["status"] != "scored" else r["pred"] == r["expect"]


def summarize(rows: list[dict]) -> list[dict]:
    """부위 × 단계 표 + 순서 지키는 비율"""
    out = []
    by = defaultdict(list)
    for r in rows:
        by[(r["part"], r["level"])].append(r)
    for part in PARTS:
        for level in LEVELS:
            rs = by.get((part, level), [])
            if not rs:
                continue
            scored = [r for r in rs if r["status"] == "scored"]
            preds = Counter(r["pred"] for r in scored)
            reasons = Counter(r["check_reason"] for r in rs if r["status"] != "scored")
            out.append(
                {
                    "부위": PART_KO[part],
                    "단계": LEVEL_KO[level],
                    "기대": LABEL_KO[rs[0]["expect"]],
                    "칸 수": len(rs),
                    "점수 낸 칸": len(scored),
                    "기대와 일치": f"{sum(r['pred'] == r['expect'] for r in scored) / len(scored):.0%}"
                    if scored
                    else "-",
                    "맞음·조금·많이": "·".join(str(preds.get(k, 0)) for k in ("ok", "slight", "off")),
                    "점수 중앙값": round(statistics.median(r["score"] for r in scored)) if scored else "-",
                    "확인만": " ".join(f"{REASON_KO.get(k, k)} {v}" for k, v in reasons.most_common()) or "-",
                }
            )
    return out


def ordering(rows: list[dict]) -> list[dict]:
    """같은 사람·화장·부위에서 점수 순서가 맞는 비율 — 네 단계가 다 점수를 낸 묶음만"""
    groups = defaultdict(dict)
    for r in rows:
        if r["status"] == "scored":
            groups[(r["person"], r["look"], r["part"])][r["level"]] = r["score"]
    out = []
    for part in PARTS:
        full = [g for (_, _, p), g in groups.items() if p == part and len(g) == len(LEVELS)]
        if not full:
            out.append({"부위": PART_KO[part], "묶음": 0})
            continue

        def rate(f, full=full):
            return f"{sum(f(g) for g in full) / len(full):.0%}"

        out.append(
            {
                "부위": PART_KO[part],
                "묶음": len(full),
                "적당 > 덜 채움": rate(lambda g: g["ok"] > g["under"]),
                "적당 > 조금 번짐": rate(lambda g: g["ok"] > g["slight"]),
                "조금 번짐 > 많이 번짐": rate(lambda g: g["slight"] > g["heavy"]),
                "셋 다": rate(lambda g: g["ok"] > g["under"] and g["ok"] > g["slight"] > g["heavy"]),
            }
        )
    return out


def _font(size: int):
    from PIL import ImageFont  # noqa: PLC0415

    for name in ("malgun.ttf", "NanumGothic.ttf", "AppleGothic.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def sheet(out: Path, person: str, look: str, look_name: str, rows: list[dict], path: Path) -> None:
    """한 사람 × 한 화장 — 부위 5줄 × (맨얼굴 + 4단계). 칸 아래에 단계·기대·채점 결과"""
    from PIL import Image, ImageDraw  # noqa: PLC0415

    cell_w, cap_h, pad, head = 300, 46, 8, 40
    font, small = _font(17), _font(15)
    by = {(r["part"], r["level"]): r for r in rows}
    strips = []
    for part in PARTS:
        cells = []
        bare = out / "crops" / person / f"bare_{part}.png"
        items = [("bare", bare, None)] + [
            (lv, out / by[(part, lv)]["crop"], by[(part, lv)]) for lv in LEVELS if (part, lv) in by
        ]
        for lv, p, r in items:
            im = Image.open(p).convert("RGB")
            im = im.resize((cell_w, max(1, round(im.height * cell_w / im.width))))
            cells.append((lv, im, r))
        h = max(im.height for _, im, _ in cells)
        strip = Image.new("RGB", ((cell_w + pad) * 5 + pad, h + cap_h + pad), "white")
        d = ImageDraw.Draw(strip)
        for i, (lv, im, r) in enumerate(cells):
            x = pad + i * (cell_w + pad)
            strip.paste(im, (x, 0))
            if r is None:
                d.text((x, h + 4), f"{PART_KO[part]} · 맨얼굴", fill="black", font=font)
                continue
            ok = hit(r)
            mark, color = ("–", "#666666") if ok is None else ("O", "#0a7a2f") if ok else ("X", "#c62828")
            d.text((x, h + 4), f"{LEVEL_KO[lv]} · 기대 {LABEL_KO[r['expect']]}", fill="black", font=font)
            d.text((x, h + 25), f"{mark} 채점 {verdict(r)}", fill=color, font=small)
        strips.append(strip)
    w = max(s.width for s in strips)
    page = Image.new("RGB", (w, head + sum(s.height for s in strips)), "white")
    ImageDraw.Draw(page).text(
        (pad, 8),
        f"{person} · {look_name} ({look}) — 합성 화장, 실제 맨얼굴 (FFHQ-Makeup · 평가용)",
        fill="black",
        font=_font(20),
    )
    y = head
    for s in strips:
        page.paste(s, (0, y))
        y += s.height
    path.parent.mkdir(parents=True, exist_ok=True)
    page.save(path)


def table(rows: list[dict]) -> str:
    if not rows:
        return "(없음)"
    keys = list(rows[0])
    return "\n".join([" | ".join(keys)] + [" | ".join(str(r.get(k, "")) for k in keys) for r in rows])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--src", type=Path, help="맨얼굴 jpg + lm.json (기본 $DHE_DATA_DIR/samples/ffhq-east-asian)"
    )
    ap.add_argument("--out", type=Path, help="결과 폴더 (기본 $DHE_DATA_DIR/samples/ffhq-painted)")
    ap.add_argument("--looks", nargs="*", help="화장 id (기본 전부)")
    ap.add_argument("--limit", type=int, help="앞에서 몇 명만")
    ap.add_argument("--no-sheets", action="store_true", help="그림은 안 만들고 표만")
    args = ap.parse_args()

    src = args.src or data_dir() / "samples" / "ffhq-east-asian"
    out = args.out or data_dir() / "samples" / "ffhq-painted"
    n = prepare_bare(src, out / "bare")
    if not n:
        sys.exit(f"맨얼굴이 없습니다: {src} — 먼저 eval/samples/ffhq_east_asian.py --landmarks")
    node = shutil.which("node")
    if not node:
        sys.exit("node 가 없습니다")
    req = {
        "bare_dir": str(out / "bare"),
        "out_dir": str(out),
        "looks": args.looks or None,
        "limit": args.limit,
    }
    subprocess.run([node, str(CLI)], input=json.dumps(req), text=True, encoding="utf-8", check=True)
    rows = json.loads((out / "results.json").read_text(encoding="utf-8"))

    names = {
        lk["id"]: lk["name"]
        for lk in json.loads((ROOT / "rules" / "looks.json").read_text(encoding="utf-8"))["looks"]
    }
    if not args.no_sheets:
        groups = defaultdict(list)
        for r in rows:
            groups[(r["person"], r["look"])].append(r)
        for (person, look), rs in sorted(groups.items()):
            sheet(out, person, look, names.get(look, look), rs, out / "sheets" / f"{person}_{look}.png")
        print(f"그림 {len(groups)}장 → {out / 'sheets'}")

    summary, order = summarize(rows), ordering(rows)
    with (out / "summary.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(summary[0]))
        w.writeheader()
        w.writerows(summary)
    print(f"\n## 부위 × 단계 ({len(rows)}칸, 합성 기준)\n{table(summary)}")
    print(f"\n## 점수 순서가 맞는 비율 (네 단계가 다 점수를 낸 묶음)\n{table(order)}")


if __name__ == "__main__":
    main()
