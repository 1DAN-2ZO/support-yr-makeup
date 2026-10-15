/**
 * 지금 말과 바꾸는 길 — 앱 전체가 같은 값을 보게 한다.
 *
 * **폰에 저장하지 않는다.** 동의문에 "폰에 따로 저장하는 것이 없어요" 라고 적어 둬서,
 * 창을 닫으면 폰 설정을 따르는 처음 상태로 돌아간다 (i18n/index.ts 머리글).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { detectLang, text, type Key, type Lang } from "./index";

interface LangBox {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** 글 하나. `t("intro.start")` */
  t: (key: Key, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<LangBox | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  // 처음 한 번만 폰 설정을 본다 — 그 뒤로는 고른 값을 따른다
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => text(lang, key, vars), [lang]);
  const box = useMemo(() => ({ lang, setLang, t }), [lang, t]);
  // 화면을 읽어 주는 기기가 어느 말인지 알아야 제대로 읽는다.
  // 그리는 **중**에 바꾸면 안 된다 (화면 밖을 건드리는 일이라) — 다 그린 뒤에 한 번 적는다
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <Ctx.Provider value={box}>{children}</Ctx.Provider>;
}

export function useLang(): LangBox {
  const v = useContext(Ctx);
  if (!v) throw new Error("LangProvider 안에서만 쓸 수 있어요");
  return v;
}
