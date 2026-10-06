/**
 * 부위마다 화면 방향을 지킨다 — 눈 부위(눈썹·라이너·섀도우)는 가로, 입술·볼·쉐딩은 세로 (팀 협의 2026-09-30 · 2026-10-01, 정의서 3-2).
 * 눈 부위는 양쪽 눈을 한 화면에 크게 담아야 해서 가로, 나머지는 맨얼굴(세로)과 같은 자세로 찍어야 채점이 맞는다 —
 * 가로로 들면 카메라가 옆이라 얼굴이 약 16° 돌아간 것으로 찍힌다(#239). 섀도우 다음 입술로 넘어갈 때 가로 그대로 하지 않게.
 * 화면 4 는 게이트(gate.ts)가 막고, 화면 3·5 는 방향이 틀리면 내용 대신 돌려 달라는 한 줄만 보여 준다.
 * 브라우저는 화면 방향을 강제로 못 바꾼다(iOS 는 아예 막힘) → 돌리기 전엔 못 넘어가게 하는 것이 전부다. 돌리면 껍데기가 다시 그린다 (main.ts).
 */

import { GATE_TEXT } from "./gate";
import { wantedOrientation, type Orientation } from "./screens";
import type { PartId } from "./types";

/** 그 부위를 하려면 폰을 돌려야 하나. 방향을 모르면(null) 막지 않는다 */
export function mustRotate(part: PartId | null, now: Orientation | null): boolean {
  return !!part && now !== null && wantedOrientation(part) !== now;
}

/** 돌려 달라는 한 줄 — 화면 4 게이트와 같은 말 */
export function rotateText(part: PartId): string {
  return wantedOrientation(part) === "landscape" ? GATE_TEXT.toLandscape : GATE_TEXT.toPortrait;
}

/**
 * 지금 화면 방향. 알 수 없으면(테스트·옛 브라우저) null — 막지 않는다.
 * 개발용: 주소에 ?norotate 면 늘 null — PC 창은 늘 가로라 입술·볼·쉐딩이 안 넘어가서 (#284 리뷰). 폰 기본 동작은 그대로
 */
export function nowOrientation(): Orientation | null {
  if (typeof window !== "undefined" && new URLSearchParams(window.location?.search ?? "").has("norotate")) return null;
  const mq = typeof window !== "undefined" ? window.matchMedia?.("(orientation: landscape)") : undefined;
  if (!mq) return null;
  return mq.matches ? "landscape" : "portrait";
}
