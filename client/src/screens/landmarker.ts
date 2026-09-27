/**
 * MediaPipe 얼굴 랜드마커 불러오기. 프로브와 화면 1(촬영)·복원이 같이 쓴다.
 * 모델: 로컬 사본(client/public/models/, 저장소에 안 넣음)이 있으면 그것, 없으면 MediaPipe 공식 CDN.
 * GPU 가 안 되면 CPU.
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const LOCAL_MODEL = "/models/face_landmarker.task";
const CDN_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export async function createLandmarker(mode: "VIDEO" | "IMAGE"): Promise<FaceLandmarker> {
  const files = await FilesetResolver.forVisionTasks("/node_modules/@mediapipe/tasks-vision/wasm");
  const modelPath = await fetch(LOCAL_MODEL, { method: "HEAD" })
    .then((r) => (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html") ? LOCAL_MODEL : CDN_MODEL))
    .catch(() => CDN_MODEL);
  const opts = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: modelPath, delegate },
    runningMode: mode, numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
  });
  return FaceLandmarker.createFromOptions(files, opts("GPU")).catch(() => FaceLandmarker.createFromOptions(files, opts("CPU")));
}

/**
 * 저장해 둔 쌩얼 사진에서 랜드마크를 다시 찾는다 (세션 복원, core/restore.ts).
 * 못 찾으면 null — 그러면 촬영부터 다시.
 */
export async function landmarksFromImage(blob: Blob): Promise<{ lm: { x: number; y: number }[]; w: number; h: number } | null> {
  const bmp = await createImageBitmap(blob);
  const lmk = await createLandmarker("IMAGE");
  try {
    const raw = lmk.detect(bmp).faceLandmarks[0];
    if (!raw) return null;
    return { lm: raw.map((p) => ({ x: p.x * bmp.width, y: p.y * bmp.height })), w: bmp.width, h: bmp.height };
  } finally {
    lmk.close();
    bmp.close();
  }
}
