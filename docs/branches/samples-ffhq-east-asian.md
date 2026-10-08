# `samples/ffhq-east-asian` 브랜치

FFHQ-Makeup 동양인 맨얼굴 샘플 — 목록과 꺼내는 스크립트 (사진은 저장소 밖).

- 날짜: 2026-09-30
- PR: 1개 (병합 1) — #254
- 지금: main 에 다 들어감
- 트러블슈팅 기록: 1건

[← 브랜치 목록](README.md)

## PR 기록

<a id="pr-254"></a>

### #254 [eval] FFHQ-Makeup 동양인 맨얼굴 샘플 — 목록과 꺼내는 스크립트 (사진은 저장소 밖)
- 브랜치: `samples/ffhq-east-asian` · 병합 2026-09-30 · +487 −0
- 한 일: 채점·측정을 합성 얼굴(`client/tests/helpers/synth-face.ts`)로만 시험하던 것을 보완하려고, 공개 데이터셋 FFHQ-Makeup 맨얼굴에서 동양인 사진 목록과 꺼내는 스크립트를 넣었다. `eval/samples/ffhq_east_asian.csv` 는 240장 목록(sel30 = 눈으로 고른 30장, pool = 안 본 210장)이다. `ffhq_east_asian.py` 는 zip 받기(이어 받기) · 목록 사진만 꺼내기(sha256 대조, 다르면 멈춤) · 얼굴 점 478개 · 골든 세트 자리로 복사를 한다. 사진은 저장소에 없고 각자 `$DHE_DATA_DIR` 로 꺼낸다.
- 결과: `eval/samples/test_ffhq_east_asian.py` — 가짜 zip 으로 목록 형식 · sha256 대조 · 골든 자리 배치를 시험한다. 통과 수는 본문에 없음. 앱 코드 변경 없음.
- 트러블슈팅:
  - (리뷰 지적) `--golden` 이 FFHQ 맨얼굴을 골든 세트 자리(`golden/raw/eaNN/bare.jpg`)에 넣는데, 골든 세트는 동의 받은 팀원 사진 자리이고 `build.py` 는 화장 사진이 없는 사람을 시험지에 안 넣어서 맨얼굴만으로는 효과가 없다 → 이 PR 에서는 고치지 않았다(병합을 막지 않는 후속).
- 남긴 것: 위 `--golden` 은 따로 된 폴더로 옮기거나 맨얼굴 오채점 시험을 `build.py` 가 지원할 때 다시 본다. 라이선스는 CC BY-NC-SA 4.0 이라 비상업 · 평가·참고만, 학습에는 안 쓴다. 합성 이미지라 실제 폰 촬영과 다르다. `vlm-eval` 브랜치(VLM 선정 실험)는 실험이 끝난 뒤 따로 올린다.
