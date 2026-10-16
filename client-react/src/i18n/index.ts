/**
 * 한국어 · 영어 (2026-10-16).
 *
 * 화면 글을 코드에서 빼내 **열쇠로 부른다** — `t("attempt.start")` 처럼.
 * 글은 `ko.ts` · `en.ts` 두 벌이고, 열쇠가 같아야 한다 (`checkKeys` 가 시험에서 확인).
 *
 * ── 정한 것 ──
 *
 * **번역하지 않는 것**: 제품 이름(「롬앤 쥬시 래스팅 틴트」)과 색 계열 이름(「뮤트 로즈브라운」).
 * 번역하면 실제로 사러 갈 때 못 찾는다. 영어 화면에서도 한글 그대로 나간다.
 *
 * **고른 말을 폰에 저장하지 않는다.** 동의문에 "폰에 따로 저장하는 것이 없어요" 라고 적어
 * 두었다 (`screens/Consent.tsx`). 그래서 창을 닫으면 **폰 설정을 따르는 처음 상태**로
 * 돌아간다 — 저장하려면 그 안내문부터 고쳐야 한다.
 */

import { EN } from "./en";
import { KO } from "./ko";

export type Lang = "ko" | "en";
export type Key = keyof typeof KO;

const TABLE: Record<Lang, Record<string, string>> = { ko: KO, en: EN };

/**
 * 폰 설정을 보고 처음 말을 고른다.
 * 한국어로 읽는 사람에게는 한국어를, 그 밖에는 영어를 준다 — 안내가 안 읽히는 것보다 낫다.
 */
export function detectLang(): Lang {
  const list = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  for (const raw of list) {
    const l = (raw ?? "").toLowerCase();
    if (l.startsWith("ko")) return "ko";
    if (l.startsWith("en")) return "en";
  }
  return "en";
}

/**
 * 이 이름의 글이 있나. 글자를 **만들어서** 찾을 때만 쓴다 (예: `tpl.name.07`) —
 * 코어에 템플릿이 하나 늘면 글이 없을 수 있어서, 없으면 코어 글을 그대로 쓰게 하려는 것이다.
 */
export function hasKey(k: string): k is Key {
  return k in KO;
}

/** 글 하나. 없는 열쇠면 **한국어로 떨어진다** — 화면이 비는 것보다 낫다 */
export function text(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const s = TABLE[lang][key] ?? KO[key] ?? String(key);
  if (!vars) return s;
  // {이름} 자리에 값을 끼운다
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/*
 * ── 두 벌의 열쇠가 어긋나면 **빌드가 깨진다** ──
 *
 * 이 폴더에는 시험 틀이 없다 (화면 테스트를 두지 않기로 했다 — 전지원이 직접 본다).
 * 그래서 자동으로 걸릴 자리가 타입뿐이다. `npm run build` 가 `tsc -b` 를 먼저 돌리니
 * 한쪽에만 있는 열쇠가 생기면 그때 바로 멈춘다 — 영어 화면에 빈 글이 나가는 것을 막는다.
 *
 * 걸리면 오류 글에 남은 열쇠 이름이 그대로 찍힌다. 그 열쇠를 없는 쪽에 채우면 된다.
 */
type Only<A extends string, B extends string> = Exclude<A, B>;
type Empty<T extends never> = T;

/** 한국어에만 있는 열쇠 — 있으면 여기서 타입 오류가 난다 */
export type NoKoOnlyKeys = Empty<Only<keyof typeof KO & string, keyof typeof EN & string>>;
/** 영어에만 있는 열쇠 — 있으면 여기서 타입 오류가 난다 */
export type NoEnOnlyKeys = Empty<Only<keyof typeof EN & string, keyof typeof KO & string>>;
