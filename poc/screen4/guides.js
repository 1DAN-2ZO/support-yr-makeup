// 부위별 GuideSet 생성 — 선만(면 채우기 없음), 숫자 라벨 없음. 좌표는 프레임 픽셀.
// 템플릿 값(각도·mm)은 룩 템플릿 고정값이고, 위치·크기만 내 랜드마크에 맞춘다.
import { LM } from './core.js';

export const TEMPLATE = {
  liner: { wingAngle: 30, wingMm: 4, thickMm: 1.2 },
  brow: { archRatio: 0.65, tailMm: 3 },
  shadow: { rangeRatio: 0.55 },
  lip: { offsetMm: 0.5 },
  cheek: { rx: 0.11, ry: 0.07, tilt: -25 },
  contour: { faceShape: 'round' },
};
const IRIS_MM = 11.7;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** 홍채 지름(px) → px/mm */
export function pxPerMm(pts) {
  const dA = Math.hypot(pts[469].x - pts[471].x, pts[469].y - pts[471].y);
  const dB = Math.hypot(pts[474].x - pts[476].x, pts[474].y - pts[476].y);
  return ((dA + dB) / 2) / IRIS_MM;
}
/** EAR: 눈 감김 판정 */
export function eyeClosed(pts, eye) {
  const u = eye === 'A' ? [159, 158] : [386, 385], l = eye === 'A' ? [145, 153] : [374, 380], c = eye === 'A' ? [33, 133] : [263, 362];
  const ear = (Math.hypot(pts[u[0]].x - pts[l[0]].x, pts[u[0]].y - pts[l[0]].y) + Math.hypot(pts[u[1]].x - pts[l[1]].x, pts[u[1]].y - pts[l[1]].y)) / (2 * Math.hypot(pts[c[0]].x - pts[c[1]].x, pts[c[0]].y - pts[c[1]].y));
  return ear < 0.15;
}
function ellipse(c, rx, ry, deg, n = 28) {
  const t = deg * Math.PI / 180, out = [];
  for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI, x = rx * Math.cos(a), y = ry * Math.sin(a); out.push({ x: c.x + x * Math.cos(t) - y * Math.sin(t), y: c.y + x * Math.sin(t) + y * Math.cos(t) }); }
  return out;
}

/** @returns {{polylines:[{pts,style}], regions:[{pts,style:'outline-only'}], labels:[{text,anchor}], closed:{A,B}}} */
export function buildGuide(partId, pts, tpl = TEMPLATE) {
  const P = (i) => pts[i], mm = pxPerMm(pts);
  const g = { partId, polylines: [], regions: [], labels: [], closed: { A: eyeClosed(pts, 'A'), B: eyeClosed(pts, 'B') } };
  const faceW = len(sub(P(LM.faceR), P(LM.faceL)));
  if (partId === 'liner') {
    for (const [eye, side] of [[LM.eyeA, 'A'], [LM.eyeB, 'B']]) {
      const lid = eye.upper.map(P);
      g.polylines.push({ pts: lid, style: 'dash' });                        // 속눈썹 선 (눈 감으면 눈꺼풀 기준 — 같은 점)
      const outer = P(eye.outer), inner = P(eye.inner);
      const v = norm(sub(outer, inner)), a = tpl.liner.wingAngle * Math.PI / 180;
      const dir = norm(add(mul(v, Math.cos(a)), { x: 0, y: -Math.sin(a) }));
      g.polylines.push({ pts: [outer, add(outer, mul(dir, tpl.liner.wingMm * mm))], style: 'solid' });   // 꼬리 선
    }
    g.polylines.push({ pts: [P(LM.eyeA.outer), P(LM.eyeB.outer)], style: 'ref' });                      // 두 눈 사이 수평 기준선
  } else if (partId === 'brow') {
    for (const b of [LM.browA, LM.browB]) {
      const up = b.upper.map(P), lo = b.lower.map(P);
      g.regions.push({ pts: [...up, ...lo.slice().reverse()], style: 'outline-only' });
      const start = up[up.length - 1], tail = up[0];                    // 안쪽 시작 → 바깥 꼬리 (인덱스가 바깥→안쪽 순)
      const archI = Math.round((up.length - 1) * (1 - tpl.brow.archRatio));
      g.polylines.push({ pts: [start], style: 'dot' }); g.polylines.push({ pts: [up[archI]], style: 'dot' });
      const tailDir = norm(sub(tail, up[1]));
      g.polylines.push({ pts: [tail, add(tail, mul(tailDir, tpl.brow.tailMm * mm))], style: 'solid' });   // 꼬리 연장
    }
    const yA = Math.min(...LM.browA.upper.map((i) => P(i).y)), yB = Math.min(...LM.browB.upper.map((i) => P(i).y));
    g.polylines.push({ pts: [{ x: P(LM.browA.upper[0]).x, y: yA }, { x: P(LM.browB.upper[0]).x, y: yB }], style: 'ref' });   // 좌우 높이 기준선
  } else if (partId === 'shadow') {
    for (const [eye, brow] of [[LM.eyeA, LM.browA], [LM.eyeB, LM.browB]]) {
      const lid = eye.upper.map(P), browLo = brow.lower.map(P);
      const top = lid.map((p, i) => { const q = browLo[Math.min(browLo.length - 1, Math.round(i / (lid.length - 1) * (browLo.length - 1)))]; return mix(p, q, tpl.shadow.rangeRatio); });
      g.regions.push({ pts: [...lid, ...top.slice().reverse()], style: 'outline-only' });
      const outer = P(eye.outer), inner = P(eye.inner), c = mix(inner, outer, 0.5), dir = norm(sub(outer, inner));
      const m = mix(c, top[Math.floor(top.length / 2)], 0.5);
      g.polylines.push({ pts: [m, add(m, mul(dir, faceW * 0.08))], style: 'arrow' });                   // 눈꼬리 쪽으로 진하게
    }
  } else if (partId === 'lip') {
    const lip = LM.lipsOuter.map(P), c = lip.reduce((a, p) => add(a, mul(p, 1 / lip.length)), { x: 0, y: 0 });
    const off = tpl.lip.offsetMm * mm;
    g.regions.push({ pts: lip.map((p) => add(p, mul(norm(sub(p, c)), off))), style: 'outline-only' });   // 경계선 (오버 오프셋)
  } else if (partId === 'cheek') {
    for (const [cheek, side, sign] of [[LM.cheekA, LM.faceL, -1], [LM.cheekB, LM.faceR, 1]]) {
      const c = mix(P(cheek), P(side), 0.25);
      g.regions.push({ pts: ellipse(c, faceW * tpl.cheek.rx, faceW * tpl.cheek.ry, sign * tpl.cheek.tilt), style: 'outline-only' });
      const dir = norm({ x: sign, y: -0.5 });
      g.polylines.push({ pts: [c, add(c, mul(dir, faceW * 0.1))], style: 'arrow' });                     // 관자놀이 방향
    }
  } else if (partId === 'contour') {
    // 얼굴형 규칙(둥근형 예시): 턱선·광대 아래 쉐딩, 광대 위 하이라이트. 랜드마크 근사(법선 맵 없음)
    for (const [cheek, side, sign] of [[LM.cheekA, LM.faceL, -1], [LM.cheekB, LM.faceR, 1]]) {
      const under = add(mix(P(cheek), P(side), 0.35), { x: 0, y: faceW * 0.06 });
      g.regions.push({ pts: ellipse(under, faceW * 0.13, faceW * 0.05, sign * -30), style: 'outline-only' });
      const above = add(mix(P(cheek), P(side), 0.2), { x: 0, y: -faceW * 0.05 });
      g.regions.push({ pts: ellipse(above, faceW * 0.09, faceW * 0.035, sign * -20), style: 'outline-only', kind: 'highlight' });
      g.labels.push({ text: '쉐딩', anchor: add(under, { x: 0, y: faceW * 0.08 }) });
      g.labels.push({ text: '하이라이트', anchor: add(above, { x: 0, y: -faceW * 0.05 }) });
    }
    const jaw = LM.jaw.map(P);
    g.polylines.push({ pts: jaw.slice(2, 7), style: 'dash' }); g.polylines.push({ pts: jaw.slice(14, 19), style: 'dash' });   // 턱선 양옆 쉐딩 선 (턱 끝 제외)
    g.polylines.push({ pts: LM.noseBridge.map(P), style: 'dash', kind: 'highlight' });                       // 콧대 하이라이트
  }
  return g;
}
