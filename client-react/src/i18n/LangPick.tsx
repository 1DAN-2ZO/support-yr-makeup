/**
 * 말 고르기 단추 — 안내 화면 아래 패널에 둔다 (2026-10-16, 전지원이 자리를 정했다).
 *
 * 여기 둔 까닭: 시작하기 전에 한 번 고르는 것이고, 촬영에 들어가면 바꿀 일이 없다.
 * 모든 화면에 두면 로고 줄이 붐빈다.
 */

import { useLang } from "./useLang";
import type { Lang } from "./index";

const LANGS: readonly { id: Lang; key: "lang.ko" | "lang.en" }[] = [
  { id: "ko", key: "lang.ko" },
  { id: "en", key: "lang.en" },
];

export default function LangPick() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="lang-pick" role="group" aria-label={t("lang.label")}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          className={l.id === lang ? "lang-btn is-on" : "lang-btn"}
          aria-pressed={l.id === lang}
          onClick={() => setLang(l.id)}
        >
          {t(l.key)}
        </button>
      ))}
    </div>
  );
}
