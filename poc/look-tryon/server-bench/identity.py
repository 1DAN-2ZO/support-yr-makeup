"""원본 vs 결과 사진의 얼굴 임베딩 코사인 유사도 (벤치 전용).

facenet-pytorch(MIT, VGGFace2 사전학습 InceptionResnetV1)로 상업 사용이 가능하다.
insightface buffalo_l(ArcFace)은 연구용 라이선스라 제품에 못 쓰므로 쓰지 않는다.
따라서 이 값은 "ArcFace 코사인"이 아니라 "FaceNet(VGGFace2) 코사인"이며, 절대값을
다른 임베딩 모델과 직접 비교할 수 없다. 후보 간 상대 비교용이다.
"""

from __future__ import annotations

import torch
from PIL import Image

_models: tuple | None = None


def _load():
    global _models
    if _models is None:
        from facenet_pytorch import InceptionResnetV1, MTCNN

        mtcnn = MTCNN(image_size=160, margin=0, device="cuda")
        resnet = InceptionResnetV1(pretrained="vggface2").eval().to("cuda")
        _models = (mtcnn, resnet)
    return _models


def face_cosine(img_a: Image.Image, img_b: Image.Image) -> float | None:
    """두 이미지의 얼굴 임베딩 코사인 유사도. 얼굴을 못 찾으면 None."""
    mtcnn, resnet = _load()
    face_a = mtcnn(img_a.convert("RGB"))
    face_b = mtcnn(img_b.convert("RGB"))
    if face_a is None or face_b is None:
        return None
    with torch.no_grad():
        emb_a = resnet(face_a.unsqueeze(0).to("cuda"))
        emb_b = resnet(face_b.unsqueeze(0).to("cuda"))
    return torch.nn.functional.cosine_similarity(emb_a, emb_b).item()
