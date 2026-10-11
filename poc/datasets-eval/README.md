# poc/datasets-eval — 실사용 데이터셋 검증

`docs/archive/datasets-ranked-v6.md` 의 실측 수치를 만든 스크립트. 문서에 적힌 데이터셋이 **우리 파이프라인에서 실제로 되는지**를 숫자로 확인한다.

## 무엇을 재나

| 이름 | 재는 것 | 답하려는 질문 |
|---|---|---|
| **T1 검출** | MediaPipe Face Landmarker(478점) 검출률, 장당 ms, 홍채 지름 px, 고개 각도(yaw) | 이 데이터셋 사진을 우리 앱이 처리할 수 있나. 홍채 25px 스펙을 만족하나 |
| **T2 정합** | 랜드마크로 그린 부위 다각형(눈썹·눈·입술, `poc/synth/core.py` 방식) vs 사람이 그린 정답 마스크 IoU | 랜드마크만으로 부위 마스크를 만들어도 되나 |
| **T3 모델** | 합성 데이터로만 학습한 TinyUNet(`poc/synth/results/best_noweight.pt`)을 실제 사진에 돌린 IoU, 맨얼굴 오검출 비율 | 합성 학습이 실제 사진에서 어디까지 먹히나 |
| **T4 라벨** | 해상도, 클래스 픽셀 비율, 좌우 규약(화면 기준/사람 기준) | 라벨 자체의 성격 |
| **P1~P4** (`eval_ffhq_makeup.py`) | 맨얼굴·화장 쌍의 ΔE로 만든 임시 정답 대비 모델 정밀도·재현율 | 화장 있는 얼굴에서 모델이 되나 |
| `probe_brow.py` | 눈썹 다각형을 불렸을 때 IoU 변화 | T2 눈썹 0.5 가 두께 문제인가 |
| `probe_iris.py` | 홍채÷눈너비 비율: Periorbital 사람 라벨 vs MediaPipe 홍채 점 | 홍채 11.7mm 를 자로 써도 되나 (Periorbital 은 눈 크롭이라 얼굴 검출이 안 돼 비율로 대조) |

## 실행

```bash
cd poc/datasets-eval
# 데이터셋은 D:/danghaeung-datasets/ 아래에 받아 둔 상태 (docs/archive/datasets-ranked-v6.md 7장 참고)
python eval_real.py --dataset easyportrait --root D:/danghaeung-datasets/EasyPortrait --n 200
python eval_real.py --dataset lapa         --root D:/danghaeung-datasets/LaPa --n 200
python eval_real.py --dataset celebamask   --root D:/danghaeung-datasets/CelebAMask-HQ/CelebAMask-HQ --n 200
python eval_real.py --dataset helen        --root D:/danghaeung-datasets/helen/SmithCVPR2013_dataset_resized --n 200
python eval_real.py --dataset facesynthetics --root D:/danghaeung-datasets/facesynthetics --n 200
python eval_real.py --dataset mt           --root D:/danghaeung-datasets/MT --n 200
python eval_ffhq_makeup.py --root D:/danghaeung-datasets/hf_ffhq_makeup/images --thr 6
python probe_brow.py --dataset helen --root D:/danghaeung-datasets/helen/SmithCVPR2013_dataset_resized --n 100
python summarize.py      # results/*/summary.json → 마크다운 표
```

결과는 `results/<dataset>/` 에 `summary.json`, `per_image.csv`, `montage.png`(사진 | 정답 | 랜드마크 다각형 | 모델 예측).
`--seed 0`, `--n 200` 고정이라 같은 200장이 뽑힌다.

## 주의
- 데이터셋 원본은 저장소에 넣지 않는다 (라이선스·용량). 결과 JSON·몽타주만 커밋.
- 몽타주에는 데이터셋 얼굴이 들어 있다. 비상업 데이터셋(CelebAMask-HQ, LaPa, FFHQ-Makeup, FaceSynthetics)의 몽타주는 **발표 자료에 그대로 쓰지 말 것** — 내부 확인용.
- `mediapipe` 1.0 Tasks API, 모델 파일은 `poc/synth/face_landmarker.task` 를 그대로 쓴다.
