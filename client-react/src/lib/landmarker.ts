/**
 * MediaPipe 얼굴 랜드마커 불러오기. 촬영 화면과 임시 페이지가 같이 쓴다.
 * 모델: 로컬 사본(public/models/, 저장소에 안 넣음)이 있으면 그것, 없으면 MediaPipe 공식 CDN.
 * GPU 가 안 되면 CPU.
 *
 * 본 앱(support-yr-makeup/client/src/screens/landmarker.ts)에서 그대로 가져왔고, **wasm 자리만 바꿨다.**
 * 본 앱은 빌드할 때 `vite.config.ts` 의 mediapipe-wasm 플러그인이 node_modules 의 wasm 을 dist 로
 * 복사해 준다. 이 레포에서는 `vite.config.ts` 를 건드리지 말라고 되어 있어서 그 플러그인을 넣을 수 없고,
 * wasm 이 32MB 라 public/ 에 넣어 저장소에 올릴 것도 아니다 → **빌드본은 jsDelivr 에서 받아온다.**
 * (dev 는 본 앱과 똑같이 node_modules 를 그대로 열어 쓴다.)
 * 나중에 vite.config.ts 를 맡은 사람이 플러그인을 넣으면 아래 한 줄을 본 앱 모양으로 되돌리면 된다.
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/** wasm: dev 는 node_modules 그대로, 빌드는 jsDelivr. 판(0.10.35)은 package.json 과 같아야 한다 */
const WASM_BASE = import.meta.env.DEV
  ? "/node_modules/@mediapipe/tasks-vision/wasm"
  : "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
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
