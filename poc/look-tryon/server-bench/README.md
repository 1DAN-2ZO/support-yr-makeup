# 서버 화장 전이 벤치마크 (diffusion, RTX 3060)

화면 2("룩 얹어보기")의 수용 기준 "룩당 서버 생성 3초 이내"가 diffusion 기반 makeup transfer로 현실적인지 실측했다.

**환경:** RTX 3060 12GB, 드라이버 560.94 (CUDA 12.6), Windows, conda(miniforge3). 해상도는 각 모델의 기본 학습 해상도 그대로(Stable-Makeup 512×512, SHMT 256×256) — 다운스케일 최적화는 하지 않았다.

## 후보

| 후보 | 라이선스 | 유지보수 | 스택 |
|---|---|---|---|
| [Stable-Makeup](https://github.com/Xiaojiu-z/Stable-Makeup) (SIGGRAPH 2025) | Apache-2.0 (상업 가능) | 활성 (231★) | SD1.5 diffusers + ControlNet 2개 + SPIGA/facelib 랜드마크 |
| [SHMT](https://github.com/Snowfallingplum/SHMT) (NeurIPS 2024) | **CC BY-NC-SA (비상업)** | 활성 (209★, "재검증 완료") | 2021년식 CompVis LDM 코드베이스 (VQ-f4 오토인코더 + latent diffusion) |

**SHMT는 비상업 라이선스라 실제 당화응 서비스에는 쓸 수 없다.** 이번 라운드는 사용자 요청에 따라 "diffusion 계열이 이 GPU에서 3초를 낼 수 있는가"를 보기 위한 기술 검증 목적으로만 실측했고, 결과가 좋아도 이 모델 자체를 제품에 넣을 수는 없다 — 상업 가능한 대체 diffusion 후보를 찾을 때 "이 정도 아키텍처 규모라면 3초가 가능하다"는 참고선으로만 쓴다.

## 실측 결과

5회 반복 평균(모델은 이미 GPU에 로드된 상태 — 웜 서버 프로세스 가정). 로드 시간은 별도(1회성 비용, 서버 기동 시에만 발생).

| 후보 | 설정 | 추론 시간(평균) | VRAM 피크 | 로드 시간 |
|---|---|---:|---:|---:|
| Stable-Makeup | fp32, 30 step (기본값) | **21.8s** | 9.75GB | 40.1s |
| Stable-Makeup | fp16, 30 step | **9.0s** | 5.29GB | 17.5s |
| Stable-Makeup | fp16, 15 step | **4.6s** | 5.29GB | 17.5s |
| Stable-Makeup | fp16, 10 step | **3.15s** | 5.29GB | 17.6s |
| Stable-Makeup | fp16, 8 step | **2.55s** | 5.29GB | 17.6s |
| SHMT-h0 | 50 step (기본값) | **3.40s** | 4.47GB | 5.5s |
| SHMT-h4(model2, 추천) | 50 step (기본값) | **3.49s** | 7.52GB | 10.7s |
| SHMT-h4(model2, 추천) | 25 step | **1.78s** | 7.40GB | 10.9s |

원본 CSV: [`results/results.csv`](results/results.csv) (5회 개별 런 모두 기록).

### 정체성 유지 / 화장 반영 정도 (육안 평가)

샘플 이미지: [`results/`](results/) (`*_source.jpg`, `*_reference.jpg`, `*_sample.jpg`).

- **Stable-Makeup**: 저장소 번들 샘플(인물 사진 + 조커 페이스페인팅 참조)로 테스트. fp32와 fp16+8step 결과가 육안상 거의 구분 안 될 만큼 동일 — 헤어스타일·얼굴형·표정 등 정체성이 원본과 그대로 유지되고, 극단적인 페이스페인팅 스타일도 색상·형태가 정확히 전이됨. step을 8까지 줄여도 눈에 띄는 품질 저하는 없었다(다만 매우 heavy한 이 예시 하나만으로 일반화하기는 이름).
- **SHMT**: 저장소 번들 샘플(여성 인물 + 블루 아이섀도우·레드 립 참조)로 테스트. h0/h4 모두 정체성이 잘 유지되고, 아이섀도우 색상·립 컬러가 자연스럽게 전이됨. h4(recommended)가 h0보다 경계 블렌딩이 약간 더 매끄러움. 256×256 해상도라 Stable-Makeup(512×512)보다 디테일은 떨어짐 — 실제 서비스에 쓰려면 업스케일 단계가 별도로 필요.
- 정량적 얼굴 임베딩 코사인 유사도는 아래 "선정 표"에 있다(FaceNet/VGGFace2, ArcFace 아님).

## 선정 표 (S-1 확정, #47 #52)

같은 입력(저장소 번들 샘플 1쌍)·같은 머신(RTX 3060)·5회 반복 평균. "정체성 코사인"은 **원본 사진 vs 결과 사진**의 얼굴 임베딩 코사인(`identity.py`, facenet-pytorch MIT + VGGFace2 사전학습 InceptionResnetV1). 상업 라이선스 문제로 insightface(ArcFace buffalo_l, 연구용)를 쓰지 않았으므로 "ArcFace 코사인"이 아니라 FaceNet 코사인이다 — 절대값이 아니라 후보 간 상대 비교용. 코사인은 **변형당 1회(시드 미고정) 측정**이라 잡음이 있다(예: 8 step 0.671 vs 10 step 0.605 차이가 실제 품질 차이인지 표본 잡음인지 이 데이터로는 구분 못 함).

| 후보 | 설정 | 라이선스 | 추론(평균) | 3초 안? | VRAM | 정체성 코사인 | 판정 |
|---|---|---|---:|:---:|---:|---:|---|
| Stable-Makeup | fp16, DDIM 8 step, g=1.6 | Apache-2.0 | 2.55s | O | 5.29GB | **0.671** | **선정** |
| Stable-Makeup | fp16, DDIM 10 step, g=1.6 | Apache-2.0 | 3.15s | X (3.15s) | 5.29GB | 0.605 | 예산 초과(기존 Task 1 기본값) |
| Stable-Makeup | fp16, DDIM 15 step, g=1.6 | Apache-2.0 | 4.60s | X | 5.29GB | 0.640 | 예산 초과 |
| Stable-Makeup + LCM-LoRA | fp16, LCM 4 step, g=1.5 | Apache-2.0 + OpenRAIL++(LoRA) | 1.67s | O | 5.55GB | 0.594 | 후보, 코사인 낮음 |
| Stable-Makeup + LCM-LoRA | fp16, LCM 4 step, g=2.0 | 동일 | 1.66s | O | 5.55GB | 0.551 | 후보, 코사인 가장 낮음 |
| Stable-Makeup + LCM-LoRA | fp16, LCM 8 step, g=1.5 | 동일 | 3.10s | X (3.10s) | 5.55GB | 0.651 | 예산 초과 |
| SHMT h4 | 25 step | CC BY-NC-SA | 1.78s | O | 7.40GB | 미측정 (shmt env에 facenet-pytorch 미설치) | 제외: 비상업 |
| EleGANt | - | CC BY-NC-SA 4.0 (LICENSE 확인) | 미측정 | - | - | - | 제외: 비상업 |
| SSAT | - | CC BY-NC-SA 4.0 (LICENSE.txt 확인) | 미측정 | - | - | - | 제외: 비상업 |
| BeautyREC | - | "non-commercial purpose"만 허용하는 BSD 변형 (License 확인) | 미측정 | - | - | - | 제외: 비상업 |

- LCM-LoRA는 `latent-consistency/lcm-lora-sdv1-5` + `LCMScheduler`를 벤더링 diffusers 0.23.1에 그대로 적용해 동작했다(`peft==0.6.2` 필요 — 벤더링 코드가 `peft<=0.6.2`를 요구). **guidance=1.0은 사용 불가**: CFG가 꺼지면 Stable-Makeup의 커스텀 attention이 배치 2배를 전제해서 `RuntimeError: The size of tensor a (2048) must match the size of tensor b (4096)`로 죽는다. 그래서 g=1.5, 2.0만 측정. LCM-LoRA 라이선스(OpenRAIL++)의 상업 사용 조건은 별도 법무 확인 필요(본 벤치에서는 검토하지 않음).
- 이번 실행에서 같은 설정을 반복 측정한 행이 있다(예: fp16_10steps, fp16_8steps, fp16_15steps는 CSV에 이전 라운드 행과 이번 재측정 행이 함께 있음). 위 표의 시간은 해당 변형의 모든 infer 행 평균이며 코사인은 이번 재측정 1회 값이다.
- 경량 GAN 3종은 라이선스 확인이 이슈 본문에서 "먼저"였고 전부 비상업이라 가중치를 받거나 실측하지 않았다.

### 선정 결과

**Stable-Makeup fp16 + DDIM 8 step + guidance 1.6** (추론 2.55s, VRAM 5.29GB, 코사인 0.671).

근거: (1) 3초 예산 안에서 유일한 Apache-2.0 후보 중 코사인이 가장 높음. LCM-LoRA 4 step은 더 빠르지만(1.67s) 코사인이 0.55~0.59로 낮고, 8 step은 3.10s로 예산을 넘는다. (2) 육안 평가(색 전이만 본 주관 판단): 8/10 step DDIM과 LCM 4/8 step 모두 파랑 눈썹 색·빨간 코·입술 색이 잘 옮겨졌고 얼굴형·머리·옷 등 정체성 유지도 비슷하다. LCM 쪽이 약간 더 대비가 강하고 질감이 거칠다. 색 반영 면에서 결정적 차이는 없었다. (3) 기존 Task 1 기본값 10 step은 실측 3.15s로 3초를 넘어서, `server/app/config.py`의 `transfer_steps` 기본값을 10 → 8로 바꿨다(guidance 1.6 유지). `model_server.py`의 요청 기본 steps도 8로 맞췄다.

한계: 입력이 조커 페이스페인팅이라는 극단적 예시 1쌍뿐이고 코사인은 1회 측정이다. 자연스러운 데일리 메이크업 룩으로 여러 장 재측정해야 8 step vs 10 step vs LCM 4 step 우열을 신뢰할 수 있다.

## 결론

**두 후보 모두 최적화 없이는 3초를 넘기지만, 간단한 최적화만으로 3초 안쪽에 들어온다.**

- Stable-Makeup(기본 fp32/30step)은 21.8초로 목표의 7배, fp16으로 바꿔도 9초로 여전히 5초 여유 기준도 못 맞춘다. 하지만 fp16 + step을 30→10으로 줄이면 3.15초로 3초를 살짝 넘고, 8step이면 2.55초로 목표 안에 든다. Apache-2.0이라 상업 사용에는 문제 없음.
- SHMT는 **기본 설정(50 step)만으로 이미 3.4~3.5초**로 거의 목표치이고, step을 25로 줄이면 1.8초까지 내려간다. 다만 CC BY-NC-SA라 이 모델 자체는 제품에 못 쓴다 — "이 규모의 latent diffusion + 256×256 해상도라면 3060에서 3초는 충분히 가능하다"는 기술적 참고 데이터로만 활용.
- **가장 3초 목표에 가까운 실사용 가능 후보는 Stable-Makeup(fp16 + 8 step)**. VRAM도 5.3GB로 3060 한도 안에서 여유 있음.

### 최적화 방향 메모 (다음 라운드 참고)

1. **fp16/bf16 추론**: Stable-Makeup에서 가장 큰 효과(21.8s → 9.0s, 약 2.4배). 필수로 적용.
2. **DDIM step 축소**: 30→8~10 step으로 추가 3~4배. 이번 벤치마크에서는 heavy makeup 예시 1장 기준 품질 저하가 육안상 크지 않았지만, 다양한 룩(특히 미세한 톤 변화 위주의 자연스러운 화장)으로 더 검증 필요 — 너무 줄이면 아티팩트 가능.
3. **few-step 샘플러 / LCM-LoRA**: 시도함(선정 표 참조). 4 step 1.67s로 가장 빠르지만 정체성 코사인이 DDIM 8 step보다 낮아 채택하지 않음. DPM-Solver++는 시도하지 않음.
4. **해상도 축소**: 시도하지 않음(두 모델 다 기본 해상도로만 테스트). SHMT는 이미 256×256이라 축소 여지가 적고, Stable-Makeup은 512×512→384 등으로 추가 단축 가능성 있으나 fp16+step 축소만으로 이미 목표 달성해서 우선순위 낮음.
5. **랜드마크/얼굴구조 추출(SPIGA) 캐싱**: Stable-Makeup은 사용자 사진마다 SPIGA 랜드마크 검출을 1회 수행하는데(위 타이밍에는 포함 안 됨, 모델 로드 후 얼굴 구조 이미지 1회 생성은 벤치마크 루프 밖에서 계산), 같은 사용자 사진에 여러 룩을 얹을 때는 이 결과를 재사용하면 룩당 비용을 더 줄일 수 있음(화면 1→2 흐름에서 실제로 유효한 최적화).

## 재현 방법

각 후보는 서로 호환되지 않는 의존성 스택이라 별도 conda 환경이 필요하다. 저장소 코드/가중치는 `.gitignore`에 등록돼 있어 커밋되지 않는다 — 아래 절차로 로컬에 새로 받아야 한다.

### Stable-Makeup

```bash
conda create -n makeup-bench-sm python=3.10
conda activate makeup-bench-sm
git clone https://github.com/Xiaojiu-z/Stable-Makeup.git stable_makeup
cd stable_makeup
pip install torch==2.0.1 torchvision==0.15.2 --index-url https://download.pytorch.org/whl/cu118
pip install "transformers==4.34.0" "huggingface_hub>=0.16.4,<0.18" accelerate==0.24.1 opencv-python safetensors "setuptools<81"
pip install spiga
pip install git+https://github.com/sajjjadayobi/FaceLib.git
```

받아야 할 가중치:
- SD1.5 diffusers 스냅샷: `huggingface_hub.snapshot_download("stable-diffusion-v1-5/stable-diffusion-v1-5", allow_patterns=["*.json","*.txt","**/*.safetensors","tokenizer/*"])` (runwayml 원본 저장소는 내려감 — 이 미러 사용)
- Stable-Makeup 커스텀 가중치 3개(`pytorch_model*.bin`): [Google Drive](https://drive.google.com/drive/folders/1397t27GrUyLPnj17qVpKWGwg93EcaFfg) → `models/stablemakeup/`
- RetinaFace mobilenet0.25 (facelib): `gdown "https://drive.google.com/uc?id=15zP8BP-5IvWXWZoYTNdvUJUiBqZ1hxu1"` → `models/mobilenet0.25_Final.pth`
- SPIGA 랜드마크 모델은 최초 실행 시 자동 다운로드되는데 **torch.hub의 기본 다운로드가 Google Drive 대용량 파일 확인 페이지를 못 넘겨서 깨진 2KB 파일을 받는다** — `gdown "https://drive.google.com/uc?id=1YrbScfMzrAAWMJQYgxdLZ9l57nmTdpQC" -O <site-packages>/spiga/models/weights/spiga_300wpublic.pt`로 직접 받아야 함
- `image_encoder_l`은 로컬 폴더 대신 HF hub id `openai/clip-vit-large-patch14`로 대체 가능(같은 아키텍처, `bench.py`에 반영됨)

발견/수정한 저장소 버그:
- `infer_kps.py`가 `from utils.pipeline_sd15 import ...`를 쓰는데 실제로는 `utils/` 패키지가 없고 `pipeline_sd15.py`가 루트에 있음 — `bench.py`에서 `from pipeline_sd15 import ...`로 수정해 사용
- `spiga_draw.py`의 `from datasets import load_dataset`이 미사용 import인데, 저장소 자체의 `datasets/` 폴더(namespace package)와 이름이 충돌해서 HF `datasets` 패키지처럼 보여도 임포트 에러가 남 → 해당 줄 삭제(`stable_makeup/spiga_draw.py` 패치)
- `accelerate` 최신 버전이 `huggingface_hub<0.18` 요구사항과 충돌 → `accelerate==0.24.1`로 고정
- `setuptools>=81`부터 `pkg_resources`가 제거돼 SPIGA가 깨짐 → `setuptools<81`로 고정

## 인터랙티브 데모 (`app_demo.py`)

직접 얼굴 사진 + 룩 참조 사진을 업로드해서 브라우저에서 테스트해볼 수 있는 Gradio UI. Stable-Makeup만 제공(상업 사용 가능한 쪽만 데모화; SHMT는 비상업 라이선스라 제외).

```bash
conda run -n makeup-bench-sm python app_demo.py
```
→ `http://127.0.0.1:7860` 접속. steps/guidance 슬라이더 조절 가능, 결과와 함께 실제 추론 시간·VRAM이 표시됨.

추가로 필요했던 패키지 버전 고정(위 설치 단계에 이어서):
```bash
pip install "gradio>=5.0,<6.0" "huggingface_hub==0.26.2" "pydantic==2.9.2" "fastapi>=0.115" "starlette>=0.37"
```
- `huggingface_hub`가 1.0으로 올라가면 벤더링된 `stable_makeup/diffusers`(2023년말 코드)가 깨짐(`hf_cache_home`, `cached_download` 등 제거된 심볼 사용) → `stable_makeup/diffusers/utils/constants.py`, `stable_makeup/diffusers/utils/dynamic_modules_utils.py`를 패치해서 구버전 호환(패치 내용은 두 파일 diff 참고, 둘 다 실제로 안 쓰이는 코드 경로라 안전).
- Gradio 3.50.2(레포 원본 `gradio_demo_kps.py`가 쓰는 버전)는 최신 fastapi/starlette와 충돌해서 그대로는 못 씀. Gradio 4.x도 `gradio_client`가 최신 pydantic(2.11+)의 JSON 스키마 표현과 안 맞아 `TypeError: argument of type 'bool' is not iterable`로 깨짐 → **pydantic을 2.9.2로 내려서 해결** (gradio 5.14.0 기준 확인됨). 최신 gradio(6.x)는 `huggingface_hub>=1.0`을 강제해서 위 벤더링 diffusers 문제와 충돌하므로 5.x 대에 고정.

```bash
conda run -n makeup-bench-sm python bench.py --candidate stable_makeup --variant fp16 --steps 8
conda run -n makeup-bench-sm python bench.py --candidate lcm_lora --steps 4 --guidance 1.5
```
정체성 코사인·LCM-LoRA용 추가 설치: `pip install facenet-pytorch --no-deps`, `pip install peft==0.6.2 --no-deps`(+`pyyaml`) — torch 2.0.1을 건드리지 않도록 `--no-deps`.
(`SD15_SNAPSHOT` 환경변수에 위에서 받은 스냅샷 경로를 지정해야 함)

### SHMT

```bash
conda create -n makeup-bench-shmt python=3.8
conda activate makeup-bench-shmt
git clone https://github.com/Snowfallingplum/SHMT.git shmt
cd shmt
pip install torch==1.13.1 torchvision==0.14.1 --index-url https://download.pytorch.org/whl/cu117
pip install "pytorch-lightning==1.4.2" "torchmetrics==0.6.0" omegaconf einops opencv-python albumentations kornia scikit-image natsort more-itertools transformers scipy imageio six gdown "git+https://github.com/openai/CLIP.git"
```

원 저장소의 `environment.yaml`은 `python=3.8.5, pytorch>=1.7.0, cudatoolkit=11.0`을 지정하지만 `torch._six`(PyTorch 2.0에서 제거됨)를 쓰는 코드가 있어 **torch는 반드시 2.0 미만**이어야 하고, RTX 3060(Ampere, sm_86)을 쓰려면 cu111 이상이 필요해서 `torch==1.13.1+cu117`로 대체했다. `pytorch-lightning==1.4.2`는 원본 그대로 유지(더 새 버전은 `pytorch_lightning.utilities.distributed` 등 경로가 바뀌어 깨짐) — 단, 최신 `torchmetrics`와 API가 안 맞아 `torchmetrics==0.6.0`으로 같이 고정해야 함.

받아야 할 가중치:
- VQ-f4 오토인코더: `curl -LO https://ommer-lab.com/files/latent-diffusion/vq-f4.zip` → 압축 해제 → `models/first_stage_models/vq-f4/model.ckpt`, `configs/latent-diffusion/shmt_h0.yaml`·`shmt_h4.yaml`의 `ckpt_path`(원본은 저자 서버의 절대경로 `/hy-tmp/scy/...`로 하드코딩돼 있음)를 로컬 경로로 수정해야 함
- SHMT 사전학습 체크포인트(h0/h4): `gdown --folder "https://drive.google.com/drive/folders/1UJDdGCeE6qEqr3yi6BK1tEkwnjVKQDZY"` → `checkpoints_dl/{h0,h4}/*.ckpt`

발견/수정한 저장소 버그:
- `ldm/data/makeup_dataset.py`의 `A.Compose(...)`가 최신 albumentations(1.4.x)의 엄격한 shape-check에 걸려 "Height and Width ... should be equal" 에러 발생(원본이 타겟한 albumentations 0.4.3에는 이 체크가 없었음) → `is_check_shapes=False` 추가로 패치
- `six` 패키지가 requirements에 없어서 `torch.utils.tensorboard` 임포트 체인에서 `ModuleNotFoundError: No module named 'six'` 발생 → 명시적으로 설치 필요

```bash
conda run -n makeup-bench-shmt python bench.py --candidate shmt --variant h4 --steps 25
```

## 폴더 구조

```
server-bench/
  stable_makeup/   # git clone (gitignored, 로컬에만 존재)
  shmt/             # git clone (gitignored, 로컬에만 존재)
  results/          # 샘플 이미지 + results.csv (커밋됨)
  bench.py          # 측정 하네스
  identity.py       # 얼굴 임베딩 코사인(facenet-pytorch)
  README.md         # 이 파일
```
