// 전체 흐름 — 순수 로직 (화면 순서, 촬영 4장 게이트, 세션, 화면 6 변환)
import { GATE_LIMITS } from './gate.js';
import { LOOK_PART_ORDER } from './looks.js';

export const SCREENS = ['consent', 'denied', 'capture', 'processing', 'looks', 'fullrender', 'guide', 'live', 'result', 'review', 'done'];
export const SCREEN_NAME = { consent: '1 동의', denied: '이용 불가', capture: '1 촬영', processing: '서버 처리', looks: '2 룩', fullrender: '2-b 전체 완성 예상', guide: '3 완성본', live: '4 실시간 테두리', result: '5 결과', review: '6 전체 리뷰', done: '끝' };
export const PART_ORDER = [...LOOK_PART_ORDER, 'contour'];

// ---------- 화면 1: 촬영 4장 ----------
export const SHOTS = [
  { id: 'front_open', name: '정면 · 눈 뜸', yaw: [-10, 10], eyes: 'open' },
  { id: 'front_closed', name: '정면 · 눈 감음', yaw: [-10, 10], eyes: 'closed' },
  { id: 'left_45', name: '왼쪽 45°', yaw: [-60, -22], eyes: 'open' },
  { id: 'right_45', name: '오른쪽 45°', yaw: [22, 60], eyes: 'open' },
];
export const SERVER_SHOTS = ['front_open', 'left_45', 'right_45'];   // 법선 정밀화용 3장. 눈 감음은 폰에만
export const SHOT_TEXT = { none: '', front: '조금만 정면으로', left: '고개를 왼쪽으로 조금 더', right: '고개를 오른쪽으로 조금 더', back: '너무 돌렸어요. 조금만 돌아오세요', open: '눈을 떠 주세요', close: '눈을 감아 주세요', near: '조금 더 가까이', far: '조금 멀리', sharp: '흔들려요. 잠시 멈춰 주세요', bright_low: '조금 더 밝은 곳으로', bright_high: '너무 밝아요. 조금 어두운 곳으로', stable: '잠시만 그대로', ready: '찍을게요' };
/**
 * 촬영 조건: 안 맞는 것 하나만 한 줄. 순서: 얼굴 → 각도 → 눈 상태 → 얼굴 크기 → 선명 → 밝기 → 안정
 * m = { faceDetected, yaw, pitch, closedA, closedB, faceRatio(얼굴 폭/프레임 폭), sharpness, foreheadL, baselineL, stableCount }
 */
export function shotGate(shotId, m, limits = GATE_LIMITS) {
  const shot = SHOTS.find((s) => s.id === shotId);
  const fail = (k, key) => ({ ok: false, firstFail: k, text: SHOT_TEXT[key || k] });
  if (!m.faceDetected) return fail('noface', 'none');
  if (m.yaw < shot.yaw[0] || m.yaw > shot.yaw[1]) {
    if (shot.id.startsWith('front')) return fail('angle', 'front');
    if (shot.id === 'left_45') return fail('angle', m.yaw > shot.yaw[1] ? 'left' : 'back');
    return fail('angle', m.yaw < shot.yaw[0] ? 'right' : 'back');
  }
  if (Math.abs(m.pitch) > limits.pitch + 5) return fail('angle', 'front');
  const closed = m.closedA && m.closedB, open = !m.closedA && !m.closedB;
  if (shot.eyes === 'open' && !open) return fail('eyes', 'open');
  if (shot.eyes === 'closed' && !closed) return fail('eyes', 'close');
  if (typeof m.faceRatio === 'number') { if (m.faceRatio < 0.28) return fail('size', 'near'); if (m.faceRatio > 0.75) return fail('size', 'far'); }
  if (typeof m.sharpness === 'number' && m.sharpness < limits.sharpMin) return fail('sharp');
  if (typeof m.baselineL === 'number' && typeof m.foreheadL === 'number') {
    const d = m.foreheadL - m.baselineL; if (d < -limits.brightTol) return fail('bright', 'bright_low'); if (d > limits.brightTol) return fail('bright', 'bright_high');
  }
  if ((m.stableCount ?? 0) < limits.stableFrames) return fail('stable');
  return { ok: true, firstFail: null, text: SHOT_TEXT.ready };
}
export function nextShot(shots) { return SHOTS.find((s) => !shots[s.id])?.id || null; }

// ---------- 세션 ----------
export function createSession() {
  return {
    screen: 'consent', consent: false, shots: {}, baseline: null, faceShape: null, lookId: null, currentPart: null,
    parts: PART_ORDER.map((partId) => ({ partId, status: 'not_started', score: null, diagnosisCodes: [], diagnosis: '', checkReason: null, attempts: 0, captured: null, lrIndex: null, metrics: {} })),
    startedAt: Date.now(),
  };
}
export function setScreen(s, screen) { return { ...s, screen }; }
export function setCurrentPart(s, partId) {
  return { ...s, currentPart: partId, parts: s.parts.map((p) => p.partId === partId ? { ...p, status: p.status === 'not_started' ? 'in_progress' : p.status } : p.status === 'in_progress' ? { ...p, status: 'not_started' } : p) };
}
/** 화면 5 다음: 점수 낮아도 passed, 확인만은 check_only. 결과는 최신으로 덮어쓰기(attempts+1) */
export function applyResult(s, partId, r) {
  const status = partId === 'contour' || r.decision.status === 'check_only' ? 'check_only' : 'passed';
  return { ...s, parts: s.parts.map((p) => p.partId === partId ? { ...p, status, score: status === 'passed' ? r.score : null, diagnosisCodes: r.codes || [], diagnosis: r.oneLiner || '', checkReason: r.decision.reason || null, attempts: p.attempts + 1, lrIndex: r.metrics?.lrIndex || null, metrics: r.metrics || {} } : p) };
}
export function applySkip(s, partId) { return { ...s, parts: s.parts.map((p) => p.partId === partId ? { ...p, status: 'skipped', score: null } : p) }; }
export function nextPart(s, after = s.currentPart) {
  const i = PART_ORDER.indexOf(after);
  return PART_ORDER.slice(i + 1).find((id) => ['not_started', 'in_progress'].includes(s.parts.find((p) => p.partId === id).status)) || null;
}
export function allDone(s) { return s.parts.every((p) => ['passed', 'check_only', 'skipped'].includes(p.status)); }
/** 화면 6 합산 입력 (review.js computeSummary 형식) */
export function toReviewParts(s) {
  return s.parts.map((p) => ({ partId: p.partId, status: p.status, score: p.score, diagnosis: p.diagnosis, diagnosisCodes: p.diagnosisCodes, checkReason: p.checkReason, lrIndex: p.lrIndex, metrics: p.metrics, attempts: p.attempts }));
}
/** 세션 draft 저장용 (이미지는 뺀다) */
export function stripImages(s) { return { ...s, shots: Object.fromEntries(Object.entries(s.shots).map(([k, v]) => [k, !!v])), baseline: s.baseline ? { foreheadL: s.baseline.foreheadL, unit: s.baseline.unit } : null, parts: s.parts.map((p) => ({ ...p, captured: !!p.captured })) }; }
