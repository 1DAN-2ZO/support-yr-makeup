"""reference/eyelash/{style}/front/{1,2,3}.png -> client/public/lashes/{style}/*.png + lashes.json

마스카라 natural/deep 텍스처 — 실사 참고 사진(reference/eyelash) 기반. 사람이 고른 실제 속눈썹 사진을
눈꺼풀 좌표계(core/lash.ts)에 맞춰 자른다. 절차적 생성(anime-spike)은 더 안 쓴다 — 전부 지웠다(2026-10-01).

front 각도만 다룬다(눈뜸 3단계: 1=up·2=mid·3=down) — 15/45도는 별도 논의(2026-09-30).

좌표 추정 방법:
 - u(가로): 알파 경계 상자로 꽉 크롭하므로 크롭 자체가 곧 u=0..1 (uMin=0, uMax=1 고정)
 - v(세로): "뿌리(눈꺼풀 부착선)"를 알파 밀도 최댓값이 아니라 **누적 질량 기준**으로 잡는다 —
   up·mid 는 전체 알파의 ROOT_MASS(85%)가 뿌리보다 끝(tip) 쪽에 있게, down 은 반대로(15%만 끝 쪽에)
   뿌리를 거의 맨 위로 민다. (처음에 밀도 최댓값 행을 썼더니 up 끝 쪽 질량이 55~62%뿐이라 실측
   anime-spike 기준인 80%에 못 미쳤다 — client/tests/lash.test.ts "up 은 뿌리 선 위에 가닥이 몰려
   있다" 가 잡아냄, 2026-10-01)
 - down(감김)은 전체가 크게 휜 사진이라 뿌리 추정이 거칠어서 — 폭이 너무 크게(0.6 초과) 벌어지지
   않도록 안전하게 묶어 둔다
 - 전부 실기기로 보면서 다시 맞출 값 — 1차 추정치다(실측 전)

아랫속눈썹(lower)은 참고 사진이 없다 — client/public/lashes/{style}/lower.png·lashes.json의 lower
항목은 이 스크립트가 안 건드리는 수동 자산이다(이미 있으면 그대로 둔다). 사진이 생기면 이 스크립트에
같은 방식으로 추가한다.
"""

import json

import numpy as np
from PIL import Image

SRC = "reference/eyelash"
OUT = "client/public/lashes"
STAGE_TO_STATE = {1: "up", 2: "mid", 3: "down"}
PAD = 6  # 크롭 뒤 안전 여백(px)
V_TIP = {"natural": 0.34, "deep": 0.40}  # up 상태 기준 바깥쪽(눈썹 쪽) 끝 v — 눈대중 시작값
# 뿌리(v=0) 행 = 끝(tip, y=0) 쪽 누적 알파 질량이 이 비율에 도달하는 행. up·mid 는 끝 쪽에 질량이
# 몰려야(뿌리가 아래쪽) 하고 down 은 반대(뿌리가 위쪽) — client/tests/lash.test.ts 의 80%/20% 기준에 여유를 둔 값
ROOT_MASS = {"up": 0.85, "mid": 0.85, "down": 0.15}


def alpha_bbox(a: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(a > 10)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def root_row_at_mass(row_sum: np.ndarray, target: float) -> int:
    """끝(y=0) 쪽부터 누적한 알파 질량이 전체의 target 비율에 처음 도달하는 행."""
    cum = np.cumsum(row_sum)
    total = cum[-1] or 1
    idx = np.searchsorted(cum, target * total)
    return int(min(idx, len(row_sum) - 1))


def main() -> None:
    for style in ["natural", "deep"]:
        lower = json.load(open(f"{OUT}/{style}/lashes.json", encoding="utf-8"))["textures"]["lower"]
        textures = {}
        for stage, state in STAGE_TO_STATE.items():
            im = Image.open(f"{SRC}/{style}/front/{stage}.png").convert("RGBA")
            a = np.array(im)[:, :, 3].astype(np.float64)
            h, w = a.shape
            x0, y0, x1, y1 = alpha_bbox(a)
            cx0, cy0 = max(0, x0 - PAD), max(0, y0 - PAD)
            cx1, cy1 = min(w, x1 + PAD + 1), min(h, y1 + PAD + 1)
            crop = im.crop((cx0, cy0, cx1, cy1))
            ch = cy1 - cy0

            # root(부착선) 행 — 크롭 좌표계에서 누적 질량 기준으로 다시 잰다(위 ROOT_MASS 설명)
            ca = np.array(crop)[:, :, 3].astype(np.float64)
            root_row = root_row_at_mass(ca.sum(axis=1), ROOT_MASS[state])
            tip_row = 0  # 크롭을 bbox+PAD로 했으니 맨 위가 거의 끝(tip)

            # v(y) = vMax - (y/ch)*(vMax-vMin), v(root_row)=0, v(tip_row)=V_TIP
            # 폭(k)을 먼저 안전 상한(0.6)으로 묶은 뒤 vMax/vMin을 구한다 — 나중에 vMin만 자르면
            # v(root_row)=0 이 깨진다(뿌리가 실제 root_row 자리에서 어긋남, 2026-10-01에 이렇게 해서 깨졌었다)
            k = min(V_TIP[style] * ch / max(1, (root_row - tip_row)), 0.6)
            vMax = (root_row / ch) * k
            vMin = vMax - k

            fname = f"upper-{state}.png"
            crop.save(f"{OUT}/{style}/{fname}")
            textures[state] = {"file": fname, "vMin": round(vMin, 4), "vMax": round(vMax, 4)}
            print(f"{style}/{state}: crop={cx1 - cx0}x{ch} root_row={root_row} vMin={vMin:.4f} vMax={vMax:.4f}")

        textures["lower"] = lower  # 아랫속눈썹 — 참고 사진 없음, lower.png·메타는 이 스크립트가 안 건드린다(위 설명)

        meta = {
            "version": 1,
            "design": f"photo-{style}",
            "note": (
                f"reference/eyelash/{style}/front 참고 사진 기반. lower는 참고 사진이 없어 수동 자산(임시)."
                " scripts/gen_photo_lash.py가 만든다. 숫자는 1차 추정치 — 실기기로 다시 맞춘다."
            ),
            "uMin": 0,
            "uMax": 1,
            "textures": textures,
        }
        with open(f"{OUT}/{style}/lashes.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
