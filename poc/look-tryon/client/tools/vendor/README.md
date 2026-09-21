# 출처 (둘 다 Apache-2.0)

- `canonical_face_model.obj` — MediaPipe 공식 정준 얼굴 모델(468점, UV 좌표 포함).
  https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
  → UV 좌표(`vt`) 추출에 사용. 이 obj 자체의 `f`(삼각형) 레코드는 쓰지 않음(898개, 아래 TFJS 쪽을 대신 씀).

- `tfjs_triangulation.js` — TensorFlow.js `facemesh` 데모의 삼각분할 테이블(880개 삼각형/2640 인덱스).
  https://github.com/tensorflow/tfjs-models/blob/facemesh-v0.0.5/facemesh/demo/triangulation.js
  (`face-landmarks-detection`로 이름이 바뀌기 전의 마지막 `facemesh` 태그. 현재 저장소엔 이 파일이 없어져서
  옛 태그에서 가져옴 — 랜드마크 인덱스 범위 0~467로 지금 쓰는 MediaPipe FaceLandmarker 468점과 호환 확인함.)

`tools/extract-face-uv.js`가 이 두 파일을 읽어서 `assets/face-uv.json` · `assets/face-triangles.json`을 만든다.
