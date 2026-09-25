// server/app/layer.py의 클라이언트 대응(1:1 복제) — "진짜 설계 경로"를 웹캠으로 품질 확인하기 위한 POC.
// C4(app-webgl.js, 삭제됨)의 extractLayer.js와 달리 결과의 "보정된 색"을 그대로 저장하지 않는다 —
// server처럼 ΔLab(변화량)만 인코딩해서, 라이브 합성 시 라이브 프레임 자신의 색 위에 얹는다. 그래야
// 촬영 시 조명·촬영 사진의 피부톤이 아니라 "지금 라이브 화면의" 피부톤 위에 화장이 얹혀서 붕 뜨지 않는다.
//
// 반드시 이 순서로(server/app/layer.py와 동일): 1) 이마에서 전역 편향(diffusion 재구성 편향) 추정
//   2) 결과 Lab에서 편향 차감  3) 원본과 편향-보정 결과의 ΔLab·ΔE 계산  4) 임계 미만 알파 0
//
// 인코딩(RGBA, uint8) — server/app/layer.py와 동일, 바이트 단위로 맞춰야 디코더(decodeDeltaLayer.js)가
// 그대로 재사용 가능:
//   R = ΔL * 1.275 + 128 (ΔL -100..100 -> 0..255), G = Δa + 128, B = Δb + 128 (0 변화 = 128)
//   A = clip(ΔE / 40, 0, 1) * 255, 마스크 밖·임계 미만은 0

import { rgb2lab } from "./color.js";

const ALPHA_FULL_DE = 40.0;

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
 * @param {{width:number,height:number,data:Uint8ClampedArray}} baseImageData 원본(맨얼굴) RGBA, 결과와 픽셀 정렬됨
 * @param {{width:number,height:number,data:Uint8ClampedArray}} genImageData 결과(화장) RGBA, base와 동일 크기
 * @param {{[partId:string]: {width:number,height:number,data:Float32Array}}} masks 부위별 커버리지 마스크(0..1)
 * @param {{width:number,height:number,data:Float32Array}|null} forehead 편향 추정용 마스크 — 없으면(프레임 밖) null 반환
 * @param {number} [threshold] ΔE 임계 (server layer_de_threshold 기본값과 동일 6)
 * @returns {{width:number,height:number,data:Uint8ClampedArray}|null} RGBA 델타 레이어. 이마 마스크가 비면 null.
 */
export function extractDeltaLayer(baseImageData, genImageData, masks, forehead, threshold = 6) {
  const { width, height } = baseImageData;
  const n = width * height;

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
  if (dLs.length === 0) return null; // 이마가 프레임 밖 — 가짜 레이어보다 폴백이 낫다(server와 동일 판단)
  const bias = [median(dLs), median(das), median(dbs)];

  const out = { width, height, data: new Uint8ClampedArray(n * 4) };
  for (const [partId, mask] of Object.entries(masks)) {
    for (let i = 0; i < n; i++) {
      const coverage = mask.data[i];
      if (coverage <= 0) continue;
      const baseLab = pixelLab(baseImageData, i);
      const genLab = pixelLab(genImageData, i);
      const delta = [genLab[0] - bias[0] - baseLab[0], genLab[1] - bias[1] - baseLab[1], genLab[2] - bias[2] - baseLab[2]];
      const de = Math.hypot(delta[0], delta[1], delta[2]);
      if (de < threshold) continue; // 알파 0 유지
      const alpha = Math.min(1, Math.max(0, de / ALPHA_FULL_DE)) * 255;
      const o = i * 4;
      out.data[o] = Math.min(255, Math.max(0, Math.round(delta[0] * 1.275 + 128)));
      out.data[o + 1] = Math.min(255, Math.max(0, Math.round(delta[1] + 128)));
      out.data[o + 2] = Math.min(255, Math.max(0, Math.round(delta[2] + 128)));
      out.data[o + 3] = Math.round(alpha);
    }
  }
  return out;
}
