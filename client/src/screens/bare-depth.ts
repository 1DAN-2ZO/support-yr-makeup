/**
 * 맨얼굴 사진의 깊이(z) 다시 재기 — 화면 4 눈 부위, 고개를 많이 돌렸을 때 먼 쪽 눈을 입체로 옮기는 데 쓴다 (core/head3d, B안 2026-10-02).
 * 기준(Baseline)에는 x · y 만 있어서, 화면 4 에 들어올 때 쌩얼 사진에서 얼굴 점을 한 번 더 찾아 깊이만 가져온다.
 * MediaPipe z 는 x 와 거의 같은 눈금(사진 폭 기준)이라 맨얼굴 px 로 바꾼다. 못 찾으면 null — 그때는 지금처럼 눈꺼풀 점만
 */

import type { Baseline } from "@core/types";
import { createLandmarker } from "./landmarker";

export async function bareDepth(b: Pick<Baseline, "bareImage" | "w">): Promise<number[] | null> {
  const img = b.bareImage;
  if (!img) return null;
  const bmp = img instanceof Blob ? await createImageBitmap(img) : img;
  const lmk = await createLandmarker("IMAGE");
  try {
    const raw = lmk.detect(bmp).faceLandmarks[0];
    if (!raw) return null;
    // 기준 점은 맨얼굴 사진 px — 사진 폭이 기준 폭과 다르면(줄여 저장) 기준 폭으로 맞춘다
    return raw.map((p) => p.z * b.w);
  } finally {
    lmk.close();
    if (img instanceof Blob) bmp.close();
  }
}
