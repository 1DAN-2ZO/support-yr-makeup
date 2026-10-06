// 화장 렌더링 3판 — "색만 바꾸고 밝기는 막는다".
//
// 왜 또 고치나
// -----------
// 2판은 밝기를 '섞어서' 유지하려 했는데, 그러면 색과 밝기가 같이 움직여 색이 죽거나 평평해진다.
// 제대로 된 방법은 둘을 아예 분리하는 것이다 — 색은 100% 옮기고, 밝기는 정해진 한도 이상 못 움직이게 막는다.
// carmine(MIT, github.com/safdar-hussain1/carmine)이 사진 26장으로 잰 결과가 이렇다.
//     색 덮어 칠하기 → 입술 밝기가 45.7 만큼 바뀜   (원래 주름·광택이 지워진다)
//     색만 옮기기    → 13.2                        (밝기가 살아 있다)
// 그 3.5배가 "얼굴과 따로 노는 입술"의 정체다.
//
// 부위마다 한도가 다르다는 것도 중요하다. 블러셔는 립의 절반만 허용한다 —
// 볼은 피부가 비쳐야 하고, 입술은 제품 자체의 색이 이겨야 하기 때문이다.

import { smoothSkin, toneFilter } from "./render2.js";

/** 부위별 '밝기를 바꿔도 되는 한도' — carmine 이 측정해 공개한 값 */
export const LIGHTNESS_PULL = {
  lip: 0.3, // 매트
  lipGloss: 0.35,
  shadow: 0.3,
  brow: 0.2,
  cheek: 0.15, // 볼은 피부가 비쳐야 한다
  highlight: 0.1,
  liner: 1, // 아이라이너는 가리는 게 목적이라 제한하지 않는다
};

// ── 색 변환 (sRGB ↔ 선형 ↔ Lab) ─────────────────────────────────────────────
const S2L = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  S2L[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const l2s = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};
const f = (t) => (t > 0.008856 ? Math.cbrt(t) : t / 0.1284 + 4 / 29);
const fInv = (t) => (t > 0.2069 ? t * t * t : 0.1284 * (t - 4 / 29));

/** 선형 RGB → Lab. L=밝기, a·b=색 */
function rgb2lab(r, g, b, out) {
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089);
  out[0] = 116 * y - 16;
  out[1] = 500 * (x - y);
  out[2] = 200 * (y - z);
  return out;
}

/** Lab → 선형 RGB */
function lab2rgb(L, a, bb, out) {
  const y = (L + 16) / 116;
  const x = y + a / 500, z = y - bb / 200;
  const X = fInv(x) * 0.9505, Y = fInv(y), Z = fInv(z) * 1.089;
  out[0] = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  out[1] = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  out[2] = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  return out;
}

const hexToLab = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return rgb2lab(S2L[(n >> 16) & 255], S2L[(n >> 8) & 255], S2L[n & 255], new Float32Array(3));
};

// ── 마스크에서 두께 지도 만들기 ─────────────────────────────────────────────
/**
 * 경계에서 안쪽으로 갈수록 진해지는 지도. 흐림으로 근사하고 S자로 눌러
 * 가운데가 진하고 가장자리가 옅어지게 한다.
 */
function thickness(maskCanvas, w, h, featherPx) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.filter = `blur(${Math.max(0.5, featherPx)}px)`;
  c.drawImage(maskCanvas, 0, 0, w, h);
  c.filter = "none";
  const d = c.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const a = d[i * 4 + 3] / 255;
    out[i] = a * a * (3 - 2 * a);
  }
  return out;
}

/**
 * 화장을 얹는다.
 * @param {CanvasRenderingContext2D} ctx 결과를 그릴 곳
 * @param {HTMLCanvasElement} srcCanvas 바탕 (피부 보정을 마친 얼굴)
 * @param {object} parts {부위: {mask, color, alpha, feather, pull, mode, gloss}}
 *   mode: "tint"(기본, 색만 옮김) | "soft"(soft-light, 볼터치) | "paint"(불투명, 아이라이너)
 */
export function paint(ctx, srcCanvas, parts) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const src = srcCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data, o = out.data;

  const layers = [];
  for (const [name, p] of Object.entries(parts)) {
    if (!p || !p.mask || p.alpha <= 0) continue;
    layers.push({
      name,
      t: thickness(p.mask, w, h, p.feather ?? 3),
      lab: hexToLab(p.color),
      alpha: p.alpha,
      pull: p.pull ?? LIGHTNESS_PULL[name] ?? 0.3,
      mode: p.mode ?? "tint",
      gloss: p.gloss ?? 0,
    });
  }

  const lab = new Float32Array(3), rgb = new Float32Array(3);
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    let r = S2L[s[k]], g = S2L[s[k + 1]], b = S2L[s[k + 2]];

    for (const L of layers) {
      const a = L.t[i] * L.alpha;
      if (a <= 0.002) continue;

      if (L.mode === "soft") {
        // 볼터치 — soft-light. 밑의 명암이 그대로 비친다
        lab2rgb(L.lab[0], L.lab[1], L.lab[2], rgb);
        const sl = (base, top) => (top <= 0.5
          ? base - (1 - 2 * top) * base * (1 - base)
          : base + (2 * top - 1) * ((base <= 0.25 ? ((16 * base - 12) * base + 4) * base : Math.sqrt(base)) - base));
        r += (sl(r, Math.max(0, Math.min(1, rgb[0]))) - r) * a;
        g += (sl(g, Math.max(0, Math.min(1, rgb[1]))) - g) * a;
        b += (sl(b, Math.max(0, Math.min(1, rgb[2]))) - b) * a;
        continue;
      }

      rgb2lab(r, g, b, lab);
      if (L.mode === "paint") {
        // 아이라이너 — 가리는 게 목적이라 밝기도 그대로 옮긴다
        lab[0] += (L.lab[0] - lab[0]) * a;
      } else {
        // 기본 — 색(a·b)은 그만큼 다 옮기고, 밝기(L)는 한도만큼만
        lab[0] += (L.lab[0] - lab[0]) * a * L.pull;
      }
      lab[1] += (L.lab[1] - lab[1]) * a;
      lab[2] += (L.lab[2] - lab[2]) * a;
      lab2rgb(lab[0], lab[1], lab[2], rgb);
      r = rgb[0]; g = rgb[1]; b = rgb[2];

      // 광택 — 원래 밝던 곳만 더 밝힌다 (립글로스가 빛을 받는 자리)
      if (L.gloss > 0) {
        const lumv = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lumv > 0.30) {
          const hi = Math.min(1, (lumv - 0.30) / 0.55);
          const add = hi * hi * L.gloss * a * 0.5;
          r += add; g += add; b += add;
        }
      }
    }
    o[k] = l2s(r); o[k + 1] = l2s(g); o[k + 2] = l2s(b); o[k + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}

// ── 전체 파이프라인 ─────────────────────────────────────────────────────────
// 소다 같은 뷰티 앱이 도는 순서 그대로:
//   ① 피부 보정 → ② 화장 → ③ 톤 균일화·색감
// 화장을 맨 피부에 바로 얹으면 그 아래 잡티·요철이 색 위로 비쳐 "얼룩"이 된다.

const rt = { small: null, sctx: null, out: null, octx: null };

/**
 * 한 프레임을 처리한다. 실시간에서는 작게 계산하고 키워서 붙인다.
 * @param {CanvasRenderingContext2D} ctx 화면
 * @param {HTMLVideoElement|HTMLCanvasElement} source 원본
 * @param {(w:number,h:number)=>object|null} makeParts 그 크기에 맞는 부위 재료
 * @param {object} opt {scale, smooth, tone}
 * @returns {number} 처리에 걸린 ms
 */
export function renderFrame(ctx, source, makeParts, opt = {}) {
  const t0 = performance.now();
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const sc = opt.scale ?? 0.5;
  const w = Math.max(64, Math.round(W * sc)), h = Math.max(64, Math.round(H * sc));

  if (!rt.small || rt.small.width !== w || rt.small.height !== h) {
    rt.small = document.createElement("canvas");
    rt.small.width = w; rt.small.height = h;
    rt.sctx = rt.small.getContext("2d", { willReadFrequently: true });
    rt.out = document.createElement("canvas");
    rt.out.width = w; rt.out.height = h;
    rt.octx = rt.out.getContext("2d", { willReadFrequently: true });
  }
  rt.sctx.drawImage(source, 0, 0, w, h);

  // ① 피부 보정 — 화장을 올릴 바탕을 먼저 만든다
  const base = opt.smooth > 0 ? smoothSkin(rt.small, opt.smooth) : rt.small;

  // ② 화장
  const parts = makeParts ? makeParts(w, h) : null;
  if (parts) paint(rt.octx, base, parts);
  else rt.octx.drawImage(base, 0, 0);

  // ③ 전체 톤·색감 — 칠한 곳과 안 칠한 곳을 같은 색 공간으로 묶는다
  if (opt.tone > 0) toneFilter(rt.octx, w, h, { warmth: opt.tone * 0.5, lift: opt.tone * 0.5, fade: opt.tone * 0.2 });

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(rt.out, 0, 0, W, H);
  return performance.now() - t0;
}
