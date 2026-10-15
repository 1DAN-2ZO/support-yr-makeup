/**
 * 앱이 시작하다(또는 그리다) 실패했을 때 — 본 앱 `main.ts` `showBootError` (#454 C6).
 * 그냥 두면 사용자가 **빈 화면**을 본다 — 무엇이 잘못됐는지도, 무엇을 해야 하는지도 모른다.
 * 모양은 닫힌 화면(`Closed`)과 같은 자리 · 같은 글 크기다
 *
 * 말 고르기(`useLang`)를 **쓰지 않는다** — 이 화면은 `main.tsx` 의 오류 울타리가 그리는데,
 * 그 울타리는 `LangProvider` **밖**에 있다 (묶음 자체가 터졌을 수도 있어서 안에 둘 수 없다).
 * 그래서 폰 설정만 보고 한 번 고른다.
 */
import { detectLang, text } from "../i18n";
export default function BootError() {
  const lang = detectLang();
  return (
    <section className="screen done">
      <h1>{text(lang, "boot.title")}</h1>
      <p className="muted">{text(lang, "boot.body")}</p>
      <button type="button" className="primary" onClick={() => location.reload()}>
        {text(lang, "boot.reload")}
      </button>
    </section>
  );
}
