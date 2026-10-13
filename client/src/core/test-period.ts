/**
 * 테스트 기간이 끝나면 앱을 닫는다 (2026-10-13 결정).
 *
 * 동의 화면에 "테스트 기간은 10월 19일 오후 3시까지" 라고 적었다 (screens/consent.ts) — 그 시각부터는 새로 받지 않는다.
 * 서버의 사진 보관은 같은 날 오후 5시에 끝난다 (compose.yml DHE_KEEP_UNTIL). 순수 함수 — 시각과 주소를 받아 닫혔는지만 답한다.
 *
 * 주소에 `?team` 을 붙이면 닫힌 뒤에도 열린다 — 발표 시연 · 확인용. 비밀이 아니라 문패다 (저장소가 공개라 누구나 볼 수 있다):
 * 사용자에게 준 링크로는 닫힌 화면이 나오게 하려는 것뿐이다
 */

/** 2026-10-19 오후 3시 (한국 시간) */
export const TEST_ENDS_AT_MS = Date.parse("2026-10-19T15:00:00+09:00");

/** 닫힌 뒤에도 여는 주소 꼬리 */
export const TEAM_KEY = "team";

export function isTestClosed(nowMs: number, search: string): boolean {
  if (nowMs < TEST_ENDS_AT_MS) return false;
  return !new URLSearchParams(search).has(TEAM_KEY);
}

export const CLOSED_TEXT = {
  title: "테스트 기간이 끝났어요",
  body: "nudy 테스트는 10월 19일 오후 3시에 끝났어요. 써 주셔서 고맙습니다. 이 기기에 남아 있던 사진과 기록은 지금 지웠고, 서버에 보관한 사진과 사용 기록은 10월 19일 오후 5시에 모두 지워요.",
  survey: "후기 남기기 (1분)",
} as const;
