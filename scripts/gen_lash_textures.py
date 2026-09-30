"""
마스카라(속눈썹) 텍스처 PNG 생성기 — client/public/lashes/ 에 PNG 4장 + lashes.json 을 쓴다.

왜 PNG 인가: Ulike·SODA 처럼 "눈꺼풀 선에 붙인 그림 한 장"을 눈 뜬 정도에 따라 바꿔 끼우는
방식(2026-09-30 조사, 사용자 실기기 관찰: 옆모습에서 안 튀어나옴 · 매 프레임 같은 배치 ·
위/중간/아래 3단계가 뚝 끊겨 바뀜)을 따라 한다.
그림은 디자이너가 나중에 같은 규격으로 갈아 끼울 수 있다 — 규격은 lashes.json 이 정하고
클라이언트는 그것만 읽는다.

규격 (텍스처 좌표):
  가로 u = 눈꺼풀 선을 따라간 비율. 0 = 눈 앞머리, 1 = 눈꼬리. [U_MIN, U_MAX] 가 그림 왼쪽~오른쪽 끝.
  세로 v = 눈꺼풀 선에서 바깥(눈에서 먼 쪽) 방향 거리, 단위는 눈 폭. v=0 이 속눈썹 뿌리 선.
           윗눈꺼풀은 +v 가 눈썹 쪽, 아랫눈꺼풀은 +v 가 볼 쪽. 그림 위쪽 = vMax, 아래쪽 = vMin.
  색은 검정 + 알파. 색은 클라이언트가 룩 색으로 입힌다.

실행 (저장소 루트에서):  uv run --with pillow --with numpy python scripts/gen_lash_textures.py
시드 고정 — 같은 명령이면 같은 그림이 나온다.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "client" / "public" / "lashes"
PPU = 600  # 눈 폭 1 당 픽셀 (세로)
U_MIN, U_MAX = -0.06, 1.22
W = 768  # 가로 픽셀 (u 범위 1.28)
SS = 3  # 슈퍼샘플 배율 — 가는 끝을 부드럽게


def smooth(a: float, b: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


class Canvas:
    def __init__(self, v_min: float, v_max: float):
        self.v_min, self.v_max = v_min, v_max
        self.h = round((v_max - v_min) * PPU)
        self.acc = np.zeros((self.h * SS, W * SS), dtype=np.float32)
        self.pu = W / (U_MAX - U_MIN)  # u 1 당 픽셀

    def px(self, u: float, v: float) -> tuple[float, float]:
        return ((u - U_MIN) * self.pu * SS, (self.v_max - v) * PPU * SS)

    def add(self, poly: list[tuple[float, float]], alpha: float) -> None:
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        x0, y0 = max(0, int(min(xs)) - 2), max(0, int(min(ys)) - 2)
        x1, y1 = min(W * SS, int(max(xs)) + 3), min(self.h * SS, int(max(ys)) + 3)
        if x1 <= x0 or y1 <= y0:
            return
        m = Image.new("L", (x1 - x0, y1 - y0), 0)
        ImageDraw.Draw(m).polygon([(x - x0, y - y0) for x, y in poly], fill=255)
        a = np.asarray(m, dtype=np.float32) / 255.0 * alpha
        sub = self.acc[y0:y1, x0:x1]
        self.acc[y0:y1, x0:x1] = 1 - (1 - sub) * (1 - a)  # 겹치면 진해진다 (마스카라 뭉침)

    def strand(
        self,
        root_u: float,
        theta: float,
        length: float,
        curl: float,
        w0: float,
        alpha: float,
        pull: tuple[float, float] | None = None,
        pull_k: float = 0.0,
        sign: int = 1,
    ) -> None:
        """한 가닥. theta = +v(sign=1) 또는 -v(sign=-1) 축에서 눈꼬리(+u) 쪽으로 기운 각(도).
        curl = 끝에서 더 기우는 각.
        pull = 뭉치 끝(u,v) — 끝을 그쪽으로 당겨 3~5가닥이 한 점으로 모이게 한다."""

        def d(deg: float) -> tuple[float, float]:
            r = math.radians(deg)
            return math.sin(r), sign * math.cos(r)

        du0, dv0 = d(theta)
        du1, dv1 = d(theta + curl)
        r = (root_u, 0.0)
        c = (r[0] + du0 * length * 0.55, r[1] + dv0 * length * 0.55)
        t = (r[0] + (du0 * 0.35 + du1 * 0.65) * length, r[1] + (dv0 * 0.35 + dv1 * 0.65) * length)
        if pull:
            t = (lerp(t[0], pull[0], pull_k), lerp(t[1], pull[1], pull_k))
        n = 28
        pts, nor = [], []
        for i in range(n + 1):
            s = i / n
            x = (1 - s) ** 2 * r[0] + 2 * (1 - s) * s * c[0] + s * s * t[0]
            y = (1 - s) ** 2 * r[1] + 2 * (1 - s) * s * c[1] + s * s * t[1]
            gx = 2 * (1 - s) * (c[0] - r[0]) + 2 * s * (t[0] - c[0])
            gy = 2 * (1 - s) * (c[1] - r[1]) + 2 * s * (t[1] - c[1])
            gl = math.hypot(gx, gy) or 1
            pts.append(self.px(x, y))
            nor.append((-gy / gl, gx / gl))
        left, right = [], []
        for i, ((x, y), (nx, ny)) in enumerate(zip(pts, nor, strict=True)):
            s = i / n
            hw = max(0.25 * SS, w0 * PPU * SS * (1 - s) ** 0.9)  # 뿌리 굵고 끝 뾰족
            # 픽셀 좌표는 y 가 뒤집혀 있어 법선의 y 부호를 바꾼다
            left.append((x + nx * hw, y - ny * hw))
            right.append((x - nx * hw, y + ny * hw))
        self.add(left + right[::-1], alpha)

    def root_band(self, u0: float, u1: float, thick: float, alpha: float, sign: int = 1) -> None:
        """뿌리 선을 따라 얇게 진한 띠 — 점막을 채운 듯한 느낌. 양끝은 가늘어진다."""
        n = 60
        top, bot = [], []
        for i in range(n + 1):
            u = lerp(u0, u1, i / n)
            k = math.sin(math.pi * i / n) ** 0.6
            top.append(self.px(u, sign * thick * k))
            bot.append(self.px(u, -sign * thick * 0.25 * k))
        self.add(top + bot[::-1], alpha)

    def save(self, name: str, blur: float = 0.55) -> None:
        a = Image.fromarray((np.clip(self.acc, 0, 1) * 255).astype(np.uint8), "L")
        a = a.resize((W, self.h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(blur))
        img = Image.new("RGBA", (W, self.h), (0, 0, 0, 0))
        img.putalpha(a)
        img.save(OUT / name, optimize=True)


def clumps(rnd: random.Random, u0: float, u1: float, n: int, size: tuple[int, int]) -> list[list[float]]:
    """u0~u1 에 n 가닥을 놓고 size 개씩 뭉치로 묶는다 (가닥 u 값 목록의 목록)."""
    us = sorted(lerp(u0, u1, (i + 0.5) / n) + rnd.uniform(-0.35, 0.35) * (u1 - u0) / n for i in range(n))
    out, i = [], 0
    while i < len(us):
        k = rnd.randint(*size)
        out.append(us[i : i + k])
        i += k
    return out


def upper(
    name: str,
    v_min: float,
    v_max: float,
    *,
    sign: int,
    n: int,
    len_fn,
    theta_fn,
    curl: float,
    pull_k: float,
    band: bool,
    seed: int,
    w0: float = 0.0042,
) -> dict:
    rnd = random.Random(seed)
    cv = Canvas(v_min, v_max)
    if band:
        cv.root_band(0.02, 1.0, 0.012, 0.85, sign=-sign)
    for group in clumps(rnd, 0.03, 1.0, n, (2, 3) if n < 30 else (3, 6)):
        um = sum(group) / len(group)
        L, th = len_fn(um), theta_fn(um)
        r = math.radians(th + curl * 0.7)
        tip = (um + math.sin(r) * L * 0.95, sign * math.cos(r) * L * 0.95)
        for u in group:
            cv.strand(
                u,
                theta_fn(u) + rnd.uniform(-6, 6),
                len_fn(u) * rnd.uniform(0.8, 1.08),
                curl,
                w0 * rnd.uniform(0.6, 1.3),
                rnd.uniform(0.72, 0.96),
                tip,
                pull_k,
                sign,
            )
    # 뭉치 사이 짧은 잔털 — 빈틈을 메운다
    for _ in range(n // 2):
        u = rnd.uniform(0.05, 0.98)
        cv.strand(
            u,
            theta_fn(u) + rnd.uniform(-10, 10),
            len_fn(u) * rnd.uniform(0.35, 0.6),
            curl * 0.5,
            w0 * 0.6,
            rnd.uniform(0.5, 0.75),
            sign=sign,
        )
    cv.save(name)
    return {"file": name, "vMin": v_min, "vMax": v_max}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    peak = lambda u, lo, hi: lo + (hi - lo) * smooth(0.0, 0.62, u) - (hi - lo) * 0.18 * smooth(0.88, 1.0, u)  # noqa: E731
    tex = {
        # 눈 뜸: 위로 선다. 정면에서 보면 앞으로 뻗은 만큼 짧아 보인다.
        # 앞머리는 안쪽으로, 눈꼬리는 바깥으로 펼쳐진다
        "up": upper(
            "upper-up.png",
            -0.05,
            0.42,
            sign=1,
            n=62,
            seed=11,
            curl=14,
            pull_k=0.62,
            band=True,
            len_fn=lambda u: peak(u, 0.10, 0.34),
            theta_fn=lambda u: lerp(-14, 58, u**1.35),
        ),
        # 반쯤 감음: 속눈썹이 카메라 쪽을 향해 짧게 보이고, 옆으로 퍼진다
        "mid": upper(
            "upper-mid.png",
            -0.22,
            0.2,
            sign=1,
            n=54,
            seed=12,
            curl=22,
            pull_k=0.55,
            band=True,
            len_fn=lambda u: peak(u, 0.06, 0.17),
            theta_fn=lambda u: lerp(-30, 102, u**1.2),
        ),
        # 눈 감음: 아래로 늘어진다 (IMG_2509 관찰 — 뭉친 가닥, 가운데~바깥이 길고 눈꼬리는 옆으로 쓸림)
        "down": upper(
            "upper-down.png",
            -0.5,
            0.05,
            sign=-1,
            n=66,
            seed=13,
            curl=10,
            pull_k=0.66,
            band=True,
            len_fn=lambda u: peak(u, 0.12, 0.42),
            theta_fn=lambda u: lerp(-12, 68, u**1.5),
        ),
        # 아랫속눈썹: 짧고 성기다. 눈 감음 때는 윗속눈썹에 가려 그리지 않는다
        "lower": upper(
            "lower.png",
            -0.04,
            0.18,
            sign=1,
            n=24,
            seed=14,
            curl=3,
            pull_k=0.45,
            band=False,
            w0=0.0032,
            len_fn=lambda u: 0.05 + 0.07 * smooth(0.1, 0.85, u),
            theta_fn=lambda u: lerp(-12, 40, u),
        ),
    }
    meta = {
        "version": 1,
        "note": (
            "scripts/gen_lash_textures.py 가 만든다. 규격은 그 파일 머리말 참고. "
            "그림을 바꿀 땐 같은 u/v 범위를 지킨다."
        ),
        "uMin": U_MIN,
        "uMax": U_MAX,
        "textures": tex,
    }
    (OUT / "lashes.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", OUT, [t["file"] for t in tex.values()])


if __name__ == "__main__":
    main()
