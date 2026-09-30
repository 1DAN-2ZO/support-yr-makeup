/**
 * 눈 부위(눈썹·라이너·섀도우)는 화면 3·4·5 모두 가로에서만 (팀 협의 2026-09-30, 정의서 3-2) — 양쪽 눈을 한 화면에 크게 담아 좌우를 맞춰 그리는 부위라서.
 * 화면 4 는 게이트(gate.ts)가 확인받기를 막고, 화면 3·5 는 세로면 내용 대신 이 문구만 띄운다.
 * 브라우저는 화면을 가로로 강제로 돌릴 수 없다(iOS 는 막혀 있음) → 돌리기 전에는 못 넘어가게. 돌리면 껍데기가 다시 그린다(main.ts orientation 이벤트).
 */

import { GATE_TEXT } from "./gate";
import { wantedOrientation, type Orientation } from "./screens";
import type { PartId } from "./types";

export const ROTATE_TEXT = GATE_TEXT.toLandscape;

export function mustRotate(part: PartId | null, now: Orientation): boolean {
  return !!part && wantedOrientation(part) === "landscape" && now === "portrait";
}

/** 지금 화면 방향. 알 수 없으면(테스트·옛 브라우저) 가로로 보고 막지 않는다 */
export function nowOrientation(): Orientation {
  const mq = typeof window !== "undefined" ? window.matchMedia?.("(orientation: landscape)") : undefined;
  return mq && !mq.matches ? "portrait" : "landscape";
}
