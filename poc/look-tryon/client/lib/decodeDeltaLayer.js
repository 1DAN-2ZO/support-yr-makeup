// deltaLayer.js(=server/app/layer.py 클라이언트 복제)가 만든 ΔLab 인코딩 레이어를, 기하 워핑까지 끝낸
// "인코딩된 픽셀"에서 실제 라이브 프레임 색 위에 되돌려 적용한다.
// 왜 라이브 프레임 자신의 색에 더하는가: 촬영 시점 피부톤·조명이 아니라 "지금 화면의" 피부톤 위에
// 얹어야 사진을 오려 붙인 것처럼 안 보인다(오늘 C4에서 확인한 "스티커 같음" 문제의 근본 원인).

import { rgb2lab, lab2rgb } from "./color.js";

/**
 * @param {ImageData} liveImgData 라이브 프레임이 이미 그려진 캔버스에서 뽑은 픽셀(같은 bbox)
 * @param {ImageData} warpedEncodedImgData deltaLayer를 라이브 프레임 좌표로 기하 워핑한 인코딩 픽셀(같은 bbox, 같은 크기)
 * @param {number} alphaScale 0..1+ 전역 강도 배율(슬라이더) — 인코딩 알파에 곱한다
 * @returns {ImageData} liveImgData를 제자리에서 수정해서 그대로 반환(재할당 없음)
 */
export function applyDeltaLayer(liveImgData, warpedEncodedImgData, alphaScale) {
  const data = liveImgData.data;
  const enc = warpedEncodedImgData.data;
  const n = data.length / 4;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = (enc[o + 3] / 255) * alphaScale;
    if (a <= 0) continue;
    const dL = (enc[o] - 128) / 1.275;
    const da = enc[o + 1] - 128;
    const db = enc[o + 2] - 128;
    const lab = rgb2lab(data[o], data[o + 1], data[o + 2]);
    const [r, g, b] = lab2rgb([lab[0] + dL * a, lab[1] + da * a, lab[2] + db * a]);
    data[o] = r; data[o + 1] = g; data[o + 2] = b;
  }
  return liveImgData;
}
