"""core.py가 core.js와 같은 결과를 내는지 검증한다.

    python parity.py            # 시드 50개 비교
    python parity.py 200        # 시드 200개 비교

node를 직접 불러 core.js의 결과를 받아 온다. 같은 시드에서 파라미터·면적·폴리곤 좌표가
전부 일치해야 통과다. 삼각함수 마지막 자리 차이는 허용한다(상대오차 1e-9).

브라우저 데모와 대량 생성이 같은 데이터를 만든다는 보장이 이 검증이다.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from core import build_sample, random_params, sample_stats
from fixture import make_fixture

TOL = 1e-9
HERE = Path(__file__).parent

# 한글 윈도우 콘솔은 기본이 CP949라 일부 문자에서 죽는다. UTF-8로 고정한다.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def close(a: float, b: float) -> bool:
    return abs(a - b) <= TOL * max(1.0, abs(a), abs(b))


class Diff:
    def __init__(self) -> None:
        self.items: list[str] = []

    def num(self, path: str, js, py) -> None:
        if not (isinstance(js, (int, float)) and isinstance(py, (int, float))):
            if js != py:
                self.items.append(f"{path}: js={js!r} py={py!r}")
            return
        if not close(float(js), float(py)):
            self.items.append(f"{path}: js={js!r} py={py!r} (차 {abs(js - py):.3e})")

    def eq(self, path: str, js, py) -> None:
        if js != py:
            self.items.append(f"{path}: js={js!r} py={py!r}")


def compare(js_doc: dict) -> Diff:
    lm = make_fixture()
    d = Diff()

    for js in js_doc["samples"]:
        seed = js["seed"]
        params = random_params(seed)
        sample = build_sample(lm, params)
        areas = sample_stats(sample)
        tag = f"시드 {seed}"

        # 1. 파라미터
        jp = js["params"]
        d.num(f"{tag} asym", jp["asym"], params["asym"])
        for part in ("brow", "liner", "shadow", "lip", "cheek"):
            for key, jv in jp[part].items():
                pv = params[part][key]
                (d.eq if isinstance(jv, (str, bool)) else d.num)(f"{tag} {part}.{key}", jv, pv)

        # 2. 부위 구성 (순서 포함)
        d.eq(f"{tag} 부위 순서",
             [p["id"] for p in js["parts"]], [p.id for p in sample["parts"]])

        # 3. 면적
        for pid, jv in js["areas"].items():
            d.num(f"{tag} 면적 {pid}", jv, areas.get(pid))

        # 4. 폴리곤 점 개수와 양 끝점
        for jpart, ppart in zip(js["parts"], sample["parts"]):
            d.eq(f"{tag} {jpart['id']} 라벨", jpart["label"], ppart.label)
            d.eq(f"{tag} {jpart['id']} 색", jpart["color"], ppart.color)
            d.num(f"{tag} {jpart['id']} 농도", jpart["alpha"], ppart.alpha)
            d.eq(f"{tag} {jpart['id']} 폴리곤 수", len(jpart["polys"]), len(ppart.polys))
            for k, (jpoly, ppoly) in enumerate(zip(jpart["polys"], ppart.polys)):
                d.eq(f"{tag} {jpart['id']}[{k}] 점 개수", jpoly["n"], len(ppoly))
                d.num(f"{tag} {jpart['id']}[{k}] 첫점 x", jpoly["first"][0], ppoly[0][0])
                d.num(f"{tag} {jpart['id']}[{k}] 첫점 y", jpoly["first"][1], ppoly[0][1])
                d.num(f"{tag} {jpart['id']}[{k}] 끝점 x", jpoly["last"][0], ppoly[-1][0])
                d.num(f"{tag} {jpart['id']}[{k}] 끝점 y", jpoly["last"][1], ppoly[-1][1])
    return d


def main() -> int:
    seeds = sys.argv[1] if len(sys.argv) > 1 else "50"

    node = shutil.which("node")
    if not node:
        print("node를 찾지 못했습니다. Node.js를 설치하면 JS와 대조 검증을 할 수 있습니다.")
        return 2

    proc = subprocess.run([node, str(HERE / "parity.mjs"), seeds],
                          capture_output=True, text=True, cwd=HERE)
    if proc.returncode != 0:
        print("parity.mjs 실행 실패:\n" + proc.stderr)
        return 2

    js_doc = json.loads(proc.stdout)
    d = compare(js_doc)

    n = js_doc["seeds"]
    if d.items:
        print(f"FAIL  시드 {n}개 중 {len(d.items)}곳 불일치\n")
        for line in d.items[:40]:
            print("  " + line)
        if len(d.items) > 40:
            print(f"  … 외 {len(d.items) - 40}곳")
        return 1

    print(f"PASS  core.py == core.js · 시드 {n}개 전부 일치 (허용 오차 {TOL:g})")
    print("      파라미터 · 부위 순서 · 면적 · 폴리곤 점 개수 · 양 끝점 좌표")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
