/**
 * 후기 설문 링크 — 세션 번호를 폼 칸에 미리 채워 준다 (본 앱 `main.ts` `surveyUrlNow`, #431).
 *
 * 번호는 **운영 연결(`lib/ops`)의 세션 번호**다 (#454 A6) — 전에는 여기서 따로 만들어 창을 열 때마다
 * 새 번호였고, 서버에 보관한 사진과 설문의 번호가 달라 지워 달라는 요청을 받아도 사진을 못 찾았다
 */
import { surveyUrlFor } from "@core/session-id";
import { ops } from "./lib/ops";

const SURVEY_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeSt5w2auBc_CW-ScpC5bq9TQs3SO1YsFIlT7REj1hlRmgi6g/viewform";
/** 폼의 세션 번호 칸 */
const SURVEY_SID_ENTRY = "entry.1452881246";

const RAW_URL: unknown = import.meta.env.VITE_SURVEY_URL;
/** 설문 주소 (번호 없이) — 닫힌 화면이 쓴다 */
export const SURVEY_BASE: string = typeof RAW_URL === "string" && RAW_URL.trim() ? RAW_URL.trim() : SURVEY_URL;

export function surveyLink(): string | null {
  return surveyUrlFor(SURVEY_BASE, SURVEY_SID_ENTRY, ops().sid.sid());
}
