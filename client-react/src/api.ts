/**
 * 데이터를 가져오는 곳 — 지금은 미리 만들어 둔 JSON 을 읽는다.
 *
 * **서버에 붙일 때 고칠 파일은 여기 하나다.** 화면은 이 파일이 돌려주는 모양만 알지,
 * 그 값이 파일에서 왔는지 서버에서 왔는지 모른다. 그래서 `fetch` 주소만 바꾸면
 * 화면 코드는 한 줄도 안 건드려도 된다.
 *
 * 지금 읽는 `templates.json` 은 본 앱(support-yr-makeup)에서 템플릿 10종의 부위별 색을
 * 미리 재 둔 것이다. 그래서 이 버전은 카메라도 얼굴 인식도 없이 돈다.
 *
 * 2026-10-14 에 **정답사진(예상 메이크업) 만들기**가 들어왔다 (아래 `API_BASE` · `makeAnswerPicture`).
 * 그 하나만 진짜 서버를 부른다 — 색은 여전히 폰 안에서 끝난다 (올린 사진은 `lib/ref-analyze`,
 * 템플릿은 위의 `templates.json`).
 */

import { hexToRgb } from "@core/color-family";
import type { PalettePart } from "@core/color-family";
import { describeColor } from "@core/color-name";
import type { RefColors } from "@core/ref-colors";
import { requestTransfer } from "@core/transfer-client";
import type { TransferRef } from "@core/transfer-client";
import type { MakeResult } from "./lib/answer-make";
import { PART_ORDER } from "./parts";

/** 색 하나에 붙는 이름 — "뮤트 레드브라운" 처럼 꾸밈말(tone) 과 계열(base) 로 나뉜다 */
export interface ColorName {
  text: string;
  base: string;
  tone: string;
}

/**
 * 한 부위에서 읽은 색.
 *
 * `hex` 는 **사진에 보이는 색**, `product.hex` 는 **피부를 걷어낸 색**이다. 둘이 다른 이유는
 * 화장이 피부 위에 얇게 얹혀 밑색이 비치기 때문이다 — 동그라미에는 보이는 색을 쓰고,
 * 제품을 고를 때는 양쪽 계열을 다 넣는다.
 */
export interface ReadColor {
  hex: string;
  rgb: [number, number, number];
  name: ColorName;
  product: { hex: string; rgb: [number, number, number]; name: ColorName };
}

export type PartColors = Record<PalettePart, ReadColor>;

interface PrepFile {
  version: string;
  items: { id: string; colors: PartColors }[];
}

/** 한 번 읽으면 들고 있는다 — 템플릿을 바꿔 가며 볼 때 매번 받지 않게 */
let cache: Promise<PrepFile> | null = null;

function load(): Promise<PrepFile> {
  cache ??= fetch("/templates/prep/templates.json")
    .then((r) => {
      if (!r.ok) throw new Error(`준비물을 못 읽었어요 (${r.status})`);
      return r.json() as Promise<PrepFile>;
    })
    // 실패한 약속까지 들고 있으면 화면의 "다시 시도" 가 영영 같은 실패를 돌려받는다.
    // 들고 있는 것은 **성공한 것만** — 실패하면 비워서 다음 번에 다시 받아 오게 한다
    .catch((e: unknown) => {
      cache = null;
      throw e;
    });
  return cache;
}

/**
 * 템플릿 하나의 부위별 색.
 *
 * 서버에 붙이면 이 자리가 "올린 사진을 보내고 색을 받아오는" 호출이 된다.
 */
export async function templateColors(id: string): Promise<PartColors> {
  const file = await load();
  const found = file.items.find((it) => it.id === id);
  if (!found) throw new Error(`템플릿 ${id} 의 색이 없어요`);
  return found.colors;
}

/** 서버로 보내는 템플릿 번호 — "03" → 3 (본 앱 core/template-prep 의 `templateNumber`) */
export function templateNumber(id: string): number {
  return Number.parseInt(id, 10);
}

/* ───────── 올린 사진에서 읽은 색 → 화면이 받는 모양 ───────── */

/**
 * 못 읽은 부위에 넣을 견본 색 (본 앱 flow-slots 의 `SAMPLE_COLOR` 와 같은 값).
 *
 * 올린 사진은 부위 다섯이 다 읽히지 않을 수 있다 — 앞머리에 덮인 눈썹, 눈을 감은 사진,
 * 볼이 잘린 사진. 그런데 다음 화면들(`PartColors`)은 **다섯 부위가 다 있어야** 그린다.
 * 그 자리를 비워 두면 화면이 깨지고, 그렇다고 못 읽은 부위 하나 때문에 흐름을 막으면
 * 올린 사람이 처음으로 돌아가야 한다. 그래서 본 앱이 부위 가이드에서 하던 것과 같이
 * **견본 색으로 메꾸고 그대로 간다** — 몇 부위를 읽었는지는 정답사진 화면이 글로 말해 준다.
 */
const SAMPLE_HEX: Record<PalettePart, string> = {
  brow: "#5c4a42",
  liner: "#2b2523",
  shadow: "#8b6f5e",
  lip: "#c08878",
  cheek: "#e89477",
};

/** 견본 hex 하나 → 읽은 색과 같은 모양. 이름은 읽은 색과 **같은 길**로 짓는다 (core/color-name) */
function sampleColor(part: PalettePart): ReadColor {
  const rgb = hexToRgb(SAMPLE_HEX[part]);
  const name = describeColor(rgb, part);
  return { hex: SAMPLE_HEX[part], rgb, name, product: { hex: SAMPLE_HEX[part], rgb, name } };
}

/**
 * 사진에서 읽은 색(`core/ref-colors` 의 `RefColors`) → 화면이 받는 `PartColors`.
 *
 * 읽은 색의 모양은 이미 `ReadColor` 와 같다 (`hex` · `rgb` · `name` · `product`) — 본 앱이
 * 템플릿 색을 미리 재 둘 때 쓴 것도 같은 함수라서 그렇다. 여기서 하는 일은 **빈 부위 메꾸기**뿐이다.
 */
export function refToPartColors(colors: RefColors): PartColors {
  return Object.fromEntries(
    PART_ORDER.map((part) => [part, colors[part] ?? sampleColor(part)]),
  ) as PartColors;
}

/** 사진에서 몇 부위를 읽었나 — 정답사진 화면이 "다섯 중 셋" 같은 말을 할 때 쓴다 */
export function refReadCount(colors: RefColors): number {
  return PART_ORDER.filter((part) => colors[part]).length;
}

/* ───────── 정답사진(예상 메이크업) 서버 ───────── */

/**
 * **서버 주소를 정하는 곳은 여기 한 줄이다.**
 *
 * 띄울 때 `VITE_API_BASE` 로 받는다 — `.env.local` 에 `VITE_API_BASE=https://…` 한 줄을 적거나
 * `VITE_API_BASE=… npm run dev` 로 띄우면 그때부터 정답사진이 만들어진다. 빈 값이면
 * "서버가 아직 안 붙었다" 로 다룬다 (아래 `makeAnswerPicture` 가 `off` 로 답한다).
 *
 * 본 앱은 프론트와 백이 **같은 주소**라서 빈 값이 곧 "같은 주소" 다 (nginx 가 `/transfer` 를 넘긴다).
 * 이 버전은 혼자 뜨는 화면이라 빈 값을 같은 주소로 보면 Vite 개발 서버에 `POST /transfer` 를 쏴서
 * index.html 을 받아 온다 — 그래서 빈 값은 "꺼짐" 으로 갈라 둔다
 */
const RAW_BASE: unknown = import.meta.env.VITE_API_BASE;
export const API_BASE: string = typeof RAW_BASE === "string" ? RAW_BASE.trim() : "";

/** 서버 주소가 들어와 있나 — 화면이 "아직 안 붙었어요" 를 먼저 말할 때 쓴다 */
export const hasAnswerServer = API_BASE !== "";

/**
 * 지금 보내고 있는 것 — **같은 사진으로 두 번 눌러도 한 번만 보낸다** (본 앱 `core/picture-maker` 의 규칙).
 *
 * 같은 출처면 앞서 보낸 것의 답을 같이 기다리고, **다른 출처**면 앞의 답을 그 사진의 답인 것처럼
 * 돌려주지 않고 "만드는 중"(busy) 으로 답한다. GPU 한 장이 8~9초라 두 번 보내면 그만큼 더 기다린다
 */
let running: { ref: TransferRef; p: Promise<MakeResult> } | null = null;

/** 같은 출처인가 — 사진은 같은 Blob, 템플릿은 같은 번호 (본 앱 `sameRef`) */
function sameRef(a: TransferRef, b: TransferRef): boolean {
  if (a instanceof Blob || b instanceof Blob) return a === b;
  return a.template === b.template;
}

/**
 * 맨얼굴 + 참고 사진(또는 템플릿 번호) → 정답사진 한 장 (백엔드 `POST /transfer`).
 *
 * 실패를 던지지 않고 **까닭으로** 돌려준다 — 화면이 까닭마다 다른 말을 하고 흐름을 막지 않게
 * (`lib/answer-make` 의 `makeFailText`). 맨얼굴이 없으면 서버를 부르지도 않는다
 */
export function makeAnswerPicture(bare: Blob | null, ref: TransferRef): Promise<MakeResult> {
  if (!bare) return Promise.resolve({ ok: false, why: "no_bare" });
  if (!hasAnswerServer) return Promise.resolve({ ok: false, why: "off" });
  if (running) return sameRef(running.ref, ref) ? running.p : Promise.resolve({ ok: false, why: "busy" });
  const p = requestTransfer(bare, ref, { base: API_BASE }).finally(() => {
    if (running?.p === p) running = null;
  });
  running = { ref, p };
  return p;
}
