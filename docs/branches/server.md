# `server` 브랜치

화장 대표 이미지에서 부위별 색·진하기 뽑는 함수 look_values_from_arrays (#121 1번).

- 날짜: 2026-09-30
- PR: 1개 (병합 1) — #229
- 지금: main 에 다 들어감
- 트러블슈팅 기록: 1건

[← 브랜치 목록](README.md)

## PR 기록

<a id="pr-229"></a>

### #229 [server] 화장 대표 이미지에서 부위별 색·진하기 뽑는 함수 look_values_from_arrays (#121 1번)
- 브랜치: `server` · 병합 2026-09-30 · +214 −11
- 한 일: 서버 담당(④)의 커밋 `cfb2c94` 가 병합된 #221 뒤 같은 브랜치에 올라와서 앱 통합 담당이 PR 로 열었다. `server/app/layer.py` 의 `look_values_from_arrays()` 가 맨얼굴·화장 사진 배열에서 부위 마스크별 편향 보정 ΔLab·ΔE 중앙값을 구해 `rules/looks.json` 의 `parts` 모양(brow alpha · shadow/cheek alphaL/alphaR+color · lip)으로 돌려준다.
- 결과: 시험 `server/tests/test_look_values.py` 10개(합성 배열).
- 트러블슈팅:
  - 라이너 값은 뽑지 못한다(None) → `regions.py` 에 라이너 마스크가 없어서이고 두께도 잴 수 없다 → 풀지 않았다. 따로 필요하다고 적었다.
- 남긴 것: 사진 → JSON 스크립트(#121 2번)는 대표 이미지(#77)가 먼저라 아직 안 했다.
