/**
 * VLM 서버 호출 — 모듈 ⑥ (2026-09-29 흐름: 개인화는 VLM 이 정하고 규칙 관문이 거른다. VLM 이 없으면 이용 불가).
 *
 * 계약 (앱 ↔ 중간 서버. 중간 서버가 llama-server 로 넘긴다 — 모델 서버는 밖에 안 연다):
 *   GET  /health → { ok, vlm: { ok, model } }        앱을 켤 때 — 둘 다 살아 있어야 시작한다
 *   POST /plan   ← { image, prompt, schema, prompt_ver, look_id }
 *                → 200 { proposal, ms, model }       proposal = 모델이 낸 JSON 원문 (관문은 앱이 돈다)
 *                → 503 { reason: "busy" | … }      대기열이 찼거나 모델이 내려감
 *                → 504                             서버 쪽 시간 초과
 *   image: 얼굴 가운데 정사각형 JPEG data URL (앱이 자른다 — 해상도를 고정해야 시간·답이 일정하다)
 *   사진은 서버가 저장하지 않는다 (메모리에서 모델로 넘기고 버림)
 */

export interface PlanRequest {
  image: string;
  prompt: string;
  schema: object;
  promptVer: string;
  lookId: string;
}

export interface PlanResponse {
  proposal: string;
  ms: number;
  model: string;
}

export type VlmFailureReason = "unavailable" | "busy" | "timeout" | "bad_response";

export class VlmFailure extends Error {
  constructor(
    readonly reason: VlmFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "VlmFailure";
  }
}

export interface VlmClient {
  /** 서버·모델 둘 다 살아 있나. 못 닿으면 ok false — 던지지 않는다 */
  health(): Promise<{ ok: boolean; model: string | null }>;
  plan(req: PlanRequest): Promise<PlanResponse>;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const HEALTH_TIMEOUT_MS = 5000;
/** 개인화 한 번 — 모델 4~5초 + 대기열. 넘으면 "잠시 후 다시" */
export const PLAN_TIMEOUT_MS = 25000;

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await run(ctl.signal);
  } finally {
    clearTimeout(t);
  }
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";

export function createVlmClient(base: string, fetchFn: Fetch = (u, i) => fetch(u, i), timeoutMs = PLAN_TIMEOUT_MS): VlmClient {
  const url = (p: string): string => base.replace(/\/$/, "") + p;
  return {
    async health() {
      try {
        // 본문 읽기까지 시간 안에 (#179 리뷰)
        const j = await withTimeout(HEALTH_TIMEOUT_MS, async (signal) => {
          const r = await fetchFn(url("/health"), { signal });
          return r.ok ? ((await r.json()) as { ok?: boolean; vlm?: { ok?: boolean; model?: string } }) : null;
        });
        if (!j) return { ok: false, model: null };
        const ok = j.ok === true && j.vlm?.ok === true;
        return { ok, model: ok ? (j.vlm?.model ?? null) : null };
      } catch {
        return { ok: false, model: null };
      }
    },

    async plan(req) {
      // 본문 읽기까지 시간 안에 — 헤더만 오고 본문이 멈추면 끝없이 기다렸다 (#179 리뷰)
      let got: { status: number; ok: boolean; body: unknown };
      try {
        got = await withTimeout(timeoutMs, async (signal) => {
          const r = await fetchFn(url("/plan"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: req.image, prompt: req.prompt, schema: req.schema, prompt_ver: req.promptVer, look_id: req.lookId }),
            signal,
          });
          return { status: r.status, ok: r.ok, body: await r.json().catch(() => null) };
        });
      } catch (e) {
        if (isAbort(e)) throw new VlmFailure("timeout", `개인화 요청이 ${timeoutMs}ms 를 넘었다`);
        throw new VlmFailure("unavailable", e instanceof Error ? e.message : String(e));
      }
      if (got.status === 503) {
        const reason = (got.body as { reason?: string } | null)?.reason;
        throw new VlmFailure(reason === "busy" ? "busy" : "unavailable", `503 ${reason ?? ""}`);
      }
      if (got.status === 504) throw new VlmFailure("timeout", "504");
      if (!got.ok) throw new VlmFailure("unavailable", `HTTP ${got.status}`);
      const j = got.body as Partial<PlanResponse> | null;
      if (!j || typeof j.proposal !== "string") throw new VlmFailure("bad_response", "proposal 이 없다");
      return { proposal: j.proposal, ms: Number(j.ms ?? 0), model: String(j.model ?? "") };
    },
  };
}
