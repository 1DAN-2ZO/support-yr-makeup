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
            left.append(self.keep_side(x + nx * hw, y - ny * hw, sign))
            right.append(self.keep_side(x - nx * hw, y + ny * hw, sign))
        self.add(left + right[::-1], alpha)

    def keep_side(self, x: float, y: float, sign: int) -> tuple[float, float]:
        """가닥이 뿌리 선(v=0) 반대편으로 삐져나오지 않게 한다.
        기울어진 굵은 가닥의 뭉툭한 밑면이 눈 쪽으로 튀어나왔다."""
        root = self.v_max * PPU * SS
        return (x, min(y, root + 0.5 * SS)) if sign > 0 else (x, max(y, root - 0.5 * SS))

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


# ── 디자인 v2 (2026-09-30) ──
# 참고: 사용자 제공 "Anime Extensions — Round Design + Under Lash" 사진 2장, IMG_2509
# 뭉친 스파이크(뿌리는 벌어지고 끝은 한 점으로 모이는 가닥 묶음) + 사이사이 가는 잔털.
# 윗속눈썹: 가운데(동공 위)가 가장 길고 곧게 서며, 눈꼬리 쪽 1/3 은 긴 스파이크가 촘촘하게 바깥으로 쓸린다.
#           눈 앞머리는 안쪽으로 휘는 짧은 스파이크 하나.
# 아랫속눈썹: 고르게 떨어진 작은 스파이크 + 가는 잔털.
# (u, 길이, 기울기°, 끝 휨°, 가닥 수, 뿌리 폭) — 길이·폭은 눈 폭 단위, 기울기는 바깥(+u) 쪽이 +
# v3 (2026-09-30 피드백: "너무 길다, 더 덩어리지게") — 길이 약 70%, 뭉치당 가닥 +2, 뿌리 폭은 좁게
UPPER_SPIKES = [
    (0.09, 0.11, -38, -28, 5, 0.03),
    (0.21, 0.18, -14, -10, 6, 0.035),
    (0.34, 0.16, -5, -4, 5, 0.03),
    (0.48, 0.28, 1, 0, 8, 0.04),
    (0.60, 0.19, 16, 6, 6, 0.035),
    (0.71, 0.24, 30, 10, 7, 0.04),
    (0.80, 0.25, 44, 12, 7, 0.04),
    (0.88, 0.23, 57, 12, 7, 0.035),
    (0.96, 0.19, 70, 10, 6, 0.03),
]
LOWER_SPIKES = [
    (u, 0.07 + 0.04 * u, -12 + 45 * u, 4, 4, 0.018) for u in (0.2, 0.32, 0.44, 0.56, 0.68, 0.79, 0.9)
]


def spike(
    cv: Canvas,
    rnd: random.Random,
    u: float,
    length: float,
    theta: float,
    curl: float,
    k: int,
    spread: float,
    *,
    sign: int,
    w0: float,
    alpha: float,
) -> None:
    """뿌리를 spread 만큼 벌려 k 가닥을 놓고, 끝을 한 점으로 모은다 — 애니 속눈썹의 뾰족한 뭉치."""
    r = math.radians(theta + curl * 0.6)
    tip = (u + math.sin(r) * length, sign * math.cos(r) * length)
    for i in range(k):
        f = i / (k - 1) - 0.5 if k > 1 else 0.0
        cv.strand(
            u + f * spread * 1.1,
            theta + rnd.uniform(-3, 3),
            length * rnd.uniform(0.96, 1.02),
            curl,
            w0 * rnd.uniform(0.85, 1.15) * (1.2 - abs(f) * 0.6),  # 가운데 가닥이 굵다
            alpha * rnd.uniform(0.92, 1.0),
            (tip[0] + rnd.uniform(-0.004, 0.004), tip[1]),
            0.9,
            sign,
        )
    # 가운데 굵은 심 — 참고 사진의 뭉치는 끝까지 한 덩어리로 진하고, 양옆에만 낱가닥이 벌어진다
    cv.strand(u, theta, length * 0.98, curl, w0 * (2.8 + 0.35 * k), alpha, tip, 1.0, sign)


def wisps(
    cv: Canvas,
    rnd: random.Random,
    n: int,
    *,
    sign: int,
    len_fn,
    theta_fn,
    curl: float,
    w0: float,
    alpha: tuple[float, float],
    u_range: tuple[float, float] = (0.03, 1.0),
) -> None:
    """스파이크 사이 잔털. 낱가닥이 아니라 3가닥씩 끝을 모은 작은 뭉치로 — 마스카라 바른 덩어리 느낌.
    눈꼬리 쪽이 더 촘촘하다 (u 를 치우친 분포로 뽑는다). n = 가닥 수."""
    for _ in range(max(1, n // 3)):
        u = lerp(u_range[0], u_range[1], rnd.random() ** 0.8)
        th, length, cu = (
            theta_fn(u) + rnd.uniform(-6, 6),
            len_fn(u) * rnd.uniform(0.75, 1.1),
            curl * rnd.uniform(0.6, 1.2),
        )
        r = math.radians(th + cu * 0.6)
        tip = (u + math.sin(r) * length, sign * math.cos(r) * length)
        a = rnd.uniform(*alpha)
        for f in (-1, 0, 1):
            cv.strand(u + f * 0.004, th, length, cu, w0 * (1.6 if f == 0 else 1.0), a, tip, 0.8, sign)


def upper_tex(
    name: str, v_min: float, v_max: float, *, sign: int, scale: float, fan: float, seed: int, wisp_n: int
) -> dict:
    """윗속눈썹 한 장. scale = 길이 배율(정면에서 짧아 보이는 정도),
    fan = 바깥 쪽으로 더 눕히는 각(°, 눈꼬리일수록 크게)."""
    rnd = random.Random(seed)
    cv = Canvas(v_min, v_max)
    cv.root_band(0.02, 1.0, 0.012, 0.85, sign=-sign)
    fan_at = lambda u: fan * max(0.0, u - 0.3) / 0.7  # noqa: E731
    wisps(
        cv,
        rnd,
        wisp_n,
        sign=sign,
        curl=10,
        w0=0.0026,
        alpha=(0.7, 0.92),
        len_fn=lambda u: scale * (0.07 + 0.1 * smooth(0.0, 0.9, u)),
        theta_fn=lambda u: lerp(-10, 62, u**1.25) + fan_at(u),
    )
    for u, length, theta, curl, k, spread in UPPER_SPIKES:
        spike(
            cv, rnd, u, length * scale, theta + fan_at(u), curl, k, spread, sign=sign, w0=0.0036, alpha=0.95
        )
    cv.save(name)
    return {"file": name, "vMin": v_min, "vMax": v_max}


def lower_tex(name: str, v_min: float, v_max: float, *, seed: int) -> dict:
    rnd = random.Random(seed)
    cv = Canvas(v_min, v_max)
    wisps(
        cv,
        rnd,
        26,
        sign=1,
        curl=3,
        w0=0.002,
        alpha=(0.4, 0.65),
        u_range=(0.12, 0.97),
        len_fn=lambda u: 0.04 + 0.03 * u,
        theta_fn=lambda u: lerp(-15, 40, u),
    )
    for u, length, theta, curl, k, spread in LOWER_SPIKES:
        spike(cv, rnd, u, length, theta, curl, k, spread, sign=1, w0=0.0019, alpha=0.9)
    cv.save(name)
    return {"file": name, "vMin": v_min, "vMax": v_max}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    tex = {
        # 눈 뜸: 위로 선다 (참고 사진 그대로)
        "up": upper_tex("upper-up.png", -0.05, 0.36, sign=1, scale=1.0, fan=0, seed=21, wisp_n=120),
        # 반쯤 감음: 카메라 쪽을 향해 짧아 보이고, 눈꼬리 쪽이 옆으로 더 눕는다
        "mid": upper_tex("upper-mid.png", -0.16, 0.2, sign=1, scale=0.5, fan=35, seed=22, wisp_n=100),
        # 눈 감음: 같은 스파이크가 아래로 늘어진다 (IMG_2509 — 촘촘하게, 정면에서 안 줄어든 길이)
        "down": upper_tex("upper-down.png", -0.4, 0.05, sign=-1, scale=1.05, fan=0, seed=23, wisp_n=140),
        # 아랫속눈썹: 고르게 떨어진 작은 스파이크. 눈 감음 때는 그리지 않는다
        "lower": lower_tex("lower.png", -0.04, 0.2, seed=24),
    }
    meta = {
        "version": 2,
        "design": "anime-spike",
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
