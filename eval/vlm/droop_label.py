"""처진 눈 라벨링 — 사람이 정답을 표시하고, 그 정답과 가장 잘 맞는 측정 방법·경계값을 찾는다.

    uv run --extra vlm python eval/vlm/droop_label.py --sheet   # 표시용 HTML (사진 포함 → DHE_DATA_DIR 에만)
    uv run --extra vlm python eval/vlm/droop_label.py --fit labels-*.json  # 표시 → 측정 방법별 일치도

처진 눈 판정이 사람 눈과 어긋났다 (2026-10-01): ILoveEye α>β 는 30장 중 21장을 처진 눈으로,
눈꼬리 기울기(<0°)는 0장으로 봤는데, 사람이 보기엔 처진 눈인 얼굴(예: ea_021189 — 윗꺼풀 바깥이
눈꼬리를 덮어 내려옴)이 있다. 공식을 더 만지기 전에 사람 판단을 정답으로 놓는다.
측정값은 표시지에 보이지 않는다 (선입견), 순서도 섞는다.
사진: $DHE_DATA_DIR/vlm-eval/photos (FFHQ-Makeup 동양인 30장, eval/samples 와 같은 사람) · 점: work/*.json
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from landmarks import data_dir  # noqa: E402

EYE_PTS = (33, 133, 263, 362)  # 바깥·안쪽 눈꼬리 (오른쪽 R · 왼쪽 L)


def faces() -> list[dict]:
    work = data_dir() / "vlm-eval" / "work"
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(work.glob("*.json"))]


def fid(face: dict) -> str:
    return "ea_" + Path(face["photo"]).stem.split("_")[-1]


def _jpeg(im) -> str:
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def crops(face: dict) -> tuple[str, str]:
    """(얼굴, 두 눈 확대) — 점·선은 그리지 않는다 (사람 눈으로만)"""
    from PIL import Image  # noqa: PLC0415

    im = Image.open(data_dir() / "vlm-eval" / "photos" / face["photo"]).convert("RGB")
    lm = face["lm"]
    xs = [p["x"] for p in lm]
    ys = [p["y"] for p in lm]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    side = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.25
    whole = im.crop((int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))).resize(
        (300, 300)
    )
    ex = [lm[i]["x"] for i in EYE_PTS]
    ey = [lm[i]["y"] for i in EYE_PTS]
    w = max(ex) - min(ex)
    box = (int(min(ex) - w * 0.18), int(min(ey) - w * 0.22), int(max(ex) + w * 0.18), int(max(ey) + w * 0.16))
    eyes = im.crop(box)
    eyes = eyes.resize((640, round(640 * eyes.height / eyes.width)), Image.Resampling.LANCZOS)
    return _jpeg(whole), _jpeg(eyes)


def sheet() -> Path:
    fs = faces()
    random.Random(20261001).shuffle(fs)  # 순서 섞기 — 측정값·번호 순서의 선입견 없이
    cards = []
    for n, f in enumerate(fs, start=1):
        whole, eyes = crops(f)
        k = fid(f)
        cards.append(
            f'<section data-id="{k}"><h2>{n}. <span class=id>{k}</span></h2>'
            f'<div class=row><img class=whole src="{whole}" alt="{k} 얼굴">'
            f'<img class=eyes src="{eyes}" alt="{k} 두 눈"></div>'
            f"<div class=pick>"
            f'<label><input type=radio name="{k}" value=droopy>처진 눈</label>'
            f'<label><input type=radio name="{k}" value=unsure>애매</label>'
            f'<label><input type=radio name="{k}" value=not>아님</label></div></section>'
        )
    page = (HERE / "droop_label_page.html").read_text(encoding="utf-8")
    page = page.replace("{{COUNT}}", str(len(cards))).replace("{{CARDS}}", "".join(cards))
    out = data_dir() / "vlm-eval" / "out" / "label-droop.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")
    return out


# ---------- 표시 → 측정 방법 맞추기 ----------

UPPER = {"R": (33, 161, 133), "L": (263, 388, 362)}  # 바깥 눈꼬리 · 바깥쪽 윗꺼풀 점 · 안쪽 눈꼬리


def measures(face: dict) -> dict[str, float]:
    """후보 측정값 (클수록 처진 쪽으로 맞춘다)"""
    lm, m = face["lm"], face["m"]
    e = m["eye"]
    roll = math.radians(m["rollDeg"])

    def down(p: dict, q: dict) -> float:  # p→q 가 수평보다 아래로 내려가는 각 (롤 보정)
        dx, dy = q["x"] - p["x"], q["y"] - p["y"]
        dx, dy = dx * math.cos(-roll) - dy * math.sin(-roll), dx * math.sin(-roll) + dy * math.cos(-roll)
        return math.degrees(math.atan2(dy, abs(dx)))

    lat = sum(down(lm[a], lm[o]) for o, a, _ in UPPER.values()) / 2
    return {
        "minus_tilt": -(e["R"]["tiltDeg"] + e["L"]["tiltDeg"]) / 2,  # 눈꼬리 기울기 (작을수록 처짐)
        "alpha_minus_beta": (
            (e["R"]["alphaDeg"] - e["R"]["betaDeg"]) + (e["L"]["alphaDeg"] - e["L"]["betaDeg"])
        )
        / 2,
        "lateral_lid": lat,  # 윗꺼풀 바깥쪽이 눈꼬리로 내려오는 각
        "lateral_lid_per_open": lat / max(1e-6, (e["R"]["heightRatio"] + e["L"]["heightRatio"]) / 2),
    }


def auc(pos: list[float], neg: list[float]) -> float | None:
    """처진 눈(pos)이 아닌 눈(neg)보다 큰 값을 받을 확률 — 0.5 면 구별 못 함, 1 이면 완전 구별"""
    if not pos or not neg:
        return None
    s = sum((p > q) + 0.5 * (p == q) for p in pos for q in neg)
    return s / (len(pos) * len(neg))


def fit(files: list[str]) -> None:
    by_id = {fid(f): f for f in faces()}
    votes: dict[str, list[str]] = {}
    whos = []
    for f in files:
        r = json.loads(Path(f).read_text(encoding="utf-8"))
        whos.append(r.get("who") or Path(f).stem)
        for k, v in r["labels"].items():
            if v:
                votes.setdefault(k, []).append(v)
    # 정답: 과반이 처진 눈 → 1, 과반이 아님 → 0, 그 밖(애매·갈림) → 뺀다
    truth = {}
    for k, vs in votes.items():
        d, n = vs.count("droopy"), vs.count("not")
        if d > len(vs) / 2:
            truth[k] = 1
        elif n > len(vs) / 2:
            truth[k] = 0
    print(
        f"표시 {len(whos)}명 ({', '.join(whos)}) · 정답으로 쓴 사진 {len(truth)}장 "
        f"(처진 눈 {sum(truth.values())} · 아님 {len(truth) - sum(truth.values())})"
    )
    ms = {k: measures(by_id[k]) for k in truth if k in by_id}
    print("\n| 측정 | 구별력 AUC (0.5 = 못 가림) | 가장 잘 맞는 경계 · 맞춘 수 |")
    print("|---|---|---|")
    for name in next(iter(ms.values())):
        pos = [ms[k][name] for k in ms if truth[k] == 1]
        neg = [ms[k][name] for k in ms if truth[k] == 0]
        a = auc(pos, neg)
        best = max(
            (
                (t, sum((ms[k][name] > t) == bool(truth[k]) for k in ms))
                for t in sorted({v[name] for v in ms.values()})
            ),
            key=lambda x: x[1],
        )
        print(f"| {name} | {'—' if a is None else f'{a:.2f}'} | > {best[0]:.1f} · {best[1]}/{len(ms)} |")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sheet", action="store_true")
    ap.add_argument("--fit", nargs="*")
    a = ap.parse_args()
    if a.sheet:
        print(f"표시지 → {sheet()}")
    elif a.fit:
        fit(a.fit)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
