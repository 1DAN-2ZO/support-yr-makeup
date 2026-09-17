// 화장 레이어 추출: 생성 이미지(gen)에서 원본(base)과 다른 부분만 뽑아낸다.
// 순수 함수 — DOM/Canvas API에 의존하지 않는다(Node에서 그대로 테스트 가능).
//
// 반드시 이 순서로: 1) 이마(비화장 기준)에서 전역 편향(밝기·색온도) 추정
//                  2) gen 전체에서 그 편향을 차감
//                  3) base와 편향-보정된 gen의 Lab 잔차(ΔE) 계산
//                  4) 임계 이하는 알파 0으로 절단
// 2)를 건너뛰면 diffusion의 재구성 편향이 "옅은 화장"으로 오인된다 — extractLayer.test.js 테스트 2번이 이를 잡는다.

import { rgb2lab, lab2rgb, deltaE } from "./color.js";

function median(arr) {
  if (arr.length === 0) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pixelLab(imgData, i) {
  const o = i * 4;
  return rgb2lab(imgData.data[o], imgData.data[o + 1], imgData.data[o + 2]);
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} baseImageData 원본(맨얼굴) RGBA
 * @param {{width:number,height:number,data:Uint8ClampedArray}} genImageData  생성(화장) RGBA, base와 동일 크기
 * @param {{[partId:string]: {width:number,height:number,data:Float32Array}}} masks
 *   부위별 커버리지 마스크(0..1), image와 동일 크기. 'forehead'는 편향 추정 기준 영역으로만 쓰이고
 *   출력 레이어에는 포함되지 않는다.
 * @param {{threshold?:number, gain?:number}} [options]
 * @returns {{width:number,height:number,data:Uint8ClampedArray}} RGBA 레이어 (마스크 밖은 알파 0)
 */
export function extractLayer(baseImageData, genImageData, masks, options = {}) {
  const { threshold = 6, gain = 1.0 } = options;
  const { width, height } = baseImageData;
  const n = width * height;

  // 1) 전역 편향 추정 (이마 마스크, 채널별 중앙값 차이 — 평균은 이상치에 끌려간다)
  const forehead = masks.forehead;
  const dLs = [], das = [], dbs = [];
  if (forehead) {
    for (let i = 0; i < n; i++) {
      if (forehead.data[i] <= 0) continue;
      const bLab = pixelLab(baseImageData, i);
      const gLab = pixelLab(genImageData, i);
      dLs.push(gLab[0] - bLab[0]);
      das.push(gLab[1] - bLab[1]);
      dbs.push(gLab[2] - bLab[2]);
    }
  }
  const bias = [median(dLs), median(das), median(dbs)];

  // 2)+3)+4) 부위 마스크별로 편향 보정 후 잔차 계산, 임계 절단
  const out = { width, height, data: new Uint8ClampedArray(n * 4) };
  for (const [partId, mask] of Object.entries(masks)) {
    if (partId === "forehead") continue;
    for (let i = 0; i < n; i++) {
      const coverage = mask.data[i];
      if (coverage <= 0) continue;
      const baseLab = pixelLab(baseImageData, i);
      const genLab = pixelLab(genImageData, i);
      const genCorrected = [genLab[0] - bias[0], genLab[1] - bias[1], genLab[2] - bias[2]];
      const de = deltaE(baseLab, genCorrected);
      if (de < threshold) continue; // 알파 0 유지
      const alpha = Math.min(1, Math.max(0, (de * gain) / 100)) * coverage;
      const [r, g, b] = lab2rgb(genCorrected);
      const o = i * 4;
      out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = b; out.data[o + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}
