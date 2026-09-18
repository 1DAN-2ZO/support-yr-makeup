# FFHQ-Makeup × 팀 채점기

공개 데이터셋 FFHQ-Makeup의 맨얼굴·화장 쌍을 팀 채점기(`poc/full/lib/score.js`)에 그대로 넣어 보는 실험.
계획과 결과는 `docs/eval-public-dataset-plan-v1.md`.

## 준비

1. 데이터 받기 (저장소 밖에 둔다. 비상업 라이선스라 평가 용도로만)
   ```bash
   hf download cyberagent/FFHQ-Makeup --repo-type dataset --include "images/*" --local-dir ~/dhe-data/ffhq-makeup
   ```
2. 이미지 폴더를 `eval/ffhq/data`로 연결하고 git에서 빼기
   ```bash
   ln -s ~/dhe-data/ffhq-makeup/images eval/ffhq/data
   echo "eval/ffhq/data" >> .git/info/exclude
   ```

## 실행

```bash
python -m http.server 8841          # 저장소 루트에서
# 브라우저: http://localhost:8841/eval/ffhq/harness.html
```

- 결과는 브라우저 콘솔의 `window.RESULTS` (부위별 status·score·codes·metrics).
- 창이 숨겨져 있으면 모델 계산이 멈춘다. 화면에 띄워 두고 돌리거나, 헤드리스 크롬을 개발자 도구 프로토콜로 제어해 `window.RESULTS`를 받는다(`?delegate=CPU`).
- `app.js`의 기준 생성 → 정합 → `scorePart` 흐름을 같은 함수로 따라 한다. 채점기를 고치면 이 페이지를 다시 돌려 비교한다.
