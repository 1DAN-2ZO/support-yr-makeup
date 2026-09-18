# 당화응 모듈별 전체 할 일 (6명 · 담당자 미정)

2026-09-18 · 분업안(`work-split-modules-v6.md`) + AI 파이프라인(`ai-pipeline-v6.md`) + 개발 규칙(`dev-stack-v6.md`)을 **사람 하나가 자기 몫만 보면 되게** 한 장으로 편 것. 순서대로 하면 된다. ★ = 다른 모듈이 기다리는 것(먼저).

> **공통 (전원, 첫날)**
> `git clone` → `bash scripts/setup.sh` → `client/src/core/types.ts`·`server/app/schemas.py` 읽고 자기 모듈 계약에 이의 있으면 첫 회의에서 → 자기 모듈 브랜치(`capture` `guide` `score` `server` `model` `app`)로 checkout → 작은 단위로 자주 `main`에 PR, CI 초록.
>
> **팀 전체가 정해야 시작되는 것 (첫 회의)**: 담당자 6명 · 화면 3 구현 두 벌 중 하나 · 눈 감음·45° 장 용도 · 룩 참조 사진 10장 방법 · 평가 1·2·3 통과 기준 "낮으면 뭘 바꿀지" · 서버 장애 시 "이용 불가"를 "룩 준비 중"으로 바꿀지

---

## ① 촬영·기준 (클라이언트, TypeScript) — 브랜치 `capture`

**받는 것** 카메라 · **주는 것** `Baseline`(얼굴 점·비율 척도·이마 L*·눈 흰자·얼굴형·쌩얼 사진), `Session` 저장소 · **지금 있는 것** `poc/full`의 `flow.js shotGate`·`createSession`·`stripImages`, `app.js` 촬영·자동 셔터

| 주 | # | 할 일 | 산출물 | 기다리는 쪽 |
| --- | --- | --- | --- | --- |
| 1 | 1-1 ★ | `poc/full/lib/flow.js`(촬영 게이트·세션) → `client/src/core/flow.ts` 이전 + `tests.mjs` S1~S5·P1~P3 → vitest | TS 파일 + 테스트 | ②③⑥ |
| 1 | 1-2 | 폰 실기기(iOS 1·Android 1)에서 4장 자동 촬영 실측: 시간, 장별 재촬영 횟수, 45° 판정 허용치 | 표 1장 → 평가 E-5 | ⑤ |
| 1 | 1-3 | 기기별 카메라 잠금 지원 표 (`getCapabilities()`로 `whiteBalanceMode`·`exposureMode`) | 표 | ③(색 보정 방식) |
| 1 | 1-4 | 4장 연속 촬영 시 이마 L*·**a*·b*** 변동 폭 측정 (조명 3종 × 3명) | 숫자 → E-5, S-4 근거 | ③ |
| 1 | 1-5 | 이벤트 찍기: `consent`, `capture{shot, ok, retry, reason}`, `restore` | `log()` 호출 | ⑥ |
| 2 | 1-6 ★ | 눈 흰자 a*·b* 참조 **실제 구현** → `Baseline.scleraLab` | 코드 + 테스트 | ③ |
| 2 | 1-7 ★ | 세션 저장을 IndexedDB로: 상태 JSON + 사진 3장(쌩얼·완성 예상·최종 프레임, WebP 1024) · 끝내기 시 localStorage·IndexedDB·메모리 동시 삭제 | 저장소 모듈 + 잔존 0 테스트 | ⑥ |
| 2 | 1-8 | 되는 기기는 WB·노출 잠금(`applyConstraints`), Wake Lock, `visibilitychange`·`webglcontextlost` 복구 | 코드 | — |
| 2 | 1-9 | 게이트에 a*·b* 변동 조건(`color`) 추가 — 임계는 1-4 결과로 | 코드 | ③ |
| 2 | 1-10 | 눈 감음·45° 장 용도 확정 반영: 쓰면 눈꺼풀 기준점 추출, 안 쓰면 정면 2장으로 축소 | 코드 + 정의서 정정 | ⑥ |
| 3 | 1-11 | 정면 재촬영 시 기준 재계산·나머지 3장 재정렬, 복원 성공률 측정, draft 2시간 만료 | 테스트 + E-8 숫자 | ⑥ |
| 4 | 1-12 | 전 흐름 폰 실기기 통과, 촬영 60초 이내 확인 | 체크리스트 | ⑥ |

---

## ② 가이드·실시간 (클라이언트, TypeScript) — 브랜치 `guide`

**받는 것** `Baseline`, `LookTemplate`, `FaceShape`, 라이브 프레임, 완성 예상 이미지·화장 레이어(④) · **주는 것** `GuideSet`, `GateResult`, `CaptureBundle`(3~5장 + 손 겹침) · **지금 있는 것** `guides.js`, `gate.js`, `screen3-core.js`·`screen3-rules.js`, `landmarks.js`, 실기기 수정 7건

| 주 | # | 할 일 | 산출물 | 기다리는 쪽 |
| --- | --- | --- | --- | --- |
| 1 | 2-1 ★ | 화면 3 구현 두 벌(soyoon vs jeakeun) 중 하나로 결정 → 채택본을 `client/src/core/guides.ts`·`gate.ts`·`landmarks.ts`·`contour.ts`로 이전, 화면 4 POC 26개 + 통합 I1~I3 → vitest | TS 파일 + 테스트 | ③⑥ |
| 1 | 2-2 ★ | 확인받기를 **3~5프레임 연속 촬영**으로 → `CaptureBundle{frames, pts, handOverlap, foreheadL}` | API + 테스트 | ③ |
| 1 | 2-3 | 흔들림 1차: 크롭 데드존(얼굴 폭 3%) + One-Euro 필터 → 적용 전후 웹캠 30초 비교 | 영상 2개 + 표준편차 | 평가 E-6 |
| 1 | 2-4 | 이벤트 찍기: `gate_fail{first_fail}`, `landmark_lost{ms}`, `screen_enter/leave` | `log()` 호출 | ⑥ |
| 2 | 2-5 | 손 검출(Hand Landmarker) 붙이기, 3~5프레임 1회, 프레임별 `handOverlap` 플래그 | 코드 | ③ |
| 2 | 2-6 | 흔들림 2차: 강체 변환(가이드 한 번 만들고 이동·회전·크기만 갱신), 깜빡임(EAR) 정지, 자리 비움 때 평활화 상태 유지 | 코드 + E-6 재측정 | — |
| 2 | 2-7 | 표정 게이트(EAR·MAR 또는 MediaPipe 블렌드셰이프)와 기준 각도 차 게이트 정리 | 코드 | ③ |
| 2 | 2-8 | 강체 점 목록(콧대·미간·광대·눈 안쪽 끝)을 크롭·정합·게이트에 통일 | 코드 + 문서 3-5 | ③ |
| 3 | 2-9 ★ | 완성본 소스를 "원본 정면 + ④ 화장 레이어"로 (3.6배) — 레이어 없으면 512 줌 폴백. 세로 부위 크롭이 실제 확대가 되게(입술 3% 문제) | 코드 | ⑥ |
| 3 | 2-10 | 룩 10개 확정값(⑥)으로 템플릿 교체, 쉐딩 규칙 교재 출처 반영(⑤·⑥) | `rules/looks.json` 읽기 | — |
| 4 | 2-11 | 폰 30fps·±30° 정렬 오차 실측, 가로↔세로 전환 0.5초 | E-6 숫자 | ⑥ |

---

## ③ 채점·합산 (클라이언트 순수 함수, TypeScript + 평가는 Node CLI) — 브랜치 `score`

**받는 것** `Baseline`, `GuideSet`, `CaptureBundle`, `LookTemplate` 밴드·허용 범위 · **주는 것** `PartResult`, `SessionSummary`, 코드표 · **지금 있는 것** `score.js`(27개 검증), `sampling.js`, `review.js`(24개)

| 주 | # | 할 일 | 산출물 | 기다리는 쪽 |
| --- | --- | --- | --- | --- |
| 1 | 3-1 ★ | `score.js`·`sampling.js`·`review.js` → `client/src/core/score.ts`·`sampling.ts`·`review.ts` 이전, 검증 27 + 24 → vitest | TS + 테스트 | ⑥⑤ |
| 1 | 3-2 ★ | `eval/score/score_cli.mjs` — 골든 세트 항목을 받아 채점기를 돌려 JSON을 내는 Node CLI (⑤의 `eval/score/run.py`가 부름) | CLI | ⑤ |
| 1 | 3-3 | 프레임 묶음 평균 + 손 걸린 프레임 제외, 전부 더러우면 `check_only(reason='hand')` | 코드 + 테스트 | — |
| 1 | 3-4 | 볼·입술 `metrics.colorAb`, 눈썹 `metrics.lrDiff` 넘겨서 **조화·대칭 보정 실제로 켜기**. 조화 허용 범위는 룩 확정 전 null | 코드 + 테스트 | ⑥ |
| 1 | 3-5 | 코드표(`DIAG_TEXT`)를 `score.ts` 한 곳으로, `review.ts`는 가져다 씀. `lrDiffMm` 등 이름을 비율로 정리 | 코드 | ⑥ |
| 1 | 3-6 | 이벤트 찍기: `score{part, status, check_reason, ms}`, `part_status` | `log()` 호출 | ⑥ |
| 2 | 3-7 ★ | **E-1 실사진 채점**: 골든 30장 + 실촬영 200장에 사람 판정 대비 일치율·혼동·반복 편차·확인만 비율 | `eval/results` CSV → 결과표 | 발표 숫자 ① |
| 2 | 3-8 | E-7 대칭 보정 방향(한쪽만 진하게 10장 / 양쪽 같게 10장) | CSV | — |
| 2 | 3-9 ★ | **S-4 색 보정 방식 선정**: 이마 L*만 / 눈 흰자 a*b* / 인접 피부 대비 / 이동 초과 시 확인만 — ①의 1-4 조명 세트로 오탐률 비교 | 선정 표 + 채택 | ① |
| 2 | 3-10 | 격자 ±6~8mm(비율)로 넓히고 "이탈 최대"는 방향·구간으로. 임계 1차 조정 | 코드 + 골든 재실행 | — |
| 3 | 3-11 | S-4 결과 반영(인접 피부 대비를 고르면 임계 전부 재보정). E-1 미달이면 **S-3 부위 영역 선정**(후처리 → BiSeNet ∩ ΔE → EasyPortrait 학습) 열기 | 코드 + CSV | ⑤ |
| 3 | 3-12 | 표정 차·정합 잔차 초과 시 `check_only(reason='align')` 확인, 잔차 분포 로그 | 코드 | — |
| 4 | 3-13 | 임계 확정 → `rules/score.json`(`version: score-v0.N`), 골든 재실행, 버전별 일치율 그래프 | JSON + 그래프 | 발표 |

---

## ④ 서버·생성 (Python 3.11 + FastAPI, GPU 워커 conda, 클라이언트 워핑은 TS) — 브랜치 `server`

**받는 것** 정면 사진 1장, 룩 참조 사진 10장 · **주는 것** `LookJob`(결과·레이어·닮음·버전) · **지금 있는 것** `server/app`(큐·스텁 워커·삭제·버전, 테스트 5개), `server-bench`(Stable-Makeup fp16 8 step 2.55초), `tryon.js`(3점 아핀)

| 주 | # | 할 일 | 산출물 | 기다리는 쪽 |
| --- | --- | --- | --- | --- |
| 1 | 4-1 ★ | Stable-Makeup을 `jobs.py`의 `Worker` 자리에 **별도 프로세스**로 꽂기(conda 환경, 큐로 통신). 같은 얼굴 룩 10개면 SPIGA 얼굴 구조 1회 캐싱 | 워커 + 룩 10개 30초 실측 | ⑥②③ |
| 1 | 4-2 | 프로세스 안 큐 → Redis + RQ, 고른 룩 우선, 256 저해상 먼저 | 코드 + 테스트 유지 | — |
| 1 | 4-3 | **S-1 시간·VRAM 1차**: DDIM 8·10, LCM-LoRA 4~8, 경량 GAN 2~3종(EleGANt·SSAT·BeautyREC — 라이선스 먼저) | 벤치 CSV 확장 | ⑤ |
| 1 | 4-4 | 서버 로그 `look_job{job, look, status, ms, queue_ms, cos}` 형식을 ⑥ `Event`와 통일, 파일명 없음 | 로그 | ⑥ |
| 2 | 4-5 ★ | 화장 레이어 추출: 부위 마스크(랜드마크 폴리곤) 안에서만 ΔLab, 약한 변화 알파 0 → `LookJob.layer` | 레이어 PNG + 스펙 | ② |
| 2 | 4-6 | ArcFace 정체성 코사인 실제 계산, 임계 미달 → `fallback` | 코드 | ⑤ |
| 2 | 4-7 | 클라이언트 워핑 TS 이전(`tryon.ts`): 3점 아핀 → 부위별 아핀 → `FACE_LANDMARKS_TESSELATION` 삼각형 텍스처(WebGL) | 코드 + 30fps 실측 | ⑥ |
| 2 | 4-8 ★ | **S-1 확정**: 우리 맨얼굴 5명 × 룩 3으로 닮음·색 반영 비교 → 모델·샘플러 채택 | 선정 표 | ⑤ |
| 3 | 4-9 ★ | **E-3**: 실촬영 20명 × 룩 10 = 200장 시간·닮음·부위 ΔE·실패 분류 | CSV → 결과표 | 발표 숫자 ③ |
| 3 | 4-10 | 삭제 정책 완성: nginx `client_body_temp_path` tmpfs, 결과 저장소 TTL 크론, 접근 로그 파일명 제거, 삭제 검증 스크립트 | 운영 문서 + 검증 | — |
| 3 | 4-11 | 헬스체크·워커 자동 재시작·큐 대기 20초 안내 실제 동작 확인, 서버 지표 집계(p50/p95·큐·실패율·닮음 분포·재시작) | 스크립트 + 표 | ⑥ |
| 4 | 4-12 | (선택) 룩 전용 LoRA: 참조 10장 + 룩당 5~20장 변형, 학습 전/후 E-3 비교 | CSV | 발표 |
| 4 | 4-13 | 배포(자체 GPU + Cloudflare/Vercel 정적), HTTPS, 실기기 왕복 3초 확인 | 배포 URL | ⑥ |

---

## ⑤ 모델·데이터·평가 (Python) — 브랜치 `model`

**받는 것** 팀 전체가 찍은 사진, `Baseline` 랜드마크 · **주는 것** `FaceShape` 함수, 평가 데이터, `eval-results-v6.md` · **지금 있는 것** `estimateFaceShape`(규칙), `datasets-ranked-v6.md`, `poc/datasets-eval`, `poc/synth`(보류), `eval/` 틀

| 주 | # | 할 일 | 산출물 | 기다리는 쪽 |
| --- | --- | --- | --- | --- |
| 1 | 5-1 ★ | 동의서 양식(발표·학습·라벨·앱 화면) → **촬영 세션 20명 × 10장**: 같은 자리에서 맨얼굴 → 눈썹 → 라이너 → 섀도우 → 립 → 볼터치 단계별, 일부러 벗어난 장, 조명 3종, 각도 3종. 원본은 `DHE_DATA_DIR`, `person_id` 익명화 | 사진 200장 + 동의서 | **전원** |
| 1 | 5-2 ★ | 골든 세트 30장 고정(6명 × 5장) → `eval/golden/manifest.json` `golden-v1`, 사람 단위 분할 | manifest | ③④ |
| 1 | 5-3 ★ | 얼굴형 2인 독립 라벨(50~100명, 촬영 20명 + 지인 셀피) → 불일치 3인 판정, κ 기록. **규칙 정확도 기준선**(S-2 A) 먼저 | `labels-v1` + 숫자 | 발표 숫자 ② |
| 1 | 5-4 | Kaggle Face Shape 5,000 내려받기(라이선스 페이지 재확인), EasyPortrait 내려받기, AI Hub 3종 신청 | 데이터 + 신청 완료 | — |
| 1 | 5-5 | E-4 랜드마크 부위 영역 IoU(EasyPortrait 200장·Periorbital) — `poc/datasets-eval` 이식 → `eval/region/run.py` | CSV | ③ |
| 1 | 5-6 | 룩 참조 사진 10장 방법 조사(자체 촬영 / 생성 / Generated Photos 견적) → ⑥ 결정 지원 | 비교 표 | ⑥④ |
| 2 | 5-7 ★ | 부위별 사람 판정 3단계(맞음·조금·많이) 200장 × 2인, 장당 1분 | `labels-v1` 확장 | ③ E-1 |
| 2 | 5-8 | **S-2 후보 비교**: B 비율 특징 + 분류기 / C MobileNetV3 파인튜닝(Kaggle 1차 → 자체 라벨) / D 임베딩 + 선형 — 정확도·크기·폰 시간 | 선정 표 | — |
| 2 | 5-9 | `eval/faceshape/run.py`, `eval/transfer/run.py`(④ API 호출), `eval/gate/`·`live/`·`funnel/` 집계 스크립트 틀 | 스크립트 | ①②④⑥ |
| 2 | 5-10 | 실험 기록 규칙 적용: `train/configs/*.json` + 시드, 결과 CSV, `eval-results-v6.md` 실험 노트 | 문서 | — |
| 3 | 5-11 ★ | **E-2**: 선정 모델 파인튜닝·평가(사람 단위 분리), 규칙 vs 모델 vs 라벨러 일치율. ONNX 내보내기 → `client` `FaceShape.method='model'` | 모델 + CSV | ② 발표 숫자 ② |
| 3 | 5-12 | E-1 미달 시 S-3 데이터 지원(EasyPortrait 학습, FFHQ-Makeup 라벨 0), AI Hub 승인 데이터 반영(조명 30종, 한국인 분포) | 데이터 | ③ |
| 4 | 5-13 | 결과표 취합(`run_all` → `eval-results-v6.md`), 버전별 그래프, 탈락 후보 포함 선정 표 | 표·그래프 | 발표 |
| 4 | 5-14 | 사용자 실험 10명 데이터(퍼널 로그) 수집 지원, 전문가 평정(선택) | 데이터 | ⑥ |

---

## ⑥ 앱·콘텐츠·통합 (TypeScript 화면 + 통합 주인, 로그·버전·지표는 Python 집계) — 브랜치 `app`

**받는 것** 모든 모듈 출력 · **주는 것** `LookTemplate` 10개, 화면·상태 기계, `log()`·`Event`·퍼널, 버전 규칙, 배포 URL · **지금 있는 것** `app.js`(11화면 상태 기계), `looks.js`(초안 10개), `flow.js`, 리뷰·결과 카드, `client/src/core/types.ts`·`log.ts`, `scripts/`, CI

| 주 | # | 할 일 | 산출물 | 기다리는 쪽 |
| --- | --- | --- | --- | --- |
| 1 | 6-1 ★ | 첫 회의 진행: 담당 배정, 화면 3 두 벌, 눈 감음·45° 장, 룩 사진 방법, 통과 기준 "낮으면 뭘 바꿀지", 서버 장애 문구. main 보호 설정(PR·CI 필수) | 결정 목록 | **전원** |
| 1 | 6-2 ★ | `poc/full/app.js` → `client/src/screens/` 상태 기계 뼈대(11화면), `looks.js` → `rules/looks.json` + `looks.ts`. 각 모듈이 옮긴 core를 화면에 연결하는 자리 | 화면 뼈대 | ①②③ |
| 1 | 6-3 ★ | HTTPS 실기기 환경(mkcert 또는 터널) + iOS·Android 각 1대 확보, 폰에서 `npm run dev` 접속 확인 | 환경 | ①②④ |
| 1 | 6-4 | `log()` sink: IndexedDB 저장 + JSONL 내보내기, `Event.ver` 5종 채우기, 결과 카드에 버전 표기. 이벤트 표 확정 | 코드 | 전원 |
| 1 | 6-5 | `rules/score.json`·`looks.json` 버전 필드 규칙, `config.py Versions`와 맞추기 | JSON | ③④ |
| 2 | 6-6 ★ | **룩 참조 사진 10장 확보**(결정한 방법으로) → ④에 전달 | 사진 10장 | ④⑤ |
| 2 | 6-7 ★ | 룩 템플릿 10개 값·제품 5줄·근거 문장 55개·얼굴형 멘트 5개 확정, 색 계열 자동 제안(부위 Lab → 이름) | `rules/looks.json v0.1` | ②③ |
| 2 | 6-8 | 리뷰 진입 시 정면 1장 촬영(②의 게이트 호출), 조명 차 안내 한 줄, 결과 카드 미리 생성(iOS 제스처), 공유 시트 안내, 폰트 폭 말줄임 | 화면 6 코드 | — |
| 2 | 6-9 | 클라이언트 지표 집계 스크립트(`eval/funnel/run.py`와 함께): 프레임 시간·얼굴 놓침·게이트 분포·확인만 이유·복원 성공률·퍼널 | 표 | E-8 |
| 2 | 6-10 | 호출 그래프(클라이언트) 실제 동작 확인표: 모든 "실패 시"가 문서대로 떨어지는지 | 표 | — |
| 3 | 6-11 ★ | **화면 통합**: ①②③④ core를 화면에 연결, 전 흐름 폰에서 끝까지, Service Worker 캐시·로딩 실패 안내 | 통합 앱 | 전원 |
| 3 | 6-12 | 정의서 정정 10건 반영(F-01 4장 용도, 법선 확장, F-02 학습 필수, F-06 소스, F-07 프레임 평균, F-08 손 프레임 제외, 9장 모델 목록, 5-3, 6-5, 3-5) + 팀원 브랜치 문서 병합 | 문서 | — |
| 4 | 6-13 ★ | **사용자 실험 10명**(퍼널 로그 + 인터뷰), E-8 집계 | 표 | 발표 |
| 4 | 6-14 | 배포(정적 + ④ API), 실기기 최종 점검 체크리스트 | URL | — |
| 5 | 6-15 | 통합·안정화, 전 평가 재실행, 데모 시나리오, 발표 슬라이드 4장(시스템 그림·평가 틀·선정 표·운영 숫자) + 발표 숫자 3개 | 발표 자료 | 전원 |

---

## 한눈에: 누가 누구를 기다리나

```
1주차   ⑤ 촬영 세션 ──────────────▶ ③ E-1 · ⑤ E-2 기준선 · ④ E-3 · ①④ 색 변동
        ① flow.ts  ② guides/gate.ts  ③ score.ts ─▶ ⑥ 화면 뼈대 연결
        ③ score_cli.mjs ──────────▶ ⑤ eval/score 첫 실행
        ⑥ 룩 사진 방법 결정 ───────▶ ⑥ 사진 확보(2주) ─▶ ④ S-1 확정 · E-3 · LoRA
        ② CaptureBundle ───────────▶ ③ 프레임 평균·손 제외
2주차   ① 눈 흰자 · 색 변동 ───────▶ ③ S-4 색 보정 선정
        ④ 화장 레이어 ─────────────▶ ② 완성본 원본+레이어(3주)
        ⑥ looks.json v0.1 ─────────▶ ② 템플릿 교체 · ③ 조화 범위
3주차   ③ E-1 결과 ────────────────▶ (미달 시) ③⑤ S-3 부위 영역
        ⑤ E-2 모델 ONNX ───────────▶ ② FaceShape.method='model'
4주차   ⑥ 사용자 실험 ─────────────▶ E-8 퍼널 · 발표
```

가장 긴 줄은 **⑤ 촬영 세션**과 **⑥ 룩 사진**이다. 이 둘이 1주차에 안 끝나면 발표 숫자 세 개가 전부 밀린다.
