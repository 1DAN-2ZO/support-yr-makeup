/**
 * 어느 링크로 들어왔는지 읽기 (2026-10-12, 모듈 ⑥ — #408 마케팅 요청).
 *
 * 홍보 글 · 영상의 링크에는 `?utm_source=youtube&utm_campaign=tester-flow&utm_content=description` 같은
 * 꼬리가 붙어 나간다. 앱을 켤 때 이것을 읽어 사용 기록의 `landing` 줄에 남긴다 (main.ts) —
 * 어느 글이 사람을 앱으로 데려왔는지를 세려는 것이고, 누구인지는 남지 않는다 (세션 번호는 켤 때마다 새 무작위 값).
 * 세는 것은 eval/funnel/show.py 의 "어디서 왔나" 표.
 *
 * 값은 영문 · 숫자 · `-_.` 만 남기고 40자로 자른다 — 주소창에 아무 글이나 넣어 기록을 더럽히지 못하게.
 * 꼬리가 없으면 출처를 `direct` 로 적는다.
 */

export interface Utm {
  utm_source: string;
  utm_campaign: string | null;
  utm_content: string | null;
}

const MAX = 40;

function clean(v: string | null): string | null {
  const s = (v ?? "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, MAX);
  return s === "" ? null : s;
}

/** `location.search` → 들어온 길. 깨진 주소에도 던지지 않는다 */
export function readUtm(search: string): Utm {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { q = new URLSearchParams(); }
  return {
    utm_source: clean(q.get("utm_source")) ?? "direct",
    utm_campaign: clean(q.get("utm_campaign")),
    utm_content: clean(q.get("utm_content")),
  };
}
