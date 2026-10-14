/**
 * 후기 설문 주소 — 세션 번호를 채워서 연다 (본 앱 main.ts 의 `surveyUrlNow` 자리).
 *
 * 설문에 **세션 번호 칸**(`entry.1452881246`)이 있다. 지워 달라는 요청을 설문으로 받기
 * 때문에(본 앱 #431), 번호가 채워져 있어야 그 사람의 사진을 찾을 수 있다.
 *
 * ── 세션 번호를 폰에 적어 두지 않는다 ──
 *
 * 본 앱은 `localStorage` 에 번호를 적어 두고 새로고침해도 같은 번호를 쓴다. 이 버전은
 * **폰에 아무것도 저장하지 않는다** — 동의문(`screens/Consent.tsx`)에 그렇게 적어 두었다.
 * 그래서 `storage: null` 로 만든다: 창을 열 때마다 새 번호다. 본 앱도 저장소를 못 쓰는
 * 브라우저(비공개 창 등)에서는 똑같이 돈다 (`core/session-id.ts` 머리글).
 *
 * 창을 여는 동안은 번호가 그대로라, 피드백·저장·끝 화면이 같은 번호로 설문을 연다.
 *
 * 주소는 공개 구글 폼이라 숨길 것이 아니어서 기본값을 코드에 둔다 — 본 앱과 같은 까닭이다.
 * `VITE_SURVEY_URL` 로 덮어쓸 수 있고, 빈 문자열을 주면 설문을 끈다 (그러면 설문 칸·모달이
 * 아예 안 뜬다 — 눌리지 않는 빈 버튼을 두지 않는다).
 */

import { createSidHolder, surveyUrlFor } from "./core/session-id";

const SURVEY_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeSt5w2auBc_CW-ScpC5bq9TQs3SO1YsFIlT7REj1hlRmgi6g/viewform";

/** 설문의 "세션 번호" 칸 번호 (2026-10-14 에 폼에서 확인한 값) */
const SURVEY_SID_ENTRY = "entry.1452881246";

/**
 * 창 하나에 하나. 저장소를 안 쓰니 `ttlMs` 는 쓰이지 않지만, 본 앱 모듈을 **고치지 않고**
 * 그대로 쓰려고 본 앱과 같은 값(2시간)을 준다
 */
const holder = createSidHolder({ storage: null, ttlMs: 2 * 60 * 60 * 1000 });

const RAW_URL: unknown = import.meta.env.VITE_SURVEY_URL;
const base = typeof RAW_URL === "string" ? RAW_URL.trim() : SURVEY_URL;

/** 지금 세션 번호가 채워진 설문 주소. 설문을 꺼 뒀으면 null */
export function surveyLink(): string | null {
  return surveyUrlFor(base, SURVEY_SID_ENTRY, holder.sid());
}
