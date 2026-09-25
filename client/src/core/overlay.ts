/**
 * 화면 5 결과 사진 위에 겹칠 가이드 테두리 — 순수 함수. DOM 을 모른다 (그리는 건 screens/result.ts).
 *
 * 정의서 5-1: 사진 위에 **가이드 테두리(청록)만** 겹친다. 감지 영역·이탈 화살표·점은 그리지 않는다.
 * 테두리는 채점이 쓴 기하(PartGeometry) + 랜드마크에서 만든다 — 채점이 본 자리와 화면의 선이 같아야 한다.
 */

import { lipOutline } from "./guides";
import { LM, at } from "./landmarks";
import type { PartGeometry } from "./score-part";
import type { PartId, Pt } from "./types";

export interface Outline {
  /** 닫힌 다각형 */
  polys: Pt[][];
  /** 열린 선 */
  lines: Pt[][];
}

export function guideOutline(partId: PartId, lm: readonly Pt[], g: PartGeometry): Outline {
  const P = (i: number): Pt => at(lm, i);
  const polys: Pt[][] = [], lines: Pt[][] = [];
  switch (partId) {
    case "liner": {
      // 속눈썹 선 + 꼬리 선. 두께는 선 하나로 대신한다 (밴드를 면으로 칠하지 않는다)
      for (const [eye, s] of [[LM.eyeA, "R"], [LM.eyeB, "L"]] as const) {
        lines.push(eye.upper.map(P));
        const w = g.liner?.wing[s];
        if (w) lines.push([w[0], w[1]]);
      }
      break;
    }
    case "brow":
      // 개인화 계획이 정답 눈썹(표준 + 얼굴형 조정)을 주면 그것, 아니면 지금 눈썹 윤곽
      if (g.regions) polys.push([...g.regions.R], [...g.regions.L]);
      else for (const b of [LM.browA, LM.browB]) polys.push([...b.upper.map(P), ...b.lower.map(P).reverse()]);
      break;
    case "lip":
      // 개인화 오버라인이 있으면 올린 입술선 (없으면 지금 입술 윤곽 그대로)
      polys.push(lipOutline(lm, g.lip?.upperOverline ?? 0));
      break;
    case "shadow":
    case "cheek":
      if (g.regions) polys.push([...g.regions.R], [...g.regions.L]);
      break;
    case "contour":
      if (g.contour) for (const band of [...g.contour.shading, ...g.contour.highlight]) polys.push([...band]);
      break;
  }
  return { polys, lines };
}
