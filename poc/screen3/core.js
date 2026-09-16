// 화면 3(부위 완성본) 핵심 계산 모듈 (순수 함수). 브라우저·Node 공용 ESM.
// DOM·캔버스·MediaPipe를 쓰지 않는다. 랜드마크 숫자만 다룬다.
// 얼굴형 판정은 하지 않는다 — label 을 입력으로 받는다 (파트 1 F-02 담당).

import { SMOKY, CONTOUR_RULES } from './rules.js';

/** 부위 근거 한 줄. contour 는 얼굴형별 멘트. 숫자를 넣지 않는다. */
export function rationale(partId, faceShape = 'oval') {
  if (partId === 'contour') {
    const rule = CONTOUR_RULES[faceShape] || CONTOUR_RULES.oval;
    return rule.rationale;
  }
  const s = SMOKY.rationale[partId];
  if (!s) throw new Error(`알 수 없는 partId: ${partId}`);
  return s;
}

/** "지금 필요한 것: …" 한 줄. */
export function products(partId) {
  const p = SMOKY.products[partId];
  if (!p) throw new Error(`알 수 없는 partId: ${partId}`);
  return `지금 필요한 것: ${p}`;
}
