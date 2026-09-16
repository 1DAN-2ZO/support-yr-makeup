// 가상 화장: 쌩얼 사진 위에 랜드마크 기준으로 화장을 그려 "내 화장" 사진을 만든다 (검증용, 편차를 알고 있는 입력)
import { LM } from './landmarks.js';
import { buildGuide, pxPerMm } from './guides.js';

export const DEFAULTS = {
  liner: { on: true, shiftR: 0, shiftL: 0, angleR: 0, angleL: 0, lenR: 0, lenL: 0, thick: 1.2, gapR: 0, gapL: 0, alpha: 0.9 },
  brow: { on: true, tailR: 1, tailL: 1, alpha: 0.75, over: 0 },
  lip: { on: true, offset: 0.5, offsetLower: 0, offsetUpper: 0, alpha: 0.55 },
  cheek: { on: true, alphaR: 0.35, alphaL: 0.35 },
  shadow: { on: true, alphaR: 0.45, alphaL: 0.45, dir: 'outer' },
  contour: { on: true, alphaR: 0.2, alphaL: 0.2, hi: 0.2 },
};
export const PRESETS = {
  liner: {
    good: { label: '잘 됨', p: {}, expect: [] },
    wing_high_r: { label: '오른쪽 꼬리 위로', p: { angleR: 25, shiftR: 0 }, expect: ['LINER_WING_HIGH_R'] },
    wing_low_l: { label: '왼쪽 꼬리 아래로', p: { angleL: -25 }, expect: ['LINER_WING_LOW_L'] },
    thick: { label: '두껍게', p: { thick: 2.4 }, expect: ['LINER_THICK'] },
    short_r: { label: '오른쪽 꼬리 짧게', p: { lenR: -3 }, expect: ['LINER_WING_SHORT_R'] },
    gap_l: { label: '왼쪽 중간 비움', p: { gapL: 0.5 }, expect: ['LINER_GAP_L'] },
    none: { label: '화장 안 함', p: { on: false }, expect: 'check_only' },
  },
  brow: { good: { label: '잘 됨', p: {}, expect: [] }, tail_short_r: { label: '오른쪽 꼬리 짧게', p: { tailR: 0.45 }, expect: ['BROW_TAIL_SHORT_R'] }, over: { label: '테두리 밖으로', p: { over: 2.5 }, expect: ['BROW_OUT_R', 'BROW_OUT_L'] }, none: { label: '화장 안 함', p: { on: false }, expect: 'check_only' } },
  lip: { good: { label: '잘 됨', p: {}, expect: [] }, out_lower: { label: '아래 경계 밖', p: { offsetLower: 2.2 }, expect: ['LIP_OUT_LOWER'] }, out_upper: { label: '위 경계 밖', p: { offsetUpper: 2.2 }, expect: ['LIP_OUT_UPPER'] }, none: { label: '화장 안 함', p: { on: false }, expect: 'check_only' } },
  cheek: { good: { label: '적당', p: {}, expect: [] }, right_dark: { label: '오른쪽 진하게', p: { alphaR: 0.75, alphaL: 0.3 }, expect: ['CHEEK_LR_DIFF_R'] }, over: { label: '너무 진하게', p: { alphaR: 0.9, alphaL: 0.9 }, expect: ['TONE_OVER'] }, light: { label: '너무 옅게', p: { alphaR: 0.2, alphaL: 0.2 }, expect: ['TONE_UNDER'] }, none: { label: '화장 안 함', p: { on: false }, expect: 'check_only' } },
  shadow: { good: { label: '적당', p: {}, expect: [] }, inner: { label: '안쪽으로 진하게', p: { dir: 'inner' }, expect: ['SHADOW_DIR'] }, left_dark: { label: '왼쪽 진하게', p: { alphaL: 0.85, alphaR: 0.35 }, expect: ['SHADOW_LR_DIFF_L'] }, none: { label: '화장 안 함', p: { on: false }, expect: 'check_only' } },
  contour: { good: { label: '균등', p: {}, expect: [] }, right_dark: { label: '오른쪽 진하게', p: { alphaR: 0.5, alphaL: 0.15 }, expect: ['CONTOUR_LR_R'] }, none: { label: '안 함', p: { on: false }, expect: [] } },
};

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y }), add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y }), mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const norm = (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
const rot = (v, deg) => { const t = deg * Math.PI / 180; return { x: v.x * Math.cos(t) - v.y * Math.sin(t), y: v.x * Math.sin(t) + v.y * Math.cos(t) }; };
function pathPoly(ctx, pts, close = true) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); if (close) ctx.closePath(); }
function ellipsePts(c, rx, ry, deg, n = 40) { const t = deg * Math.PI / 180; return Array.from({ length: n }, (_, i) => { const a = i / n * 2 * Math.PI, x = rx * Math.cos(a), y = ry * Math.sin(a); return { x: c.x + x * Math.cos(t) - y * Math.sin(t), y: c.y + x * Math.sin(t) + y * Math.cos(t) }; }); }

/** @param bare {canvas|img} @param lm 픽셀 랜드마크 @returns canvas (내 화장) */
export function synthesize(bare, lm, partId, params, w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d');
  ctx.drawImage(bare, 0, 0, w, h);
  const p = { ...DEFAULTS[partId], ...params }; if (!p.on) return cv;
  const mm = pxPerMm(lm), P = (i) => lm[i], g = buildGuide(partId, lm);
  const faceW = Math.hypot(P(LM.faceR).x - P(LM.faceL).x, P(LM.faceR).y - P(LM.faceL).y);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (partId === 'liner') {
    for (const [eye, k] of [[LM.eyeA, 'R'], [LM.eyeB, 'L']]) {
      const lid = eye.upper.map(P).slice().reverse();     // 안쪽→바깥쪽
      const outer = P(eye.outer), inner = P(eye.inner), iris = P(eye.iris[0]);
      let n = norm({ x: -(outer.y - inner.y), y: outer.x - inner.x }); if (n.y > 0) n = mul(n, -1);   // + = 위
      const shift = mul(n, p['shift' + k] * mm), thick = p.thick * mm;
      const wingBase = g.polylines.filter((l) => l.style === 'solid')[k === 'R' ? 0 : 1].pts;
      let dir = norm(sub(wingBase[1], wingBase[0])); dir = rot(dir, (k === 'R' ? 1 : -1) * p['angle' + k]);   // +각도 = 화면 위로 (y-down 좌표: 왼쪽 향한 벡터는 +회전이 위)
      const len = Math.max(0.3, (Math.hypot(wingBase[1].x - wingBase[0].x, wingBase[1].y - wingBase[0].y) / mm + p['len' + k])) * mm;
      const pts = lid.map((q) => add(q, shift)); const wingEnd = add(add(outer, shift), mul(dir, len));   // 선 중심 = 속눈썹 선(가이드 밴드 중심)
      const lc = p.color || [22, 14, 14]; ctx.strokeStyle = `rgba(${lc[0]},${lc[1]},${lc[2]},${p.alpha})`; ctx.lineWidth = thick;
      const gap = p['gap' + k];
      if (gap > 0) { const a = Math.floor(pts.length * 0.35), b = Math.ceil(pts.length * (0.35 + gap)); pathPoly(ctx, pts.slice(0, a + 1), false); ctx.stroke(); pathPoly(ctx, [...pts.slice(b), wingEnd], false); ctx.stroke(); }
      else { pathPoly(ctx, [...pts, wingEnd], false); ctx.stroke(); }
    }
  } else if (partId === 'brow') {
    g.regions.forEach((r, i) => {
      const k = i === 0 ? 'R' : 'L', tail = p['tail' + k];
      const xs = r.pts.map((q) => q.x), minX = Math.min(...xs), maxX = Math.max(...xs), span = maxX - minX;
      const c = { x: (minX + maxX) / 2, y: r.pts.reduce((s, q) => s + q.y, 0) / r.pts.length };
      // 테두리 밖 번짐: 위 가장자리는 위로, 아래 가장자리는 아래로, 양 끝은 옆으로 over(mm) 만큼 확장 (중심 기준 확대는 가늘고 긴 눈썹에서 세로 확장이 안 됨)
      const d = p.over * mm, nUp = r.pts.length / 2;
      let poly = r.pts.map((q, j) => { const up = j < nUp; const endL = j === 0 || j === r.pts.length - 1, endR = j === nUp - 1 || j === nUp; const ex = (endL ? -d : 0) + (endR ? d : 0); return { x: q.x + (q.x < c.x ? -Math.abs(ex) : Math.abs(ex)), y: q.y + (up ? -d : d) }; });
      ctx.save(); pathPoly(ctx, poly); ctx.clip();
      // tail 비율만큼만 채움 (R: 바깥쪽이 왼쪽)
      const cut = k === 'R' ? minX + span * (1 - tail) : minX, cutW = span * tail;
      ctx.fillStyle = `rgba(45,28,18,${p.alpha})`; ctx.fillRect(cut, 0, cutW, h); ctx.restore();
    });
  } else if (partId === 'lip') {
    const lip = LM.lipsOuter.map(P), c = lip.reduce((a, q) => add(a, mul(q, 1 / lip.length)), { x: 0, y: 0 });
    const poly = lip.map((q) => { const extra = (q.y < c.y ? p.offsetUpper : p.offsetLower); return add(q, mul(norm(sub(q, c)), (p.offset + extra) * mm)); });
    const pc = p.color || [190, 40, 70]; ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(${pc[0]},${pc[1]},${pc[2]},${p.alpha})`; pathPoly(ctx, poly); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
  } else if (partId === 'cheek') {
    g.regions.forEach((r, i) => {
      const k = i === 0 ? 'R' : 'L', xs = r.pts.map((q) => q.x), ys = r.pts.map((q) => q.y), c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      const rad = (Math.max(...xs) - Math.min(...xs)) / 2; const gr = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rad * 1.1);
      const cc = p.color || [235, 90, 120]; gr.addColorStop(0, `rgba(${cc[0]},${cc[1]},${cc[2]},${p['alpha' + k]})`); gr.addColorStop(1, `rgba(${cc[0]},${cc[1]},${cc[2]},0)`);
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = gr; ctx.fillRect(c.x - rad * 1.2, c.y - rad * 1.2, rad * 2.4, rad * 2.4); ctx.globalCompositeOperation = 'source-over';
    });
  } else if (partId === 'shadow') {
    g.regions.forEach((r, i) => {
      const k = i === 0 ? 'R' : 'L', xs = r.pts.map((q) => q.x), minX = Math.min(...xs), maxX = Math.max(...xs);
      const outerX = k === 'R' ? minX : maxX, innerX = k === 'R' ? maxX : minX;
      const [fromX, toX] = p.dir === 'outer' ? [innerX, outerX] : [outerX, innerX];
      const sc = p.color || [90, 55, 45]; const gr = ctx.createLinearGradient(fromX, 0, toX, 0); gr.addColorStop(0, `rgba(${sc[0]},${sc[1]},${sc[2]},${p['alpha' + k] * 0.25})`); gr.addColorStop(1, `rgba(${sc[0]},${sc[1]},${sc[2]},${p['alpha' + k]})`);
      ctx.save(); pathPoly(ctx, r.pts); ctx.clip(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = gr; ctx.fillRect(minX - 2, 0, maxX - minX + 4, h); ctx.restore();
    });
  } else if (partId === 'contour') {
    g.regions.forEach((r, i) => {
      const isHi = r.kind === 'highlight', k = i < 2 ? 'R' : 'L';   // regions = [R쉐딩, R하이라이트, L쉐딩, L하이라이트]
      const xs = r.pts.map((q) => q.x), ys = r.pts.map((q) => q.y), c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      const rad = (Math.max(...xs) - Math.min(...xs)) / 2, gr = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rad);
      const a = isHi ? p.hi : p['alpha' + k];
      gr.addColorStop(0, isHi ? `rgba(255,240,220,${a})` : `rgba(80,50,35,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); pathPoly(ctx, ellipsePts(c, rad * 1.3, rad * 0.9, 0)); ctx.clip(); ctx.globalCompositeOperation = isHi ? 'screen' : 'multiply'; ctx.fillStyle = gr; ctx.fillRect(c.x - rad * 1.4, c.y - rad * 1.4, rad * 2.8, rad * 2.8); ctx.restore();
    });
  }
  return cv;
}

/** 룩 전체(룩 5부위 + 쉐딩·하이라이트 선택)를 순서대로 그려 "전체 완성 예상"을 만든다 */
export function synthesizeLook(bare, lm, lookParts, w, h, withContour = true) {
  let cv = bare;
  for (const partId of ['brow', 'liner', 'shadow', 'lip', 'cheek', ...(withContour ? ['contour'] : [])]) {
    const params = lookParts[partId]; if (params === false) continue;
    cv = synthesize(cv, lm, partId, params || {}, w, h);
  }
  return cv;
}
