/**
 * 코어가 주는 한국어 글을 화면 말로 바꾸는 곳 (2026-10-16).
 *
 * ── 왜 이렇게 하나 ──
 *
 * 촬영 안내("조금 더 가까이")와 템플릿 이름("가을")은 `client/src/core/` 에서 온다.
 * 코어는 **본 앱(`client/`)과 함께 쓰는 폴더**라 이 작업에서 건드리지 않기로 했다 —
 * 고치면 본 앱 화면까지 같이 바뀌고, 그쪽은 다른 사람이 맡고 있다.
 *
 * 그래서 코어를 고치는 대신, 코어가 **내보내 둔 글 묶음**(`SHOT_TEXT` · `STEP_TEXT` ·
 * `SLOW_HINT` · `TEMPLATES`)을 그대로 읽어 "이 글자 = 이 열쇠" 표를 만든다. 코어는 읽기만 한다.
 *
 * ── 이 방식의 한계 (알고 쓰는 것) ──
 *
 * 코어가 글을 **새로 만들어 조립하는 것**(피드백 문장 `feedback-whole`)은 이 표로 못 바꾼다.
 * 글자가 매번 달라서 표에서 찾을 수가 없다. 그쪽은 코어를 고쳐야 하고, 아직 안 했다.
 *
 * 코어가 글을 바꾸면 표에서 못 찾는 줄이 생긴다. 그때는 **한국어가 그대로 나온다** —
 * 빈 칸이 뜨는 것보다 낫다. 개발 중에는 콘솔에 한 번 남겨 두어 눈에 띄게 한다.
 */

import { SHOT_TEXT, SHOTS } from "@core/flow";
import { SLOW_HINT, STEP_TEXT } from "@core/capture-run";
import type { MakeupTemplate } from "@core/templates";
import { hasKey, type Key } from "../i18n";

/**
 * 촬영 안내 — 코어 글자 → 열쇠.
 *
 * `SHOT_TEXT` 의 열쇠를 그대로 `shot.*` 에 갖다 붙인다. 코어에 글이 하나 늘면 여기서
 * 바로 타입이 깨지지는 않지만(아래 표는 글자로 찾으니까) 그 줄만 한국어로 나온다.
 *
 * `stable` 과 `ready` 는 코어에서 **글자가 같다** ("그대로 Stop!"). 표에서는 한 칸이 되고,
 * 어느 쪽이든 같은 말이 나오니 문제가 되지 않는다. `none` 은 빈 글자라 넣지 않는다 —
 * 빈 글자를 표에 넣으면 "안내 없음" 까지 번역하러 들어온다.
 */
const SHOT_KEY: Readonly<Record<string, Key>> = {
  [SHOT_TEXT.cut]: "shot.cut",
  [SHOT_TEXT.occluded]: "shot.occluded",
  [SHOT_TEXT.bangs]: "shot.bangs",
  [SHOT_TEXT.front]: "shot.front",
  [SHOT_TEXT.open]: "shot.open",
  [SHOT_TEXT.near]: "shot.near",
  [SHOT_TEXT.far]: "shot.far",
  [SHOT_TEXT.sharp]: "shot.sharp",
  [SHOT_TEXT.bright_low]: "shot.bright_low",
  [SHOT_TEXT.bright_high]: "shot.bright_high",
  [SHOT_TEXT.color]: "shot.color",
  [SHOT_TEXT.ready]: "shot.ready",
  [STEP_TEXT.front_open]: "shot.step.front_open",
  [SLOW_HINT]: "shot.slowHint",
};

/**
 * 찍은 장 이름 — 코어 `SHOTS` 의 `name` ("정면 · 눈 뜸"). 다 찍은 뒤 확인 화면의 사진 밑에 붙는다.
 * 위와 같은 방식이다: 코어는 읽기만 하고, 번호(`id`)로 우리 글을 찾는다.
 */
export function shotName(t: (k: Key) => string, id: string, fallback: string): string {
  const key = `shot.name.${id}`;
  return hasKey(key) ? t(key) : fallback;
}

/** 장이 늘었는데 글을 안 넣어 두면 한국어가 그대로 샌다 — 개발 중에 한 번 알려 준다 */
if (import.meta.env.DEV) {
  const 빠진장 = SHOTS.filter((s) => !hasKey(`shot.name.${s.id}`)).map((s) => s.id);
  if (빠진장.length) console.warn("[i18n] 이름 글이 없는 촬영 장:", 빠진장);
}

/** 표에 없어서 한국어로 내보낸 글 — 같은 글을 콘솔에 두 번 적지 않으려고 모아 둔다 */
const warned = new Set<string>();

/**
 * 코어가 준 안내 한 줄을 화면 말로. 표에 없으면 **받은 글 그대로** 돌려준다.
 *
 * @param t   `useLang()` 의 글 꺼내는 함수
 * @param raw 코어가 준 글 (`gate.text` · `STEP_TEXT[...]` · `hint`)
 */
export function shotText(t: (k: Key) => string, raw: string): string {
  if (!raw) return raw;
  const key = SHOT_KEY[raw];
  if (key) return t(key);
  if (import.meta.env.DEV && !warned.has(raw)) {
    warned.add(raw);
    console.warn("[i18n] 코어 안내에 짝이 되는 글이 없어요:", raw);
  }
  return raw;
}

/**
 * 화장 템플릿 하나를 화면 말로 싸서 돌려준다 — 번호(`id`)로 찾는다.
 *
 * 번호는 코어가 "템플릿을 나중에 바꿔도 번호로 가른다" 고 적어 둔 값이라 이름보다 안 흔들린다.
 * 번호에 맞는 글이 없으면 코어 글을 그대로 쓴다 (템플릿이 늘었을 때).
 *
 * 사진(`thumb`)과 번호는 건드리지 않는다 — 서버로 가는 것은 사진과 번호다.
 */
export function templateText(t: (k: Key) => string, tpl: MakeupTemplate): MakeupTemplate {
  const name = `tpl.name.${tpl.id}` as Key;
  const about = `tpl.about.${tpl.id}` as Key;
  if (!hasKey(name) || !hasKey(about)) return tpl;
  return { ...tpl, name: t(name), about: t(about) };
}

/*
 * ── 색 이름 ──
 *
 * 코어가 색을 `{ text, base, tone }` 으로 쪼개 준다 (`@core/color-name` 의 `describeColor`).
 *   text  화면에 쓰는 글 — "뮤트 로즈브라운"
 *   base  바탕 이름 — "로즈브라운"
 *   tone  꾸밈말 — "뮤트"
 *
 * **바꾸는 것은 `text` 뿐이다.** `base` 는 제품을 찾을 때 쓰는 값이라(`pickProducts` 가
 * 계열 이름을 **글자로** 맞춘다) 건드리면 추천이 조용히 0개가 된다 — 전에 계열 이름이
 * 어긋나 그런 적이 있다. 그래서 여기서는 **보여 줄 글만** 만들어 돌려준다.
 *
 * 표에 없는 이름이 오면 **한국어 그대로** 내보낸다. 코어가 색 이름을 늘렸을 때다.
 */
const HUE_KEY: Readonly<Record<string, Key>> = {
  "골드": "hue.gold",
  "그레이": "hue.grey",
  "그레이베이지": "hue.greige",
  "그레이브라운": "hue.greyBrown",
  "네이비": "hue.navy",
  "누드베이지": "hue.nudeBeige",
  "누드핑크": "hue.nudePink",
  "다크브라운": "hue.darkBrown",
  "딥레드": "hue.deepRed",
  "딥브라운": "hue.deepBrown",
  "라벤더": "hue.lavender",
  "라이트브라운": "hue.lightBrown",
  "레드": "hue.red",
  "레드브라운": "hue.redBrown",
  "로즈": "hue.rose",
  "로즈브라운": "hue.roseBrown",
  "모브": "hue.mauve",
  "밀크브라운": "hue.milkBrown",
  "버건디": "hue.burgundy",
  "베이지": "hue.beige",
  "베이지핑크": "hue.beigePink",
  "브라운": "hue.brown",
  "브릭": "hue.brick",
  "블랙": "hue.black",
  "살구": "hue.apricot",
  "소프트블랙": "hue.softBlack",
  "애쉬브라운": "hue.ashBrown",
  "오렌지": "hue.orange",
  "올리브": "hue.olive",
  "차콜": "hue.charcoal",
  "체리": "hue.cherry",
  "초코브라운": "hue.chocoBrown",
  "카키": "hue.khaki",
  "카키브라운": "hue.khakiBrown",
  "코랄": "hue.coral",
  "토프": "hue.taupe",
  "퍼플": "hue.purple",
  "플럼": "hue.plum",
  "피치": "hue.peach",
  "핑크": "hue.pink",
  "MLBB": "hue.mlbb",
};

const TONE_KEY: Readonly<Record<string, Key>> = {
  "뮤트": "tone.muted",
  "딥": "tone.deep",
  "라이트": "tone.light",
  "비비드": "tone.vivid",
};

/** 바탕 이름 하나를 화면 말로 — 「로즈브라운」 → "Rose brown" */
export function hueText(t: (k: Key) => string, base: string): string {
  const key = HUE_KEY[base];
  return key ? t(key) : base;
}

/**
 * 색 이름 한 덩어리를 화면 말로 — 꾸밈말이 있으면 앞에 붙인다.
 * 한국어일 때도 같은 길을 지난다 (표의 한국어 글이 코어 글과 같아서 보이는 것은 그대로다).
 */
export function colorText(t: (k: Key) => string, name: { text: string; base: string; tone: string }): string {
  const base = HUE_KEY[name.base];
  if (!base) return name.text;
  const head = name.tone ? TONE_KEY[name.tone] : undefined;
  return head ? `${t(head)} ${t(base)}` : t(base);
}
