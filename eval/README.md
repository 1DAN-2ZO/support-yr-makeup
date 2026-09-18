# eval/ — 평가 하네스 (ai-pipeline-v6.md 2절)

한 명령으로 전부 다시 잰다. 결과는 `results/`에 CSV, 결과표는 `docs/eval-results-v6.md`에 자동 생성.

```
uv run python eval/run_all.py            # 전부 (골든 세트 없으면 각 단계가 "skipped"로 표시)
uv run python eval/run_all.py --only score
uv run python eval/report.py             # results/*.csv → docs/eval-results-v6.md
```

| 폴더 | 평가 | 언어 | 비고 |
|---|---|---|---|
| `golden/` | 골든 세트 `manifest.json` (사진은 저장소 밖, 경로·해시·person_id·라벨 버전만) | — | 30장 고정, 버전 `golden-vN` |
| `score/` | E-1·E-7 채점 일치율·반복 편차·대칭 보정 방향 | Python이 Node를 부른다 (`score.js`는 폰에서 도는 JS라 그대로 두고 subprocess로 실행) | |
| `faceshape/` | E-2·S-2 규칙 vs 후보 모델 | Python | |
| `transfer/` | E-3·S-1 시간·ArcFace·부위 ΔE | Python (서버 API 호출) | |
| `region/` | E-4·S-3 EasyPortrait·Periorbital IoU | Python | jeakeun `poc/datasets-eval` 이식 |
| `gate/` `live/` `funnel/` | E-5·E-6·E-8 | Python이 Event 로그(JSONL) 집계 | |
| `results/` | `<날짜>_<커밋>_<모델버전>_<골든버전>.csv` | — | 커밋한다 (작음) |

규칙: 골든 세트는 고정, 사람 단위 분할, 결과 파일명에 버전 셋, 손으로 결과표 쓰지 않기.
