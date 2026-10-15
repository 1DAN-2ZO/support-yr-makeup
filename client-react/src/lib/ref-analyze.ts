/**
 * 올린 참고 사진 한 장 → 색조 팔레트 (2026-10-06).
 *
 * 얼굴 점은 복원이 쓰는 landmarksFromImage 를 그대로 쓴다 (픽셀 좌표로 돌려준다 —
 * core/ref-colors.ts 가 기대하는 규약과 같다). 색을 고르는 규칙은 ref-colors.ts 에 있다.
 *
 * 서버로 보내지 않는다. 전부 이 폰 안에서 끝난다.
 *
 * 본 앱(support-yr-makeup/client/src/screens/ref-analyze.ts)에서 그대로 가져왔고,
 * **불러오는 자리만 바꿨다** — 본 앱의 `@core/*` 별칭이 이 레포에는 없어서 `../core/*` 로 적었고,
 * 얼굴 점은 이 레포가 이미 들고 있는 `lib/landmarker.ts` 의 것을 쓴다 (본 앱과 같은 파일이다).
 * 알맹이(얼마나 줄여서 재는지 · 실패 까닭 셋 · 안내 문구)는 한 글자도 안 바꿨다.
 */

import { refColors } from "@core/ref-colors";
import type { Key } from "../i18n";
import type { RefColors } from "@core/ref-colors";
import { landmarksFromImage } from "./landmarker";

/** 긴 변이 이보다 크면 줄여서 잰다 — 색은 해상도와 상관없고, 큰 사진은 느리다 */
const MAX_SIDE = 900;

export interface RefAnalysis {
  colors: RefColors;
  /** 화면에 보여 줄 참고 사진 (줄인 것) */
  preview: string;
  w: number;
  h: number;
}

export type RefFailure =
  | "noFace"      // 얼굴을 못 찾음
  | "noCanvas"    // 2D 컨텍스트를 못 얻음
  | "noColor";    // 얼굴은 찾았는데 쓸 만한 색이 한 부위도 안 나옴

export async function analyzeRefPhoto(blob: Blob): Promise<RefAnalysis | RefFailure> {
  const found = await landmarksFromImage(blob);
  if (!found) return "noFace";

  const bmp = await createImageBitmap(blob);
  try {
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    if (!g) return "noCanvas";
    g.drawImage(bmp, 0, 0, w, h);
    const im = g.getImageData(0, 0, w, h);
    // 얼굴 점은 원본 크기 기준이라 줄인 만큼 같이 줄인다
    const lm = found.lm.map((p) => ({ x: p.x * (w / found.w), y: p.y * (h / found.h) }));
    const colors = refColors({ data: im.data, w, h }, lm);
    if (!Object.keys(colors).length) return "noColor";
    return { colors, preview: cv.toDataURL("image/jpeg", 0.8), w, h };
  } finally {
    bmp.close();
  }
}

/*
 * 까닭마다 다른 안내 — 글은 `i18n/ko.ts` · `en.ts` 에 있고 여기엔 **열쇠**만 둔다 (2026-10-16).
 * 부르는 쪽(`screens/Upload.tsx`)이 `t(REF_FAIL_TEXT[까닭])` 으로 글자를 꺼낸다.
 */
export const REF_FAIL_TEXT: Record<RefFailure, Key> = {
  noFace: "up.fail.noFace",
  noCanvas: "up.fail.noCanvas",
  noColor: "up.fail.noColor",
};
