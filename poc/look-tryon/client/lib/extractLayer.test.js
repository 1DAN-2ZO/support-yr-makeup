// node lib/extractLayer.test.js 로 직접 실행. 합성 입력만 사용, 사진 파일 의존 없음.
import { extractLayer } from "./extractLayer.js";

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  ok - " + msg); }
  else { fail++; console.error("  FAIL - " + msg); }
}

// W×H 크기의 단색 RGBA ImageData 유사 객체 생성 (브라우저 ImageData와 동일한 {width,height,data} 형태)
function solidImage(w, h, [r, g, b]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

// 사각형 영역만 값이 있는 마스크(Float32Array, 0..1 커버리지)
function rectMask(w, h, x0, y0, x1, y1) {
  const data = new Float32Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * w + x] = 1;
  return { width: w, height: h, data };
}

const W = 32, H = 32;
const BASE_COLOR = [200, 170, 150]; // 살구빛 피부톤 근사
const masks = {
  lip: rectMask(W, H, 12, 20, 20, 26),
  forehead: rectMask(W, H, 10, 2, 22, 8),
};

console.log("1) 항등: base === gen 이면 모든 알파 0");
{
  const base = solidImage(W, H, BASE_COLOR);
  const gen = solidImage(W, H, BASE_COLOR);
  const layer = extractLayer(base, gen, masks);
  let maxAlpha = 0;
  for (let i = 0; i < W * H; i++) maxAlpha = Math.max(maxAlpha, layer.data[i * 4 + 3]);
  assert(maxAlpha === 0, `모든 알파 0 (실제 max=${maxAlpha})`);
}

console.log("2) 전역 편향 내성: gen = base 전체에 L+5 이면 알파 총합 0");
{
  const base = solidImage(W, H, BASE_COLOR);
  // L을 +5 정도 올리는 균일한 밝기 증가를 RGB 단순 가산으로 근사(전역적으로 밝아짐)
  const brighter = BASE_COLOR.map((c) => Math.min(255, c + 18));
  const gen = solidImage(W, H, brighter);
  const layer = extractLayer(base, gen, masks);
  let alphaSum = 0;
  for (let i = 0; i < W * H; i++) alphaSum += layer.data[i * 4 + 3];
  assert(alphaSum === 0, `알파 총합 0 (실제 sum=${alphaSum}) — 1단계 전역 편향 차감이 새면 여기서 걸린다`);
}

console.log("3) 실제 화장: 입술만 색을 크게 바꾼 입력에서 입술 알파는 높고 나머지는 0");
{
  const base = solidImage(W, H, BASE_COLOR);
  const gen = solidImage(W, H, BASE_COLOR);
  // 입술 영역만 선명한 빨강으로 덮어쓰기
  for (let y = 20; y < 26; y++) {
    for (let x = 12; x < 20; x++) {
      const i = (y * W + x) * 4;
      gen.data[i] = 200; gen.data[i + 1] = 30; gen.data[i + 2] = 60;
    }
  }
  const layer = extractLayer(base, gen, masks);
  let lipAlphaSum = 0, lipN = 0;
  for (let y = 20; y < 26; y++) for (let x = 12; x < 20; x++) { lipAlphaSum += layer.data[(y * W + x) * 4 + 3]; lipN++; }
  const lipAvg = lipAlphaSum / lipN;

  let outsideAlphaSum = 0, outsideN = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inLip = y >= 20 && y < 26 && x >= 12 && x < 20;
    if (inLip) continue;
    outsideAlphaSum += layer.data[(y * W + x) * 4 + 3];
    outsideN++;
  }
  assert(lipAvg > 100, `입술 알파 높음 (평균=${lipAvg.toFixed(1)}/255)`);
  assert(outsideAlphaSum === 0, `입술 밖 알파 0 (실제 sum=${outsideAlphaSum})`);
}

console.log("4) 배율 인코딩: 절대색이 아니라 base 대비 배율(ratio)로 저장되는지");
{
  // base=[200,170,150], gen 입술=[200,30,60] → 기대 배율 R=1.0, G≈0.176, B=0.4
  // 인코딩: stored = ratio/2.0*255 (RATIO_RANGE=2.0, extractLayer.js 상단 주석과 동일)
  const base = solidImage(W, H, BASE_COLOR);
  const gen = solidImage(W, H, BASE_COLOR);
  for (let y = 20; y < 26; y++) for (let x = 12; x < 20; x++) {
    const i = (y * W + x) * 4;
    gen.data[i] = 200; gen.data[i + 1] = 30; gen.data[i + 2] = 60;
  }
  const layer = extractLayer(base, gen, masks);
  const px = ((20 + 23) / 2 | 0) * W + 16; // 입술 영역 대략 중앙
  const o = px * 4;
  const expected = [1.0, 30 / 170, 60 / 150].map((r) => Math.round((r / 2.0) * 255));
  const actual = [layer.data[o], layer.data[o + 1], layer.data[o + 2]];
  const closeEnough = expected.every((e, ch) => Math.abs(e - actual[ch]) <= 6); // Lab 왕복 오차 여유
  assert(closeEnough, `배율 인코딩 기대값≈[${expected}] 실제=[${actual}] (오차 6 이내)`);
  // 다른 채널보다 훨씬 어두워지는 G채널이 128(배율 1.0, 무변화)보다 뚜렷이 작은지도 직접 확인
  assert(actual[1] < 100, `G채널(많이 어두워짐)이 무변화(128)보다 확실히 작음 (실제=${actual[1]})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
