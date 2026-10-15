/**
 * 화면 9 — 끝. 배포본 `client/src/screens/done.ts` 를 옮긴 것이다.
 *
 * 배포본이 이 화면에서 하는 일은 둘이다: **지웠다는 것을 말해 주고**, **후기를 묻는다.**
 * 얼굴 사진을 맡긴 사람이 제일 궁금한 것이 "어디 남아 있나" 라서, 안 보여 주면 의심한 채로 끝난다.
 *
 * ── 2026-10-14: 배포본과 맞췄다 ──
 *
 * 전에는 "찍은 사진도 고른 색도 어디에도 남기지 않았어요" 였다. **서버가 붙은 지금은
 * 거짓말이다** — 맨얼굴과 예상 메이크업이 서버에 간다. 그래서 배포본 글로 되돌렸고,
 * 보관 날짜도 동의문(`Consent.tsx`)의 둘째 묶음과 같은 날짜를 쓴다. 이 둘은 늘 같이 고쳐야 한다.
 *
 * 후기 설문 칸(`.done-survey`)도 가져왔다. **묻는 것은 저장 화면의 모달이 한다**(Survey.tsx) —
 * 여기 칸은 모달을 닫은 뒤 마음이 바뀌었을 때 다시 누를 자리다 (배포본과 같은 짜임).
 * 주소가 없으면(설문을 꺼 뒀으면) 칸을 아예 안 그린다 — 눌리지 않는 빈 버튼을 두지 않는다.
 *
 * 모양은 배포본 `.done` 그대로다 (app.css) — 가운데 정렬 · 위 48px · 작은 제목 22px ·
 * 거드는 한 줄 · 가로줄 가운데의 네모 버튼. 다른 화면의 알약 버튼(`.go`)을 쓰지 않는 것도
 * 배포본과 같다. 로고 줄도 없다 (배포본 끝 화면은 로고를 안 그린다 — app.css `.app:has(.done)`).
 */

import { surveyLink } from "../survey-link";
import "../survey.css";
import { useLang } from "../i18n/useLang";

export default function Done({ onRestart }: { onRestart: () => void }) {
  const { t } = useLang();
  const survey = surveyLink();

  return (
    <section className="screen done">
      <h1>{t("done.title")}</h1>
      <p className="muted">{t("done.body")}</p>

      {survey && (
        <div className="done-survey">
          <p>{t("done.surveyAsk")}</p>
          <a className="primary" href={survey} target="_blank" rel="noopener noreferrer">
            {t("done.surveyGo")}
          </a>
        </div>
      )}

      <div className="row">
        <button type="button" className="primary" onClick={onRestart}>
          {t("done.restart")}
        </button>
      </div>
    </section>
  );
}
