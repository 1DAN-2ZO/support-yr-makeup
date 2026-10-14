/**
 * 카메라를 못 열었을 때 — 까닭에 맞는 말 (2026-10-13, #422).
 *
 * 전에는 어떤 오류든 "브라우저 설정에서 카메라를 허용해 주세요" 한 줄이었다. 사용 기록(10/8 ~ 10/13)에서
 * 맨얼굴을 못 찍은 세션 15개 중 7개가 카메라 오류였는데, 그중 5개는 권한 문제가 아니었다
 * (제때 안 켜짐 3 · 다른 프로그램이 쓰는 중 2) — 안내대로 해도 풀리지 않는다.
 * 순수 함수. 화면(촬영)이 이 말과 "다시 시도" 를 같이 보여 준다
 */

/** denied 권한을 안 줌 · busy 카메라가 안 켜짐(다른 프로그램이 쓰는 중 · 제때 안 켜짐) · none 카메라가 없음 · other 그 밖 */
export type CameraFailKind = "denied" | "busy" | "none" | "other";

const KIND: Record<string, CameraFailKind> = {
  NotAllowedError: "denied", SecurityError: "denied", PermissionDeniedError: "denied",
  NotReadableError: "busy", AbortError: "busy", TrackStartError: "busy",
  NotFoundError: "none", OverconstrainedError: "none", DevicesNotFoundError: "none",
};

export const CAMERA_FAIL_TEXT: Record<CameraFailKind, string> = {
  denied: "카메라 권한이 꺼져 있어요. 브라우저 설정에서 카메라를 허용한 뒤 다시 시도해 주세요",
  busy: "카메라가 켜지지 않았어요. 카메라를 쓰는 다른 앱이 있으면 닫고 다시 시도해 주세요",
  none: "카메라를 찾지 못했어요. 카메라가 있는 폰이나 컴퓨터에서 열어 주세요",
  other: "카메라를 열 수 없어요. 잠시 뒤 다시 시도해 주세요",
};

/** 오류의 이름으로 가른다. 글자로 온 것("NotReadableError: …")은 맨 앞 낱말을 이름으로 읽는다 */
export function cameraFailKind(e: unknown): CameraFailKind {
  const name = typeof e === "string" ? (e.split(":")[0] ?? "").trim() : typeof (e as { name?: unknown } | null)?.name === "string" ? (e as { name: string }).name : "";
  return KIND[name] ?? "other";
}

export function cameraFailText(e: unknown): string {
  return CAMERA_FAIL_TEXT[cameraFailKind(e)];
}
