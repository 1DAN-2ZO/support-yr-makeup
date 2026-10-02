/**
 * MediaPipe 얼굴 랜드마커 불러오기. 프로브와 화면 1(촬영)·복원이 같이 쓴다.
 * 모델: 로컬 사본(client/public/models/, 저장소에 안 넣음)이 있으면 그것, 없으면 MediaPipe 공식 CDN.
 * GPU 가 안 되면 CPU.
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/** wasm: dev 는 node_modules 그대로, 빌드는 vite.config.ts 의 mediapipe-wasm 플러그인이 dist 에 복사한 곳 */
const WASM_BASE = import.meta.env.DEV ? "/node_modules/@mediapipe/tasks-vision/wasm" : `${import.meta.env.BASE_URL}mediapipe/wasm`;
const LOCAL_MODEL = "/models/face_landmarker.task";
const CDN_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/**
 * blendshapes: 표정 계수·3D 변환행렬까지 뽑을지. 기본 true(기존 동작 그대로) — 화면 1·4·복원처럼 표정 게이트·자세
 * 보정에 실제로 쓰는 곳은 그대로 둔다. false로 부르면 랜드마크만 뽑아 추론이 가벼워진다 — 2-b AR(fullrender.ts)처럼
 * 둘 다 안 읽는 곳에서만 꺼서 쓴다(#173: 고개를 크게 움직이면 느리게 따라오던 문제, 안 쓰는 출력을 매 프레임 계산하던 게 원인 후보).
 */
export async function createLandmarker(mode: "VIDEO" | "IMAGE", opt?: { blendshapes?: boolean }): Promise<FaceLandmarker> {
  const blendshapes = opt?.blendshapes ?? true;
  const files = await FilesetResolver.forVisionTasks(WASM_BASE);
  const modelPath = await fetch(LOCAL_MODEL, { method: "HEAD" })
    .then((r) => (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html") ? LOCAL_MODEL : CDN_MODEL))
    .catch(() => CDN_MODEL);
  const opts = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: modelPath, delegate },
    runningMode: mode, numFaces: 1, outputFaceBlendshapes: blendshapes, outputFacialTransformationMatrixes: blendshapes,
  });
  return FaceLandmarker.createFromOptions(files, opts("GPU")).catch(() => FaceLandmarker.createFromOptions(files, opts("CPU")));
}

/**
 * 저장해 둔 쌩얼 사진에서 랜드마크를 다시 찾는다 (세션 복원, core/restore.ts).
 * 못 찾으면 null — 그러면 촬영부터 다시.
 */
export async function landmarksFromImage(blob: Blob): Promise<{ lm: { x: number; y: number }[]; w: number; h: number; expression: Record<string, number> | null } | null> {
  const bmp = await createImageBitmap(blob);
  const lmk = await createLandmarker("IMAGE");
  try {
    const res = lmk.detect(bmp);
    const raw = res.faceLandmarks[0];
    if (!raw) return null;
    // 표정 점수도 같이 — 복원한 기준의 expression (#177). draft 에는 없다
    const cats = res.faceBlendshapes[0]?.categories ?? [];
    const expression = cats.length ? Object.fromEntries(cats.map((c) => [c.categoryName, c.score])) : null;
    return { lm: raw.map((p) => ({ x: p.x * bmp.width, y: p.y * bmp.height })), w: bmp.width, h: bmp.height, expression };
  } finally {
    lmk.close();
    bmp.close();
  }
}
