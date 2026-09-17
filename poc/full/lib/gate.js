// 화면 4 실시간 테두리 — 순수 로직 (브라우저·Node 공용)
// 진행 칩, 방향 안내, 품질 게이트(가장 먼저 걸린 조건 하나), 안정 프레임, 자리 비움, 떨림 제거, 크롭 박스, 세션 draft

export const PART_IDS = ['brow', 'liner', 'shadow', 'lip', 'cheek', 'contour'];
export const PART_NAME = { brow: '눈썹', liner: '아이라이너', shadow: '섀도우', lip: '입술', cheek: '볼터치', contour: '쉐딩·하이라이트' };
export const PART_ORIENT = { brow: 'landscape', liner: 'landscape', shadow: 'landscape', lip: 'portrait', cheek: 'portrait', contour: 'portrait' };
export const STATUS_LABEL = { not_started: '미시작', in_progress: '진행 중', passed: '완료', check_only: '확인만', skipped: '건너뜀' };

// ---------- 진행 칩 ----------
export function chipText(part) {
  const s = part.status === 'passed' && typeof part.score === 'number' ? ` ${part.score}` : '';
  return `${PART_NAME[part.partId]} · ${STATUS_LABEL[part.status]}${s}`;
}
export function orientationHint(partId, deviceOrientation) {
  const want = PART_ORIENT[partId];
  if (want === deviceOrientation) return null;
  return want === 'landscape' ? '폰을 가로로 돌리세요' : '폰을 세로로 돌리세요';
}

// ---------- 품질 게이트 ----------
export const GATE_ORDER = ['frontal', 'visible', 'hand', 'sharp', 'bright', 'stable'];
export const GATE_TEXT = {
  frontal: '조금만 정면으로', visible: '부위가 다 보이게 해 주세요', visible_eyes: '양쪽 눈이 보이게 해 주세요',
  hand: '손을 내려 주세요', sharp: '흔들려요. 잠시 멈춰 주세요', bright_low: '조금 더 밝은 곳으로', bright_high: '너무 밝아요. 조금 어두운 곳으로',
  stable: '잠시만 그대로', ready: '확인받을 준비 됨', noface: '',
  pose: '처음 찍을 때와 같은 각도로 봐 주세요',   // 기준 촬영과 yaw·pitch 차이 — 유사변환 정합이 감당하는 범위 안에서만 확인받기   // 얼굴 없음: 화면에 문구 없음(테두리만 사라짐)
};
export const GATE_LIMITS = { yaw: 15, pitch: 10, dYaw: 8, dPitch: 6, sharpMin: 30, brightTol: 12, stableFrames: 5 };

/**
 * m = { faceDetected, yaw, pitch, visible, handOverlap, sharpness, foreheadL, baselineL(null이면 밝기 조건 생략), stableCount, partId }
 * → { ok, firstFail, text }  (가장 먼저 걸린 조건 하나만)
 */
export function evaluateGate(m, limits = GATE_LIMITS) {
  if (!m.faceDetected) return { ok: false, firstFail: 'noface', text: GATE_TEXT.noface };
  if (Math.abs(m.yaw) > limits.yaw || Math.abs(m.pitch) > limits.pitch) return { ok: false, firstFail: 'frontal', text: GATE_TEXT.frontal };
  if (typeof m.baseYaw === 'number' && (Math.abs(m.yaw - m.baseYaw) > limits.dYaw || Math.abs(m.pitch - m.basePitch) > limits.dPitch)) return { ok: false, firstFail: 'pose', text: GATE_TEXT.pose };
  if (!m.visible) return { ok: false, firstFail: 'visible', text: PART_ORIENT[m.partId] === 'landscape' ? GATE_TEXT.visible_eyes : GATE_TEXT.visible };
  if (m.handOverlap) return { ok: false, firstFail: 'hand', text: GATE_TEXT.hand };
  if (typeof m.sharpness === 'number' && m.sharpness < limits.sharpMin) return { ok: false, firstFail: 'sharp', text: GATE_TEXT.sharp };
  if (typeof m.baselineL === 'number' && typeof m.foreheadL === 'number') {
    const d = m.foreheadL - m.baselineL;
    if (d < -limits.brightTol) return { ok: false, firstFail: 'bright', text: GATE_TEXT.bright_low };
    if (d > limits.brightTol) return { ok: false, firstFail: 'bright', text: GATE_TEXT.bright_high };
  }
  if ((m.stableCount ?? 0) < limits.stableFrames) return { ok: false, firstFail: 'stable', text: GATE_TEXT.stable };
  return { ok: true, firstFail: null, text: GATE_TEXT.ready };
}

/** 연속 프레임 카운터: 안정 조건 이전 단계가 전부 통과한 프레임이 이어질 때만 증가 */
export class StabilityCounter {
  constructor() { this.count = 0; }
  push(preOk) { this.count = preOk ? this.count + 1 : 0; return this.count; }
  reset() { this.count = 0; }
}

/** 자리 비움: 3초 이상 미검출 → away. UI 없음, 내부 상태만 */
export class PresenceTracker {
  constructor(awayMs = 3000) { this.awayMs = awayMs; this.lastSeen = null; this.state = 'present'; }
  update(detected, now) {
    if (detected) { this.lastSeen = now; this.state = 'present'; }
    else if (this.lastSeen == null || now - this.lastSeen >= this.awayMs) this.state = 'away';
    return this.state;
  }
}

/** 떨림 제거: 랜드마크 지수 이동 평균. 얼굴을 잃으면 reset */
export class Smoother {
  constructor(alpha = 0.5) { this.alpha = alpha; this.prev = null; }
  smooth(pts) {
    if (!this.prev || this.prev.length !== pts.length) { this.prev = pts.map((p) => ({ ...p })); return this.prev; }
    const a = this.alpha;
    this.prev = pts.map((p, i) => ({ x: this.prev[i].x + a * (p.x - this.prev[i].x), y: this.prev[i].y + a * (p.y - this.prev[i].y), z: p.z }));
    return this.prev;
  }
  reset() { this.prev = null; }
}

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
export const PART_POINTS = {
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
    const lw = Math.max(...xs) - Math.min(...xs), lh = Math.max(...ys) - Math.min(...ys);
    cx = (Math.max(...xs) + Math.min(...xs)) / 2; cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    w = lw * 2.5; h = w / aspect; if (h < lh * 3) { h = lh * 3; w = h * aspect; }
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

// ---------- 세션 draft ----------
export function createSession(lookId = 'smoky') {
  return { lookId, currentPart: 'brow', parts: PART_IDS.map((partId) => ({ partId, status: partId === 'brow' ? 'in_progress' : 'not_started', score: null, captured: null })), baselineL: null, updatedAt: Date.now() };
}
export function setCurrent(session, partId) {
  const parts = session.parts.map((p) => {
    if (p.partId === partId) return { ...p, status: p.status === 'not_started' ? 'in_progress' : p.status };
    if (p.status === 'in_progress') return { ...p, status: 'not_started' };
    return p;
  });
  return { ...session, currentPart: partId, parts, updatedAt: Date.now() };
}
/** 확인받기 → 즉시 촬영 → (화면 5에서 "다음" 눌렀다고 가정) 완료. 쉐딩·하이라이트는 확인만 */
export function markCaptured(session, partId, uri) {
  const parts = session.parts.map((p) => p.partId === partId ? { ...p, status: partId === 'contour' ? 'check_only' : 'passed', captured: uri } : p);
  return { ...session, parts, updatedAt: Date.now() };
}
export function nextPart(session) {
  const i = PART_IDS.indexOf(session.currentPart);
  return PART_IDS.slice(i + 1).concat(PART_IDS.slice(0, i)).find((id) => ['not_started', 'in_progress'].includes(session.parts.find((p) => p.partId === id).status)) || null;
}

// ---------- 색·선명 ----------
export function rgbToL(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const y = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}
/** 라플라시안 분산 (그레이 배열 w×h) */
export function laplacianVar(gray, w, h) {
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
    sum += v; sum2 += v * v; n++;
  }
  const mean = sum / n; return sum2 / n - mean * mean;
}
