/**
 * [임시] 평가 CLI 용 가이드 기하 — poc/full/lib/guides.js 의 buildGuide 에서 채점이 쓰는 부분만.
 *
 * ② 가이드가 guides.ts(#21) 를 올리면 이 파일을 지우고 그것을 쓴다. 그때까지는 여기 값이 앱과 같아야
 * 평가가 앱과 같은 것을 잰다 — 치수(꼬리 각 30°·길이 0.15, 섀도우 0.55, 볼 0.11×0.07 기울기 −25°)는
 * POC TEMPLATE 그대로다.
 *
 * 모양은 client/src/core/score-part.ts 의 GuideSource: (partId, frame) → { liner?, lip?, regions?, contour? }.
 * R = 이미지 왼쪽 눈(eyeA) = 피험자 오른쪽.
 */

const TEMPLATE = {
  liner: { wingAngle: 30, wing: 0.15, thick: 0.045 },   // thick·offset 은 ② 가 룩마다 정한다. 여기 값은 POC 기본(스모키 1벌)
  lip: { offset: 0.01 },
  shadow: { rangeRatio: 0.55 },
  cheek: { rx: 0.11, ry: 0.07, tilt: -25 },
  contour: { rx: 0.13, ry: 0.05, tilt: -30, down: 0.06, toward: 0.35 },
  highlight: { rx: 0.09, ry: 0.035, tilt: -20, up: 0.05, toward: 0.2 },
};

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const norm = (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function ellipse(c, rx, ry, deg, n = 28) {
  const t = (deg * Math.PI) / 180, out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI, x = rx * Math.cos(a), y = ry * Math.sin(a);
    out.push({ x: c.x + x * Math.cos(t) - y * Math.sin(t), y: c.y + x * Math.sin(t) + y * Math.cos(t) });
  }
  return out;
}

/** @param LM client/src/core/landmarks.ts 의 인덱스 표 (묶은 core 에서 받는다) */
export function makePocGuide(LM) {
  const SIDES = [
    { key: "R", eye: LM.eyeA, brow: LM.browA, cheek: LM.cheekA, face: LM.faceL, sign: -1 },
    { key: "L", eye: LM.eyeB, brow: LM.browB, cheek: LM.cheekB, face: LM.faceR, sign: 1 },
  ];
  return (partId, f) => {
    const P = (i) => {
      const p = f.lm[i];
      if (!p) throw new Error(`랜드마크 ${i} 없음 (${f.lm.length}점)`);
      return p;
    };
    const faceW = f.unit.face;
    const both = (fn) => Object.fromEntries(SIDES.map((s) => [s.key, fn(s)]));

    if (partId === "liner") {
      return {
        liner: {
          wing: both(({ eye }) => {
            const outer = P(eye.outer), inner = P(eye.inner);
            const v = norm(sub(outer, inner)), a = (TEMPLATE.liner.wingAngle * Math.PI) / 180;
            const dir = norm(add(mul(v, Math.cos(a)), { x: 0, y: -Math.sin(a) }));
            return [outer, add(outer, mul(dir, TEMPLATE.liner.wing * f.unit.eye))];
          }),
          thick: TEMPLATE.liner.thick,
        },
      };
    }
    if (partId === "lip") return { lip: { offset: TEMPLATE.lip.offset } };
    if (partId === "shadow") {
      return {
        regions: both(({ eye, brow }) => {
          const lid = eye.upper.map(P), browLo = brow.lower.map(P);
          const top = lid.map((p, i) => mix(p, browLo[Math.min(browLo.length - 1, Math.round((i / (lid.length - 1)) * (browLo.length - 1)))], TEMPLATE.shadow.rangeRatio));
          return [...lid, ...top.reverse()];
        }),
      };
    }
    if (partId === "cheek") {
      return {
        regions: both(({ cheek, face, sign }) => ellipse(mix(P(cheek), P(face), 0.25), faceW * TEMPLATE.cheek.rx, faceW * TEMPLATE.cheek.ry, sign * TEMPLATE.cheek.tilt)),
      };
    }
    if (partId === "contour") {
      // [자리표시] 앱은 얼굴형 규칙(contourOutline, screen3-core.js)의 밴드를 쓴다 — 턱선·광대 아래·이마 옆 등 얼굴형마다 다르고 가운데 밴드도 있다.
      // ② 의 contour.ts 가 그 배열을 그대로 넘기면 된다. 그때까지는 guides.js 의 둥근형 예시 타원(좌우 하나씩)
      const c = TEMPLATE.contour, h = TEMPLATE.highlight;
      return {
        contour: {
          shading: SIDES.map(({ cheek, face, sign }) => ellipse(add(mix(P(cheek), P(face), c.toward), { x: 0, y: faceW * c.down }), faceW * c.rx, faceW * c.ry, sign * c.tilt)),
          highlight: SIDES.map(({ cheek, face, sign }) => ellipse(add(mix(P(cheek), P(face), h.toward), { x: 0, y: -faceW * h.up }), faceW * h.rx, faceW * h.ry, sign * h.tilt)),
        },
      };
    }
    return {};
  };
}
