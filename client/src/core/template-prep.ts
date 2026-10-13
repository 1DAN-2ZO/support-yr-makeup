/**
 * 화장 템플릿 (#420) — 우리가 준비한 화장 10종. 참고 사진 대신 고르는 화장 출처다.
 *
 * 사용자가 올린 참고 사진은 올릴 때마다 얼굴을 찾고 색을 읽는다 (screens/ref-analyze). 템플릿은 사진이 정해져 있으니
 * 색 읽기를 미리 해 두고(개발용 페이지 template-build.html), 앱은 결과만 읽는다:
 *
 *   public/templates/prep/templates.json   번호별 색 팔레트 (분석 결과와 같은 모양) — 이 파일
 *
 * **서버로는 사진을 보내지 않는다 — 템플릿 번호(1~10)만 보낸다** (core/transfer-client 의 { template }).
 * 서버가 같은 번호의 템플릿 사진을 직접 갖고 있다 (server/app/templates/NN.webp, server/app/templates.py).
 * 이름 · 설명 · 썸네일은 core/templates.ts(고르는 화면, #433)가 갖고 있다 — 여기에는 두지 않는다.
 * 번호(id)는 그쪽과 같은 "01"~"10" 이다.
 *
 * 순수 함수 + 주입받은 fetch 라서 Node 에서도 돈다. 화면은 여기를 모른다 (고르는 화면은 flow-slots).
 */

import type { RefColors } from "./ref-colors";

export interface TemplateEntry {
  /** core/templates.ts 의 MakeupTemplate.id 와 같은 번호 — 서버로 보내는 번호도 이것이다 ("03" → 3) */
  id: string;
  colors: RefColors;
}

export interface TemplateManifest {
  /** 템플릿을 바꿀 때 올린다 — 로그 · 결과를 구분하려고 (예: tpl-v1) */
  version: string;
  items: TemplateEntry[];
}

/** 화면 3 이 쓰는 "참고 사진을 분석한 결과" 와 같은 모양 (screens/ref-analyze 의 RefAnalysis) */
export interface TemplateAnalysis {
  colors: RefColors;
  /** 화면에 보여 줄 사진 주소 */
  preview: string;
  w: number;
  h: number;
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DIR = "templates/prep";
/** 고르는 화면의 썸네일 크기 (#433) — 분석 결과의 크기 칸에 쓴다 */
const THUMB_W = 300;
const THUMB_H = 400;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** 목록을 읽는다. 틀리면 어느 템플릿인지 말하고 던진다 — 화면이 빈 칸을 조용히 보여 주지 않게 */
export function parseTemplateManifest(raw: unknown): TemplateManifest {
  if (!isObj(raw)) throw new Error("템플릿 목록이 객체가 아니에요");
  if (!isText(raw.version)) throw new Error("템플릿 목록에 version 이 없어요");
  if (!Array.isArray(raw.items) || raw.items.length === 0) throw new Error("템플릿 목록이 비었어요");

  const seen = new Set<string>();
  const items = raw.items.map((it: unknown, i): TemplateEntry => {
    const id = isObj(it) && isText(it.id) ? it.id : "";
    const at = id || `#${i + 1}`;
    if (!isObj(it) || !id) throw new Error(`템플릿 ${at}: id 가 없어요`);
    if (!/^\d+$/.test(id)) throw new Error(`템플릿 ${id}: id 는 숫자여야 해요 (서버로 보내는 번호)`);
    if (seen.has(id)) throw new Error(`템플릿 ${id}: 번호가 겹쳐요`);
    seen.add(id);
    if (!isObj(it.colors)) throw new Error(`템플릿 ${id}: colors 가 없어요`);
    return { id, colors: it.colors as RefColors };
  });
  return { version: raw.version, items };
}

/** base = import.meta.env.BASE_URL 처럼 슬래시로 끝나는 주소 */
export async function loadTemplateManifest(base: string, fetchFn: FetchFn = fetch): Promise<TemplateManifest> {
  const res = await fetchFn(`${base}${DIR}/templates.json`);
  if (!res.ok) throw new Error(`템플릿 목록을 못 읽었어요 (${res.status})`);
  return parseTemplateManifest(await res.json());
}

/** 서버로 보내는 템플릿 번호 — "03" → 3 */
export function templateNumber(id: string): number {
  return Number.parseInt(id, 10);
}

/** 번호의 준비물 → 화면 3 이 쓰는 분석 결과. 분석은 다시 하지 않는다. 없으면 null */
export function templateAnalysis(manifest: TemplateManifest, id: string, preview: string): TemplateAnalysis | null {
  const entry = manifest.items.find((t) => t.id === id);
  return entry ? { colors: entry.colors, preview, w: THUMB_W, h: THUMB_H } : null;
}
