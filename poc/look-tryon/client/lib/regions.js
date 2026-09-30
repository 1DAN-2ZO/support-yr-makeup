// 부위별 랜드마크 폴리곤 — app.js(v2 사진 워핑)·app-template.js(템플릿 블렌드)가 공용으로 쓴다.
// 중복 구현 금지, 여기 하나만. 포인트셋 자체는 app.js v2에서 실사용 검증된 값 그대로.

export const EYES = {
  R: { upper: [133, 173, 157, 158, 159, 160, 161, 246, 33] },
  L: { upper: [362, 398, 384, 385, 386, 387, 388, 466, 263] },
};
export const BROW = {
  R: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  L: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
};
export const CHEEK = {
  R: [116, 117, 118, 101, 36, 205, 187, 123],
  L: [345, 346, 347, 330, 266, 425, 411, 352],
};
export const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
export const EYESHADOW_REACH = 0.45;
// 비화장 기준(전역 편향 추정용) — server/app/regions.py FOREHEAD와 같은 값, 1:1 복제.
export const FOREHEAD = [10, 109, 108, 151, 337, 338];

export const REGION_KEYS = ["browR", "browL", "eyeR", "eyeL", "lips", "cheekR", "cheekL"];
export const TRACKED_IDX = [...new Set([...BROW.R, ...BROW.L, ...EYES.R.upper, ...EYES.L.upper, ...LIPS, ...CHEEK.R, ...CHEEK.L])];

function landmarkPx(landmarks, idx, w, h) {
  const p = landmarks[idx];
  return [p.x * w, p.y * h];
}
export function centroid(pts) {
  const n = pts.length;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
}
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

/** 정규화 랜드마크 + 이미지 크기 -> 부위별 폴리곤(픽셀) */
export function buildRegions(lm, w, h) {
  const P = (i) => landmarkPx(lm, i, w, h);
  const browR = BROW.R.map(P), browL = BROW.L.map(P);
  const browRC = centroid(browR), browLC = centroid(browL);
  const lidR = EYES.R.upper.map(P), lidL = EYES.L.upper.map(P);
  const eyeR = [...lidR, ...lidR.map((p) => lerp(p, browRC, EYESHADOW_REACH)).reverse()];
  const eyeL = [...lidL, ...lidL.map((p) => lerp(p, browLC, EYESHADOW_REACH)).reverse()];
  return { browR, browL, eyeR, eyeL, lips: LIPS.map(P), cheekR: CHEEK.R.map(P), cheekL: CHEEK.L.map(P) };
}

/** 이마 폴리곤(픽셀) — buildRegions와 분리: 화장 부위가 아니라 편향 추정 전용이라 REGION_KEYS엔 안 넣는다. */
export function buildForehead(lm, w, h) {
  return FOREHEAD.map((i) => landmarkPx(lm, i, w, h));
}
