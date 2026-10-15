/**
 * 테스트 기간이 끝난 뒤의 화면 (본 앱 `main.ts` `showClosed`, `core/test-period`, #454 A1).
 * 앱을 켜지 않고 이것만 보여 준다 — 10월 19일 오후 3시부터. 주소에 `?team` 을 붙이면 연다 (발표 시연 · 확인용).
 * 이 기기에 남아 있던 세션 번호는 여기서 지운다 (본 앱은 사진 · 기록도 지우는데 이 버전은 폰에 두는 것이 번호뿐이다)
 */
import { useEffect } from "react";
import { SID_KEY } from "@core/session-id";
import { SURVEY_BASE } from "../survey-link";
import { useLang } from "../i18n/useLang";

/*
 * 글은 코어 `test-period.ts` 의 `CLOSED_TEXT` 와 같은 말이다 — 영어도 써야 해서
 * `i18n` 쪽(`closed.*`)으로 옮겨 두었다. 코어는 본 앱이 같이 쓰므로 고치지 않았다.
 */
export default function Closed() {
  const { t } = useLang();
  useEffect(() => {
    try {
      window.localStorage.removeItem(SID_KEY);
    } catch {
      /* 저장소가 막혀 있으면 남은 것도 없다 */
    }
  }, []);
  return (
    <section className="screen done">
      <h1>{t("closed.title")}</h1>
      <p className="muted">{t("closed.body")}</p>
      <p className="slot-survey">
        <a href={SURVEY_BASE} target="_blank" rel="noopener noreferrer">
          {t("closed.survey")}
        </a>
      </p>
    </section>
  );
}
