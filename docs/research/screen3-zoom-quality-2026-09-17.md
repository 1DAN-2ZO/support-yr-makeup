# 화면 3 부위 확대 화질 개선 조사 (원문, 2026-09-17)

# 화면 3 "완성 룩" 확대 화질 개선 — 조사 보고 (2026-09 기준)

전제: 확대 결과는 사용자가 **따라 그리는 참고 이미지** → 없는 디테일을 만들어내는(환각) 방식은 감점, 동일인 유지 필수, 서버 10–20 s 허용, 상업 라이선스 중요.

## 1. 순위 추천

### 케이스 (b) 원본 셀피 1080×1920 + 메이크업 레이어 합성 → 양눈 확대 3.6×
- **최선 — "확대할 픽셀을 애초에 더 확보 + 레이어는 확대 후 다시 그리기"**
  - 메이크업 레이어를 비트맵이 아니라 **좌표(랜드마크)+파라미터**로 들고 있다가 확대 배율에 맞춰 캔버스에 다시 렌더링 → 레이어는 배율과 무관하게 선명, 환각 0. 확대되는 것은 사진뿐.
  - 사진은 촬영 단계에서 최대 해상도 확보: Android Chrome은 `ImageCapture.takePhoto()`가 "highest available photographic camera resolution"을 사용(Chromium 계열만 지원). Safari/iOS는 ImageCapture 미지원 → `<video>`→canvas `drawImage` 로 프레임 캡처. iOS Safari getUserMedia가 실제로 몇 px을 주는지는 **기기별로 측정 필요**(§3).
  - 사진 확대는 온디바이스 Lanczos(캔버스 `imageSmoothingQuality:'high'` 또는 WebGL) + **RCAS/CAS 약한 샤프닝**(AMD FSR1의 EASU+RCAS WebGL 포트 `Hajime-san/web-fsr` MIT, CAS WebGL 포트 `BenjaminWegener/AMD-fidelityFX-CAS-webGL` MIT). 3.6×는 EASU 설계 범위(≤2× 권장)를 넘으므로 EASU보다는 Lanczos 후 RCAS만 쓰는 편이 안전. 환각 없음, 0.1 s 미만.
- **차선 — 온디바이스 소형 SR (환각 낮음, 완전 0은 아님)**: Real-ESRGAN `general_fast`(FP16 2.5 MB) / Real-CUGAN 2×(2.6 MB)를 TF.js WebGL/WebGPU로(`xororz/web-realesrgan`, 단 GPL-2.0 → 코드 재사용 시 주의; 모델 원본 Real-ESRGAN은 BSD-3), 또는 UpscalerJS ESRGAN-slim(MIT). GAN계 SR은 피부 결·속눈썹을 "그럴듯하게" 만들 수 있어 참고용으로는 약간 위험. iOS 26/Safari 26부터 WebGPU 기본 활성 → ONNX Runtime Web WebGPU 경로 가능.
- **최후 — 서버 디퓨전 타일 업스케일**: 이 케이스에선 불필요. 원본이 이미 실사이므로 디퓨전은 얻는 것보다 잃는 것(동일인·메이크업 형태 변형)이 큼.

### 케이스 (a) 512×512 서버 렌더(Stable-Makeup, SD1.5, 추론 시 512 resize 확인) → 양눈 확대 7.4×
7.4×는 어떤 업스케일러로도 "참고용" 품질이 안 나옴. **원인 제거가 답.**
- **최선 — 부위별 재렌더링(FaceDetailer/ADetailer 방식을 자체 구현)**: 원본 셀피(1080×1920)에서 양눈 영역을 16:9로 잘라 **그 크롭 자체를 512(또는 768) 입력**으로 Stable-Makeup/img2img를 돌리고, 결과를 원위치에 페더링해 붙임. 얼굴 전체 512 대비 눈 영역 픽셀이 약 3–4배 늘어나 실질 확대 배율이 ~2×대로 떨어짐. 동일인 보존: 입력이 원본 고해상도 크롭이고(구조 정보가 사진에서 옴) denoise를 낮게(커뮤니티 가이드 0.3~0.4, ADetailer는 "0.1 같은 낮은 값" 권장) 두면 가장 잘 유지됨. 근거: ADetailer/Impact Pack 문서("detect→crop→upscale→regenerate→stitch"). 단 ADetailer는 AGPL-3.0, Impact Pack은 GPL-3.0 → **코드를 쓰지 말고 방식만 재구현**(diffusers로 수십 줄). 시간: SD1.5 img2img 512 크롭 1장 = 수 초(A100/4090급), 예산 내.
  - 부가 아이디어(내 판단, 미검증): 512 렌더와 정렬된 원본의 **차분을 메이크업 레이어로 추출**해 원본 풀해상도에 합성하면 케이스 (a)가 (b)로 바뀜. 피부 톤·조명이 다르면 경계 티가 나므로 눈/입술 마스크 안에서만 적용.
- **차선 — 512 렌더의 눈 크롭을 "저-denoise 타일 업스케일"**: 상업 가능 조합 = **MoD ControlNet Tile Upscaler SDXL**(Apache-2.0, ControlNet `xinsir/controlnet-tile-sdxl-1.0` apache-2.0) 또는 **PiSA-SR / OSEDiff**(Apache-2.0, SD2.1, 1-step, A100에서 512 기준 ~0.1 s). PiSA-SR은 `λsem`(의미 디테일)을 낮추고 `λpix`(픽셀 충실도)만 올리는 식으로 환각을 제어 가능 → 참고용에 가장 적합한 노브. 일반 이미지 모델이라 눈썹·속눈썹 결을 "만들" 위험은 남음. SD1.5 ControlNet-Tile(`control_v11f1e_sd15_tile`)은 OpenRAIL-M(사용제한 조항 있음)이고 Tiled Diffusion(A1111/ComfyUI 포트)은 **CC BY-NC-SA 4.0**, Clarity Upscaler는 **AGPL-3.0**, SUPIR·HYPIR은 **비상업 전용** → 상업 서비스엔 제외.
- **얼굴 복원 모델은 권장하지 않음(내 판단)**: GFPGAN(Apache)/CodeFormer(S-Lab NC)/PMRF(MIT)/AuthFace(Apache) 등은 FFHQ 열화→복원 학습이라 "깨끗한 맨얼굴 피부"로 되돌리는 prior가 강함 → 아이라인·섀도가 지워지거나 안경 등 없는 요소가 생성될 수 있음(CodeFormer++ 논문: "GFPGAN, DifFace, CodeFormer generate artificial spectacles… VQFR, RestoreFormer++, DAEFR hallucinate facial features"). 굳이 쓴다면 PMRF(MIT, 512, MMSE-최적 후 flow 25 steps)가 이론상 가장 충실도 우선. 메이크업 보존 여부는 실측 필요.
- **최후 — 온디바이스 Lanczos+RCAS**: 7.4×에선 뭉개짐. 눈 부위 참고로는 부족하고 입술(상대적으로 큰 영역, 약 4–5×)에서만 그럭저럭.

## 2. 비교표

| 방법 | 유형 | 라이선스(공식 페이지 인용) | 배율/해상도 | 동일인·환각 위험 | 시간 | 실행 위치 | 근거 |
|---|---|---|---|---|---|---|---|
| 촬영 해상도 확보 (ImageCapture.takePhoto / canvas 캡처) | 원인 제거 | 표준 API | 기기 카메라 최대(Chromium만 takePhoto; Safari는 canvas) | 없음 | 즉시 | 폰 브라우저 | https://www.dynamsoft.com/codepool/take-high-resolution-photo-in-the-browser.html |
| 부위별 재렌더 (crop→img2img 저-denoise→paste) | 원인 제거 | 자체 구현(ADetailer AGPL-3.0·Impact Pack GPL-3.0 코드는 미사용) | 눈 크롭을 512–768 입력 | 낮음~중(denoise 의존) | 수 초 | 서버 GPU | https://github.com/Bing-su/adetailer , https://github.com/ltdrdata/ComfyUI-Impact-Pack |
| Stable-Makeup (현행) | 렌더 | "Apache-2.0"(레포 표기), SD1.5 diffusers 기반, 추론 512 resize | 512 | — | — | 서버 | https://github.com/Xiaojiu-z/Stable-Makeup |
| MoD Control Tile Upscaler SDXL | 디퓨전 타일 SR | "Apache 2.0"(레포) / ControlNet xinsir tile "apache-2.0" | 임의 | 중(denoise 낮게) | 수 초~수십 초 | 서버 | https://github.com/DEVAIEXP/mod-control-tile-upscaler-sdxl , https://huggingface.co/xinsir/controlnet-tile-sdxl-1.0 |
| ControlNet Tile SD1.5 | 디퓨전 타일 | CreativeML OpenRAIL-M | 임의 | 중 | 수 초 | 서버 | https://huggingface.co/lllyasviel/control_v11f1e_sd15_tile |
| Tiled Diffusion/MultiDiffusion(A1111·ComfyUI 포트) | 디퓨전 타일 | "CC BY-NC-SA 4.0"(2023.3.28 이후 상업 판매 불가; ComfyUI 포트도 해당 코드 CC BY-NC-SA, 나머지 GPLv3) | 임의 | 중 | 수 초~ | 서버 | https://github.com/pkuliyi2015/multidiffusion-upscaler-for-automatic1111 , https://github.com/shiimizu/ComfyUI-TiledDiffusion |
| Mixture-of-Diffusers 원본(albarji) | 알고리즘 | MIT | — | — | — | 서버 | https://github.com/albarji/mixture-of-diffusers |
| Clarity Upscaler | 디퓨전 파이프라인 | AGPL-3.0 (Juggernaut+tile CN+Tiled Diffusion+4x-UltraSharp+LoRA, denoise 0.35) | 2–4× | 중~높(디테일 LoRA) | 수십 초 | 서버 | https://github.com/philz1337x/clarity-upscaler |
| SUPIR | 디퓨전 SR(SDXL) | "SUPIR Software License Agreement" — 비상업 전용, 상업은 별도 계약 | 임의 | 높(생성 강함) | 수십 초, 고VRAM | 서버 | https://github.com/Fanghua-Yu/SUPIR/blob/master/LICENSE |
| SeeSR | 디퓨전 SR(50 step, turbo 2 step) | "Apache 2.0" | 4× | 중 | 수 초~수십 초 | 서버 | https://github.com/cswry/SeeSR |
| PASD | 디퓨전 SR | Apache-2.0(레포) | 4× | 중 | 수 초~ | 서버 | https://github.com/yangxy/PASD |
| OSEDiff | 1-step SR(SD2.1) | "Apache 2.0"; A100 0.1046 s/iter; RealSR PSNR 25.15/LPIPS 0.2921, DrealSR PSNR 27.92 | 4× | 낮~중(LPIPS 우수, 디테일은 SeeSR보다 덜 만듦) | ~0.1 s/512 | 서버 | https://github.com/cswry/OSEDiff |
| PiSA-SR | 1-step SR(SD2.1), λpix/λsem 조절 | "Apache 2.0" | 4× | 낮~중(λsem↓로 환각 억제) | 1-step | 서버 | https://github.com/csslc/PiSA-SR |
| TSD-SR | 1-step SR | Apache 2.0(검색 요약, 원문 미확인) | 4× | 중 | 1-step | 서버 | https://github.com/Microtreei/TSD-SR |
| InvSR | 1–5 step SR(SD-Turbo) | "NTU S-Lab License 1.0"(비상업, 상업은 저자 연락) | 4× | 중 | 1–5 step | 서버 | https://github.com/zsyOAOA/InvSR |
| DiffBIR | 디퓨전 복원(SD2.1, 얼굴 모드 있음) | Apache-2.0(레포) | 임의 | 중~높 | 수십 초 | 서버 | https://github.com/XPixelGroup/DiffBIR |
| HYPIR (DiffBIR 후속) | 디퓨전 복원 | "strictly for non-commercial purposes" | — | — | 빠름 | 서버 | https://github.com/XPixelGroup/HYPIR |
| GFPGAN | 얼굴 복원(GAN) | "Apache License Version 2.0" | 512 얼굴 | 중~높(안경 생성 사례) | <1 s | 서버 | https://github.com/TencentARC/GFPGAN |
| CodeFormer | 얼굴 복원(codebook), w∈[0,1] 충실도 가중 | "NTU S-Lab License 1.0" — 비상업 | 512 | 중(w↑로 완화) | <1 s | 서버 | https://github.com/sczhou/CodeFormer |
| RestoreFormer++ | 얼굴 복원 | Apache-2.0(레포) | 512 | 중~높(환각 지적) | <1 s | 서버 | https://github.com/wzhouxiff/RestoreFormerPlusPlus |
| PMRF (ICLR 2025) | 얼굴 복원, MMSE 후 rectified flow | "MIT license"; FFHQ 512; `--num_flow_steps 25` | 512 | 낮~중(이론상 충실도 최우선) | 수 초 | 서버 | https://github.com/ohayonguy/PMRF |
| Latent-PMRF (2025) | 잠재공간 PMRF, Sim-VAE | **미확인**(LICENSE 파일 404); PMRF 대비 5.79× 빠름 | 512 | 낮~중 | — | 서버 | https://github.com/Luciennnnnnn/Latent-PMRF |
| AuthFace (ACM MM 2025) | 얼굴 복원(디퓨전 prior) | Apache-2.0 배지; 데이터셋은 비상업 | 512 | 중 | — | 서버 | https://github.com/EthanLiang99/AuthFace |
| HonestFace (2025) | 1-step 얼굴 복원, ID 임베더 | **미확인**; 가중치 "TODO" 미공개 | — | 낮(주장) | 1-step | 서버 | https://github.com/jkwang28/HonestFace |
| OSDFace (CVPR 2025) | 1-step 얼굴 복원, ID loss | **미확인**(LICENSE 404) | 512 | 중 | 1-step | 서버 | https://github.com/jkwang28/OSDFace |
| DynFaceRestore (ICCV 2025) | 디퓨전 가이드 복원 | **미확인**(레포에 라이선스 표기 없음) | 512 | 낮~중(PSNR 우선 주장) | 다단계 | 서버 | https://github.com/nycu-acm/DynFaceRestore |
| Lanczos/bicubic + RCAS/CAS | 고전 | FSR1 WebGL 포트 MIT, CAS WebGL 포트 MIT | 임의 | 없음 | <0.1 s | 폰 브라우저 | https://github.com/Hajime-san/web-fsr , https://github.com/BenjaminWegener/AMD-fidelityFX-CAS-webGL |
| Anime4K(WebGPU) | 셰이더 SR | MIT | 2× | 낮(에지 강조, 실사엔 부자연) | 실시간 | 폰(WebGPU) | https://github.com/Anime4KWebBoost/Anime4K-WebGPU |
| UpscalerJS ESRGAN-slim/medium/thick | TF.js SR | MIT; FP16 양자화; 2×/3×/4× | 2–4× | 낮~중 | 페이지에 수치 없음(slim "가장 빠름") | 폰 브라우저 | https://upscalerjs.com/models/available/upscaling/esrgan-slim/ |
| web-realesrgan (TF.js WebGL/WebGPU) | 브라우저 SR | GPL-2.0(코드); 모델 general_fast 2.5 MB, general_plus 34.2 MB, Real-CUGAN 2× 2.6 MB; "WebGPU ≈ 로컬의 절반 속도" | 2–4× | 중 | 모바일 수치 없음 | 폰 브라우저 | https://github.com/xororz/web-realesrgan |
| Real-ESRGAN 원본 | SR 모델 | BSD-3-Clause; `realesr-general-x4v3`(-dn 노이즈 조절) | 4× | 중 | — | — | https://github.com/xinntao/Real-ESRGAN |
| SwinIR-light | SR 모델 | Apache 2.0; 경량판 약 897K 파라미터 | 2–4× | 낮(PSNR 지향) | 브라우저 수치 없음 | 변환 시 폰 | https://github.com/JingyunLiang/SwinIR |
| free.upscaler.video 초소형 CNN | 브라우저 SR | 오픈소스(라이선스 미표기) | 2× | 낮 | 모바일 15–30 FPS@720p(small), M4 MBP 120 FPS | 폰(WebGPU) | https://free.upscaler.video/technical/architecture/ |
| LiteRT.js Real-ESRGAN 데모 | 브라우저 SR | — | 128→512 패치 | 중 | 수치 없음 | 폰(WebGPU) | https://developers.googleblog.com/en/litertjs-googles-high-performance-web-ai-inference/ |
| ONNX Runtime Web WebGPU | 런타임 | MIT(onnxruntime) | — | — | Safari 26/iOS 26부터 WebGPU 기본 활성 | 폰 | https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/ |

## 3. 확인 못 한 것 (숫자 지어내지 않음)
1. **iOS Safari getUserMedia 실제 최대 해상도(2024–2026)**: 찾은 근거는 iOS 11 시절 Apple 포럼 글("720p만 제공", 답변 0건)과 webrtcHacks의 "기기 네이티브 해상도만 지원, iOS 13에서 개선" 뿐. 현행 iOS 17/18/26 전면 카메라가 1080p·4K 트랙을 주는지 공식 문서 없음 → **실기기에서 `video.videoWidth/Height` 측정 필요**. `getCapabilities()`가 iOS에서 정보를 안 준다는 포럼 답변만 있음.
2. **Perfect Corp/ModiFace의 클로즈업 방식**: 라이브 카메라 기반 AR이라는 것 외에 "확대 시 업스케일 렌더 vs 카메라 네이티브"를 밝힌 공개 자료 없음. Perfect Corp Skincare Pro HD가 "zoom-in views"를 제공한다는 보도만 있음(피부 분석용).
3. **"참고 이미지가 쓸모없어지는 확대 배율" HCI 연구**: 그리기 참고 용도로 배율 임계를 다룬 논문 못 찾음. 모바일 화면 지각 품질 연구(Zou 2016 등)는 코딩·해상도 차이 연구라 직접 적용 불가. 경험칙(2×까지 안전, 4× 이상은 세부 상실)은 근거 없이 쓰지 않음.
4. **각 모델의 얼굴 동일인 지표(ID 유사도)와 메이크업 보존 여부**: 어떤 SR/복원 논문도 "메이크업이 유지되는가"를 측정하지 않음. 얼굴 복원 모델이 아이라인·섀도를 지울 위험은 내 추론(§1)이며 실측 필요.
5. 라이선스 미확인: Latent-PMRF, HonestFace(가중치 미공개), OSDFace, DynFaceRestore, MultiDiffusion 원본(omerbt), TSD-SR(검색 요약만), free.upscaler.video. 2026 신작(arXiv 2605.09328 Noise-Started 1-step SR, 2605.13457 OP4KSR, 2509.10122 Realism-Control 1-step, 2508.16557 Time-Aware 1-step)은 코드·라이선스 확인 못 함.
6. 모바일 브라우저에서 512→1024 SR의 **초 단위 실측**: web-realesrgan·UpscalerJS 모두 페이지에 모바일 수치 없음. 유일한 수치는 free.upscaler.video의 초소형 CNN(모바일 15–30 FPS@720p)뿐.
7. SD1.5 hires-fix/SDXL 768–1024 직접 렌더의 동일인 비교 수치: 커뮤니티 가이드(denoise 0.3, ≤0.4) 외 정량 근거 없음. Stable-Makeup을 768로 돌릴 때 품질 저하 여부도 미검증.

한 줄 결론: **(b)는 레이어를 벡터로 재렌더 + 사진은 Lanczos+RCAS(환각 0)**, **(a)는 512 전체 렌더를 확대하지 말고 원본 고해상도 눈/입술 크롭을 512로 부위별 재렌더**하는 것이 동일인·무환각·상업 라이선스 세 조건을 모두 만족하는 유일한 조합. 디퓨전 업스케일을 꼭 쓴다면 Apache 계열(PiSA-SR λsem↓, OSEDiff, MoD Tile SDXL)만.
