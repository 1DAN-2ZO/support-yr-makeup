"""지시문과 경로 — embed.py(해석해서 저장)와 server.py(저장한 것을 읽음)가 같이 쓴다."""

import os
from pathlib import Path

_HERE = Path(__file__).resolve().parent
# 모델과, 해석해 둔 지시문을 두는 자리. PC 마다 다르니 환경 변수로 바꾼다.
# 기본은 이 폴더 아래(models/ · embeds/) — 둘 다 .gitignore 라 저장소에는 안 들어간다
MODEL_DIR = os.environ.get("LOOK_GEN_MODEL_DIR", str(_HERE / "models" / "FLUX.2-klein-4B")).replace("\\", "/")
EMBEDS_DIR = os.environ.get("LOOK_GEN_EMBEDS_DIR", str(_HERE / "embeds")).replace("\\", "/")

# image 1 = 내 얼굴, image 2 = 화장 사진. 이름을 붙여 여러 개를 견줘 본다 — 서버가 쓰는 것은 DEFAULT
PROMPTS = {
    # 처음 것 — 화장 종류를 하나하나 적었더니 화장 사진과 상관없이 분홍 섀도·날개 라이너를 그렸다 (2026-10-06).
    # 대신 블러셔는 이것이 가장 진하게 옮긴다 (볼의 붉어진 정도 13 ~ 17, short 는 3 안팎)
    "list": (
        "Apply the makeup from image 2 onto the person in image 1: the same eyeshadow colors and placement, eyeliner, "
        "mascara, blush and lip color as image 2. Keep everything else in image 1 exactly unchanged: the same person and "
        "identity, face shape, eye shape, nose, mouth shape, eyebrows shape, skin tone, hair, expression, head pose, "
        "clothing, lighting, camera framing and background. Do not copy the face, hair or accessories from image 2."
    ),
    "exact": (
        "Makeup transfer. Image 1 is the target person with a bare face. Image 2 is the makeup reference. Recreate the "
        "makeup of image 2 on the face in image 1 using exactly the same colors as image 2: match its eyeshadow color, "
        "its lip color and its cheek color precisely. Do not add any makeup that is not visible in image 2. The person, "
        "face shape, eyes, hair, expression, background and lighting of image 1 stay identical."
    ),
    "short": "The person in image 1 wearing the exact same makeup as the person in image 2. Same face, hair, pose, clothing and background as image 1.",
    "copy": "Copy the makeup look from image 2 onto the face in image 1. Keep the identity and everything else from image 1.",
}
# short: 화장 사진을 얼굴만 남겨 보낼 때 색이 가장 비슷하게 나왔다 (샘플 4쌍 눈으로 확인, 2026-10-06)
DEFAULT = "short"


def embeds_file(name: str = DEFAULT) -> str:
    return f"{EMBEDS_DIR}/{name}.pt"
