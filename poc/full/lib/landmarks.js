// 화면 4 core.js에서 가져온 랜드마크 표·크롭 박스 (화면 5 결과 사진 크롭에 재사용)
import { PART_ORIENT } from './score.js';
// ---------- 크롭 박스 ----------
export const LM = {
  eyeA: { outer: 33, inner: 133, upper: [33, 246, 161, 160, 159, 158, 157, 173, 133], lower: [33, 7, 163, 144, 145, 153, 154, 155, 133], iris: [468, 469, 470, 471, 472] },
  eyeB: { outer: 263, inner: 362, upper: [263, 466, 388, 387, 386, 385, 384, 398, 362], lower: [263, 249, 390, 373, 374, 380, 381, 382, 362], iris: [473, 474, 475, 476, 477] },
  browA: { upper: [70, 63, 105, 66, 107], lower: [46, 53, 52, 65, 55] },
  browB: { upper: [300, 293, 334, 296, 336], lower: [276, 283, 282, 295, 285] },
  lipsOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  cheekA: 50, cheekB: 280, faceL: 234, faceR: 454, chin: 152, forehead: 10, noseTip: 1, glabella: 168,
  noseBridge: [6, 197, 195, 5],
  jaw: [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454],
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const PART_POINTS = {
  brow: [...LM.browA.upper, ...LM.browA.lower, ...LM.browB.upper, ...LM.browB.lower, LM.eyeA.outer, LM.eyeB.outer],
  liner: [...LM.eyeA.upper, ...LM.eyeB.upper], shadow: [...LM.eyeA.upper, ...LM.eyeB.upper, ...LM.browA.lower, ...LM.browB.lower],
  lip: LM.lipsOuter, cheek: [LM.cheekA, LM.cheekB, LM.faceL, LM.faceR], contour: [...LM.jaw, LM.glabella],
};

/** 부위별 크롭 박스(픽셀). aspect = 프레임 가로/세로. 눈 단계: 양쪽 눈 끝에서 끝 + 여백 15%. 입술·볼·쉐딩: 부위 2~3배 */
export function cropSpec(partId, pts, aspect) {
  const P = (i) => pts[i];
  const faceW = dist(P(LM.faceL), P(LM.faceR));
  let cx, cy, w, h;
  if (PART_ORIENT[partId] === 'landscape') {
    const ids = partId === 'brow' ? [LM.eyeA.outer, LM.eyeB.outer, ...LM.browA.upper, ...LM.browB.upper] : [LM.eyeA.outer, LM.eyeB.outer];
    const xs = ids.map((i) => P(i).x), ys = ids.map((i) => P(i).y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    w = (maxX - minX) * 1.3; cx = (minX + maxX) / 2;
    const eyeY = (P(LM.eyeA.outer).y + P(LM.eyeB.outer).y) / 2;
    cy = partId === 'brow' ? (eyeY + Math.min(...ys)) / 2 : eyeY;
    h = w / aspect;
  } else if (partId === 'lip') {
    const xs = LM.lipsOuter.map((i) => P(i).x), ys = LM.lipsOuter.map((i) => P(i).y);
    const lw = Math.max(...xs) - Math.min(...xs);
    cx = (Math.max(...xs) + Math.min(...xs)) / 2; cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    w = lw * 2.5; h = w / aspect;   // 입 벌림(높이)으로 박스를 키우지 않는다 — 확인받기는 입 다문 상태가 전제
  } else if (partId === 'cheek') {
    w = faceW * 1.15; cx = (P(LM.faceL).x + P(LM.faceR).x) / 2; cy = (P(LM.cheekA).y + P(LM.cheekB).y) / 2; h = w / aspect;
  } else { // contour: 미간~턱 아래
    const top = P(LM.glabella).y, bottom = P(LM.chin).y + faceW * 0.15;
    h = bottom - top; w = h * aspect; if (w < faceW * 1.25) { w = faceW * 1.25; h = w / aspect; }
    cx = (P(LM.faceL).x + P(LM.faceR).x) / 2; cy = (top + bottom) / 2;
  }
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** 부위 랜드마크가 전부 프레임 안에 있나 (여백 2%) */
export function partVisible(partId, pts, frameW, frameH) {
  const mx = frameW * 0.02, my = frameH * 0.02;
  return PART_POINTS[partId].every((i) => pts[i].x > mx && pts[i].x < frameW - mx && pts[i].y > my && pts[i].y < frameH - my);
}
export function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

/** 회전 행렬 → yaw/pitch/roll (deg). MediaPipe facialTransformationMatrix (4x4 column-major) */
export function anglesFromMatrix(m) {
  const r00 = m[0], r10 = m[1], r20 = m[2], r21 = m[6], r22 = m[10];
  const pitch = Math.atan2(-r20, Math.hypot(r21, r22)) * 180 / Math.PI;   // 위아래
  const yaw = Math.atan2(r10, r00) * 180 / Math.PI;                         // 좌우 (mediapipe 축 기준 근사)
  const roll = Math.atan2(r21, r22) * 180 / Math.PI;
  return { yaw, pitch, roll };
}
/** 랜드마크만으로 yaw/pitch 근사 (행렬 없을 때): 코끝 위치 비율 */
export function anglesFromLandmarks(pts) {
  const l = pts[LM.faceL], r = pts[LM.faceR], n = pts[LM.noseTip], top = pts[LM.forehead], chin = pts[LM.chin];
  const yaw = ((n.x - l.x) / (r.x - l.x) - 0.5) * 90;
  const pitch = ((n.y - top.y) / (chin.y - top.y) - 0.55) * 90;
  return { yaw, pitch, roll: Math.atan2(r.y - l.y, r.x - l.x) * 180 / Math.PI };
}

