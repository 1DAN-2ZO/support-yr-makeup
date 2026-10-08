/**
 * 그림 만들기 부르기 (2026-10-08, 모듈 ⑥ 백 연결) — 앱 → 백엔드 `POST /transfer` → GPU 의 FLUX 서버 → 그림 한 장.
 *
 * 맨얼굴(bare) + 화장 사진(ref)을 올리면 화장을 입힌 내 얼굴이 온다. 정답사진(ref = 참고 사진)과
 * 옮긴 그림(ref = 시도사진 눈 뜬 장)이 같은 길이다. 서버 쪽은 server/app/flux.py.
 * 서버는 같은 주소에 있다 (프론트 nginx 가 /transfer 를 백엔드로 넘긴다) — 따로 주면 그 주소를 쓴다.
 *
 * 실패는 던지지 않고 까닭으로 돌려준다 — 화면이 까닭마다 다르게 안내한다:
 *   off 꺼져 있음(주소 설정 전) · busy 줄이 꽉 참 · down GPU 서버가 꺼졌거나 이상함 · rejected 그릴 수 없는 사진(얼굴을 못 찾음 등)
 *   · too_large 사진이 너무 큼 · timeout 너무 오래 걸림 · network 인터넷이 끊김
 */

export type TransferFail = "off" | "busy" | "down" | "rejected" | "too_large" | "timeout" | "network";

export type TransferResult =
  | { ok: true; picture: Blob; /** 서버가 그리는 데 걸린 시간 (모르면 null) */ ms: number | null }
  | { ok: false; why: TransferFail; /** 서버가 한 말 (rejected 일 때 — 예: 얼굴을 못 찾았어요) */ message?: string };

export interface TransferOptions {
  /** 서버 주소. 없으면 같은 주소 */
  base?: string;
  fetchFn?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** 이만큼 지나면 그만 기다린다. 서버를 켜고 첫 장은 1분 넘게 걸릴 수 있다 */
  timeoutMs?: number;
}

/** 한 장 8~9초 · 줄을 서면 그 몇 배 · 서버를 막 켰으면 100초쯤 (#342) */
export const TRANSFER_TIMEOUT_MS = 180_000;

const CODES: readonly TransferFail[] = ["off", "busy", "down", "rejected", "too_large"];

/** 서버 답(JSON detail.code) 또는 상태 번호에서 까닭을 고른다 — nginx 가 낸 오류 화면처럼 JSON 이 아닐 수도 있다 */
async function failOf(res: Response): Promise<TransferResult> {
  let code = "", message = "";
  try {
    const d = ((await res.json()) as { detail?: { code?: unknown; message?: unknown } }).detail;
    if (typeof d?.code === "string") code = d.code;
    if (typeof d?.message === "string") message = d.message;
  } catch { /* JSON 이 아님 */ }
  if ((CODES as readonly string[]).includes(code)) return { ok: false, why: code as TransferFail, ...(message ? { message } : {}) };
  if (res.status === 413) return { ok: false, why: "too_large" };
  if (res.status === 422) return { ok: false, why: "rejected", ...(message ? { message } : {}) };
  return { ok: false, why: res.status === 503 ? "busy" : "down" };
}

export async function requestTransfer(bare: Blob, ref: Blob, opt: TransferOptions = {}): Promise<TransferResult> {
  const doFetch = opt.fetchFn ?? ((u: RequestInfo | URL, i?: RequestInit) => fetch(u, i));
  const body = new FormData();
  body.append("bare", bare, "bare");
  body.append("ref", ref, "ref");
  const stop = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; stop.abort(); }, opt.timeoutMs ?? TRANSFER_TIMEOUT_MS);
  try {
    const res = await doFetch(`${(opt.base ?? "").replace(/\/$/, "")}/transfer`, { method: "POST", body, signal: stop.signal });
    if (!res.ok) return await failOf(res);
    const picture = await res.blob();
    if (!picture.size || !(res.headers.get("content-type") ?? "").startsWith("image/")) return { ok: false, why: "down" };
    const ms = Number(res.headers.get("x-gen-ms"));
    return { ok: true, picture, ms: Number.isFinite(ms) && res.headers.has("x-gen-ms") ? ms : null };
  } catch {
    return { ok: false, why: timedOut ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
