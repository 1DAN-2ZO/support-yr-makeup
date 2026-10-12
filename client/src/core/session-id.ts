/**
 * 세션 번호 붙들기 · 설문에 채워 열기 (2026-10-12, 모듈 ⑥ — #385).
 *
 * 세션 번호(sid)는 사용 기록과 테스트 기간 보관 사진에 붙는 무작위 값이다. 지워 달라는 요청이 오면 이것으로 그 사람의 것을 찾는다.
 * 전에는 앱을 켤 때마다 새로 만들어서, 중간에 새로고침한 사람의 사진이 번호 여러 개로 흩어졌다.
 *
 * - 폰(localStorage)에 적어 두고 다시 켜면 같은 번호를 쓴다. 폰에 둔 세션이 지워지는 때(2시간)가 지나면 새 번호
 * - 끝내기 · 지우고 다시 시작이면 폰에서 지운다 (drop). 다시 시작하면 새 번호 (renew)
 * - 번호는 무작위 값 하나뿐이다 — 이름 · 기기 정보를 담지 않는다. 폰의 다른 세션 데이터처럼 끝내면 지워진다
 * - 저장소를 못 쓰는 브라우저(비공개 창 등)에서는 전처럼 켤 때마다 새 번호
 *
 * 설문(구글 폼)에는 이 번호를 채운 주소로 연다 (surveyUrlFor) — 설문에 "세션 번호" 칸이 있고 그 칸 번호(entry.숫자)를 알 때만.
 */

export const SID_KEY = "nudy.sid";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface SidHolderOptions {
  /** 폰 저장소 (localStorage). 없으면 붙들지 않는다 */
  storage: Store | null;
  now?: () => number;
  make?: () => string;
  /** 이만큼 안 쓰면 새 번호 — 폰에 둔 세션이 지워지는 때와 같게 준다 (session-store DRAFT_TTL_MS) */
  ttlMs: number;
}

export interface SidHolder {
  /** 지금 세션 번호 */
  sid(): string;
  /** 쓰는 중임을 적는다 (화면이 바뀔 때) — 그때부터 다시 센다 */
  touch(): void;
  /** 폰에서 지운다 (끝내기). 번호는 다시 시작할 때까지 들고 있는다 */
  drop(): void;
  /** 새 번호로 바꾼다 (다시 시작) */
  renew(): string;
}

export function createSidHolder(opts: SidHolderOptions): SidHolder {
  const now = opts.now ?? Date.now, make = opts.make ?? (() => crypto.randomUUID());
  let dropped = false;
  const write = (sid: string): void => {
    try { opts.storage?.setItem(SID_KEY, JSON.stringify({ sid, t: now() })); } catch { /* 못 적어도 돈다 */ }
  };
  const read = (): string | null => {
    try {
      const raw = opts.storage?.getItem(SID_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw) as { sid?: unknown; t?: unknown };
      if (typeof v.sid !== "string" || !v.sid || typeof v.t !== "number") return null;
      return now() - v.t <= opts.ttlMs ? v.sid : null;
    } catch {
      return null;
    }
  };
  let sid = read() ?? make();
  write(sid);
  return {
    sid: () => sid,
    touch() { if (!dropped) write(sid); },
    drop() {
      dropped = true;
      try { opts.storage?.removeItem(SID_KEY); } catch { /* 못 지워도 돈다 — 2시간 뒤에는 안 쓴다 */ }
    },
    renew() {
      sid = make();
      dropped = false;
      write(sid);
      return sid;
    },
  };
}

/**
 * 설문 주소에 세션 번호를 채운다. entry 는 설문의 "세션 번호" 칸 번호(`entry.123456`) — 없거나 모양이 아니면 주소 그대로.
 * 설문 주소가 없으면 null (설문을 끈 것)
 */
export function surveyUrlFor(base: string | null | undefined, entry: string | null | undefined, sid: string): string | null {
  if (!base) return null;
  if (!entry || !/^entry\.\d+$/.test(entry)) return base;
  return `${base}${base.includes("?") ? "&" : "?"}usp=pp_url&${entry}=${encodeURIComponent(sid)}`;
}
