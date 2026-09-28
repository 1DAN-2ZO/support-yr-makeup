/**
 * 앱이 다시 열렸을 때 draft 로 세션을 되살리는 규칙 (1-11, F-07 "세션 복원").
 *
 * draft 에는 사진·랜드마크가 없다 (flow.ts stripImages — 얼굴 데이터는 draft 에 남기지 않는다).
 * 그래서:
 *  - 동의 전·거부·끝 → 새로 시작 (되살릴 게 없다)
 *  - 촬영 도중 → 촬영 화면으로, 장은 처음부터 (사진이 메모리에만 있었다). 동의는 다시 묻지 않는다
 *  - 촬영 뒤(룩·부위 화면) → 그 화면·그 부위로. 기준(Baseline)의 랜드마크는 IndexedDB 의 쌩얼 사진("bare")에서
 *    다시 찾는다 — 그건 호출측(main)이 모델로 한다. 못 찾으면 toCapture() 로 촬영부터
 * 2시간 만료는 session-store 가 맡는다 (만료면 draft 가 null 로 온다).
 */

import { createSession, type Session, type SessionDraft, type ShotId } from "./flow";
import type { Baseline, Pt } from "./types";

export type RestorePlan =
  | { kind: "fresh" }
  /** lostShots: 찍어 두었는데 사진이 없어 다시 찍어야 하는 장 수 */
  | { kind: "capture"; session: Session; lostShots: number }
  /** 기준 랜드마크를 다시 찾아 rebuildBaseline 으로 채워야 한다 */
  | { kind: "resume"; session: Session; baseline: NonNullable<SessionDraft["baseline"]> };

const BEFORE_CAPTURE: readonly SessionDraft["screen"][] = ["consent", "denied", "done"];

export function planRestore(draft: SessionDraft | null, now: () => number = Date.now): RestorePlan {
  if (!draft || !draft.consent || BEFORE_CAPTURE.includes(draft.screen)) return { kind: "fresh" };
  const fresh = createSession(now);
  // 예전 draft 에는 baseline.w·h 가 없다 → 랜드마크를 촬영 크기로 못 되돌리므로(NaN) 촬영부터 (#162 리뷰)
  const sizeOk = !!draft.baseline && Number.isFinite(draft.baseline.w) && Number.isFinite(draft.baseline.h) && draft.baseline.w > 0 && draft.baseline.h > 0;
  if (draft.screen === "capture" || !sizeOk) {
    const lostShots = Object.values(draft.shots).filter(Boolean).length;
    return { kind: "capture", session: { ...fresh, consent: true, screen: "capture", startedAt: draft.startedAt }, lostShots };
  }
  const shots: Partial<Record<ShotId, unknown>> = {};
  for (const [k, v] of Object.entries(draft.shots)) if (v) shots[k as ShotId] = true;
  const session: Session = {
    ...fresh,
    screen: draft.screen,
    consent: true,
    shots,
    faceShape: draft.faceShape,
    lookId: draft.lookId,
    currentPart: draft.currentPart,
    // 확인받기 사진(captured)은 메모리에만 있었다 — 결과·점수는 남는다
    parts: draft.parts.map((p) => ({ ...p, captured: null })),
    startedAt: draft.startedAt,
  };
  return { kind: "resume", session, baseline: draft.baseline! };
}

/** 기준을 못 되살렸을 때: 동의는 두고 촬영부터 */
export function toCapture(s: Session, now: () => number = Date.now): Session {
  return { ...createSession(now), consent: true, screen: "capture", startedAt: s.startedAt };
}

/**
 * draft 의 기준 값(척도·이마·흰자·얼굴형)은 그대로 두고, 쌩얼 사진에서 다시 찾은 랜드마크만 붙인다.
 * 척도를 다시 계산하지 않는 이유: 촬영 때 값으로 이미 채점한 부위가 있으면 복원 뒤에도 같은 기준이어야 한다.
 * 쌩얼 사진은 긴 변 1024 로 줄여 저장했으므로(image-encode) 랜드마크를 촬영 프레임 크기(saved.w·h)로 되돌린다.
 */
export function rebuildBaseline(
  saved: NonNullable<SessionDraft["baseline"]>,
  found: { lm: Pt[]; w: number; h: number },
  bareImage: Baseline["bareImage"],
): Baseline {
  const kx = saved.w / found.w, ky = saved.h / found.h;
  const lm = found.lm.map((p) => ({ x: p.x * kx, y: p.y * ky }));
  return { lm, unit: saved.unit, foreheadL: saved.foreheadL, scleraLab: saved.scleraLab, faceShape: saved.faceShape, bareImage, w: saved.w, h: saved.h };
}
