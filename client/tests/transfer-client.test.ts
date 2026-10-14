// 그림 만들기 부르기 (⑥ 백 연결) — 앱 → 백엔드 POST /transfer → (GPU 의 FLUX) → 그림 한 장
import { describe, expect, it, vi } from "vitest";
import { createPictureMaker } from "@core/picture-maker";
import { TRANSFER_TIMEOUT_MS, requestTransfer, type TransferResult } from "@core/transfer-client";

const bare = new Blob(["bare"], { type: "image/webp" }), ref = new Blob(["ref"], { type: "image/jpeg" });
const png = new Blob(["made"], { type: "image/png" });
const ok = (): Response => new Response(png, { status: 200, headers: { "content-type": "image/png", "x-gen-ms": "8600" } });
const fail = (status: number, code: string, message = ""): Response => new Response(JSON.stringify({ detail: { code, message } }), { status, headers: { "content-type": "application/json" } });

describe("그림 만들기 부르기 (requestTransfer)", () => {
  it("TC0 서버가 나눠 알려 준 시간을 같이 돌려준다 — 줄 선 시간 · FLUX 가 스스로 잰 시간 (없으면 null)", async () => {
    const withTimes = new Response(png, { status: 200, headers: { "content-type": "image/png", "x-gen-ms": "21000", "x-queue-ms": "12000", "x-flux-ms": "8600" } });
    const a = await requestTransfer(bare, ref, { fetchFn: async () => withTimes });
    expect(a).toMatchObject({ ok: true, ms: 21000, queueMs: 12000, fluxMs: 8600 });
    // 옛 서버 · 측정 문장을 못 읽은 때 — 숫자가 아니면 0 이 아니라 null
    const b = await requestTransfer(bare, ref, { fetchFn: async () => ok() });
    expect(b).toMatchObject({ ok: true, ms: 8600, queueMs: null, fluxMs: null });
    const odd = new Response(png, { status: 200, headers: { "content-type": "image/png", "x-queue-ms": "abc", "x-flux-ms": "" } });
    const c = await requestTransfer(bare, ref, { fetchFn: async () => odd });
    expect(c).toMatchObject({ ok: true, ms: null, queueMs: null, fluxMs: null });
  });

  it("TC1맨얼굴 · 화장 사진 두 장을 올리고 그림을 받는다", async () => {
    const fetchFn = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => ok());
    const r = await requestTransfer(bare, ref, { fetchFn });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await r.picture.text()).toBe("made");
    expect(r.picture.type).toBe("image/png");
    expect(r.ms).toBe(8600);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("/transfer");
    expect(init!.method).toBe("POST");
    const fd = init!.body as FormData;
    expect(await (fd.get("bare") as Blob).text()).toBe("bare");
    expect(await (fd.get("ref") as Blob).text()).toBe("ref");
  });

  it("TC1b 템플릿이면 사진 대신 번호만 올린다 — ref 는 보내지 않는다 (#420)", async () => {
    const fetchFn = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => ok());
    const r = await requestTransfer(bare, { template: 3 }, { fetchFn });
    expect(r.ok).toBe(true);
    const fd = fetchFn.mock.calls[0]![1]!.body as FormData;
    expect(await (fd.get("bare") as Blob).text()).toBe("bare");
    expect(fd.get("template")).toBe("3");
    expect(fd.has("ref")).toBe(false);
    // 사진을 올릴 때는 반대 — 번호가 없다
    await requestTransfer(bare, ref, { fetchFn });
    const fd2 = fetchFn.mock.calls[1]![1]!.body as FormData;
    expect(fd2.has("template")).toBe(false);
  });

  it("TC1c 무엇을 만드는지(정답사진 · 옮긴 그림)를 같이 보낸다 — 서버는 정답사진의 참고 사진만 손본다 (가림 채우기)", async () => {
    const fetchFn = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => ok());
    await requestTransfer(bare, ref, { fetchFn, kind: "answer" });
    await requestTransfer(bare, ref, { fetchFn, kind: "moved" });
    await requestTransfer(bare, ref, { fetchFn });
    const kinds = fetchFn.mock.calls.map((c) => (c[1]!.body as FormData).get("kind"));
    // 안 주면 보내지 않는다 — 서버는 표시가 없으면 손보지 않는다 (옛 앱과 같다)
    expect(kinds).toEqual(["answer", "moved", null]);
  });

  it("TC2 서버 주소를 따로 주면 그 주소로 (끝의 / 는 있어도 없어도)", async () => {
    const fetchFn = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => ok());
    await requestTransfer(bare, ref, { fetchFn, base: "https://api.example/" });
    expect(fetchFn.mock.calls[0]![0]).toBe("https://api.example/transfer");
  });

  it.each([
    [503, "off", "off"],
    [503, "busy", "busy"],
    [502, "down", "down"],
    [413, "too_large", "too_large"],
    [422, "rejected", "rejected"],
    [422, "not_image", "rejected"],
  ] as const)("TC3 서버가 %i %s 로 답하면 까닭을 %s 로 돌려준다", async (status, code, why) => {
    const r = await requestTransfer(bare, ref, { fetchFn: async () => fail(status, code, "얼굴 사진에서 얼굴을 못 찾았어요.") });
    expect(r).toMatchObject({ ok: false, why });
    if (!r.ok && code === "rejected") expect(r.message).toBe("얼굴 사진에서 얼굴을 못 찾았어요.");
  });

  it("TC4 nginx 가 낸 오류 화면(JSON 이 아님)도 멈추지 않고 까닭으로 — 502 · 504 는 down, 413 은 too_large", async () => {
    const html = (s: number): Response => new Response("<html>Bad Gateway</html>", { status: s, headers: { "content-type": "text/html" } });
    expect(await requestTransfer(bare, ref, { fetchFn: async () => html(502) })).toMatchObject({ ok: false, why: "down" });
    expect(await requestTransfer(bare, ref, { fetchFn: async () => html(504) })).toMatchObject({ ok: false, why: "down" });
    expect(await requestTransfer(bare, ref, { fetchFn: async () => html(413) })).toMatchObject({ ok: false, why: "too_large" });
    // Cloudflare 가 100초에서 끊으면 524 — 서버 쪽 문제로 안내한다
    expect(await requestTransfer(bare, ref, { fetchFn: async () => html(524) })).toMatchObject({ ok: false, why: "down" });
  });

  it("TC4b 기다리는 한도는 Cloudflare 가 끊는 100초보다 짧다 — 그보다 길면 닿지도 못하고, 서버는 그동안 계속 그린다", () => {
    expect(TRANSFER_TIMEOUT_MS).toBeLessThan(100_000);
  });

  it("TC5 인터넷이 끊겼으면 network, 너무 오래 걸리면 timeout", async () => {
    expect(await requestTransfer(bare, ref, { fetchFn: async () => { throw new TypeError("Failed to fetch"); } })).toEqual({ ok: false, why: "network" });
    const slow = (_u: RequestInfo | URL, i?: RequestInit): Promise<Response> => new Promise((_res, rej) => {
      i!.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    });
    expect(await requestTransfer(bare, ref, { fetchFn: slow, timeoutMs: 10 })).toEqual({ ok: false, why: "timeout" });
  });

  it("TC6 그림이 아닌 것이 200 으로 오면(빈 답 · 글자) 그림으로 치지 않는다", async () => {
    expect(await requestTransfer(bare, ref, { fetchFn: async () => new Response("", { status: 200, headers: { "content-type": "image/png" } }) })).toMatchObject({ ok: false, why: "down" });
    expect(await requestTransfer(bare, ref, { fetchFn: async () => new Response("oops", { status: 200, headers: { "content-type": "text/html" } }) })).toMatchObject({ ok: false, why: "down" });
  });
});

describe("그림 만들어 보관하기 (createPictureMaker)", () => {
  const made = (text: string): TransferResult => ({ ok: true, picture: new Blob([text], { type: "image/png" }), ms: 1 });
  const setup = (over: Partial<Parameters<typeof createPictureMaker>[0]> = {}) => {
    const put = vi.fn(async (_k: "answer" | "moved", _b: Blob) => {});
    const request = vi.fn(async (_b: Blob, _r: Blob | { template: number }, _k: "answer" | "moved") => made("A"));
    const maker = createPictureMaker({ getBare: async () => bare, getAttempt: () => ref, put, request, ...over });
    return { put, request, maker };
  };

  it("PM1 정답사진: 맨얼굴 + 참고 사진을 보내고, 받은 그림을 answer 칸에 넣는다", async () => {
    const { put, request, maker } = setup();
    const given = new Blob(["look"], { type: "image/jpeg" });
    const r = await maker.makeAnswer(given);
    expect(r.ok).toBe(true);
    expect(request).toHaveBeenCalledWith(bare, given, "answer");
    expect(put.mock.calls[0]![0]).toBe("answer");
    expect(await put.mock.calls[0]![1].text()).toBe("A");
  });

  it("PM1b 템플릿을 골랐으면 맨얼굴 + 템플릿 번호를 보낸다 — 사진은 안 보낸다 (#420)", async () => {
    const { put, request, maker } = setup();
    const r = await maker.makeAnswer({ template: 5 });
    expect(r.ok).toBe(true);
    expect(request).toHaveBeenCalledWith(bare, { template: 5 }, "answer");
    expect(put.mock.calls[0]![0]).toBe("answer");
  });

  it("PM1c 같은 템플릿을 또 부르면 새로 보내지 않고, 다른 번호면 만드는 중(busy)이다", async () => {
    let done: (r: TransferResult) => void = () => {};
    const request = vi.fn(() => new Promise<TransferResult>((r) => { done = r; }));
    const { maker } = setup({ request });
    const first = maker.makeAnswer({ template: 2 });
    const again = maker.makeAnswer({ template: 2 });
    expect(await maker.makeAnswer({ template: 7 })).toEqual({ ok: false, why: "busy" });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    done(made("T"));
    expect((await first).ok).toBe(true);
    expect((await again).ok).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("PM2 옮긴 그림: 맨얼굴 + 시도사진 눈 뜬 장을 보내고 moved 칸에 넣는다", async () => {
    const { put, request, maker } = setup();
    expect((await maker.makeMoved()).ok).toBe(true);
    // 무엇을 만드는지도 알린다 — 서버는 옮긴 그림의 시도사진은 손보지 않는다 (사용자가 그린 그대로 견줘야 한다)
    expect(request).toHaveBeenCalledWith(bare, ref, "moved");
    expect(put.mock.calls[0]![0]).toBe("moved");
  });

  it("PM3 보낼 사진이 없으면 서버를 부르지 않고 무엇이 없는지 돌려준다", async () => {
    const a = setup({ getBare: async () => null });
    expect(await a.maker.makeAnswer(ref)).toEqual({ ok: false, why: "no_bare" });
    const b = setup({ getAttempt: () => null });
    expect(await b.maker.makeMoved()).toEqual({ ok: false, why: "no_attempt" });
    expect(a.request).not.toHaveBeenCalled();
    expect(b.request).not.toHaveBeenCalled();
  });

  it("PM4 실패하면 칸에 넣지 않고 까닭을 그대로 돌려준다", async () => {
    const { put, maker } = setup({ request: async () => ({ ok: false, why: "busy" }) });
    expect(await maker.makeAnswer(ref)).toEqual({ ok: false, why: "busy" });
    expect(put).not.toHaveBeenCalled();
  });

  it("PM5 만드는 중에 같은 것을 또 부르면 새로 보내지 않고 같은 결과를 기다린다 — 버튼을 두 번 눌러도 GPU 는 한 번", async () => {
    let done: (r: TransferResult) => void = () => {};
    const request = vi.fn(() => new Promise<TransferResult>((res) => { done = res; }));
    const { put, maker } = setup({ request });
    const p1 = maker.makeMoved(), p2 = maker.makeMoved();
    await Promise.resolve(); await Promise.resolve();
    done(made("M"));
    expect((await p1).ok && (await p2).ok).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
    // 끝난 뒤에는 다시 만들 수 있다
    void maker.makeMoved();
    await Promise.resolve(); await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("PM6 지금 만드는 중인지 알 수 있다 — 화면이 '만드는 중' 을 보여 준다", async () => {
    let done: (r: TransferResult) => void = () => {};
    const { maker } = setup({ request: () => new Promise<TransferResult>((res) => { done = res; }) });
    expect(maker.busy("answer")).toBe(false);
    const p = maker.makeAnswer(ref);
    expect(maker.busy("answer")).toBe(true);
    expect(maker.busy("moved")).toBe(false);
    await Promise.resolve(); await Promise.resolve();
    done(made("A"));
    await p;
    expect(maker.busy("answer")).toBe(false);
  });

  it("PM7 만드는 중에 다른 사진으로 또 부르면 앞의 결과를 그 사진의 결과인 것처럼 돌려주지 않는다 — 만드는 중이라고 답한다", async () => {
    let done: (r: TransferResult) => void = () => {};
    const request = vi.fn((_b: Blob, _r: Blob | { template: number }) => new Promise<TransferResult>((res) => { done = res; }));
    const { put, maker } = setup({ request });
    const lookA = new Blob(["A"]), lookB = new Blob(["B"]);
    const first = maker.makeAnswer(lookA);
    expect(await maker.makeAnswer(lookB)).toEqual({ ok: false, why: "busy" });
    await Promise.resolve(); await Promise.resolve();
    done(made("A"));
    expect((await first).ok).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("PM8 버린 뒤에 도착한 그림은 칸에 넣지 않는다 — 끝내기 · 맨얼굴 다시 찍기 뒤에 옛 그림이 되살아나지 않게", async () => {
    let done: (r: TransferResult) => void = () => {};
    const { put, maker } = setup({ request: () => new Promise<TransferResult>((res) => { done = res; }) });
    const p = maker.makeAnswer(ref);
    await Promise.resolve(); await Promise.resolve();
    maker.cancel();
    done(made("A"));
    expect(await p).toEqual({ ok: false, why: "cancelled" });
    expect(put).not.toHaveBeenCalled();
    expect(maker.busy("answer")).toBe(false);
  });

  it("PM9 한 가지만 버릴 수 있다 — 시도사진을 다시 찍으면 옮긴 그림만 버리고 정답사진 만들기는 그대로 간다", async () => {
    const waits: ((r: TransferResult) => void)[] = [];
    const { put, maker } = setup({ request: () => new Promise<TransferResult>((res) => { waits.push(res); }) });
    const a = maker.makeAnswer(new Blob(["look"])), m = maker.makeMoved();
    await Promise.resolve(); await Promise.resolve();
    maker.cancel("moved");
    waits.forEach((w) => w(made("X")));
    expect((await a).ok).toBe(true);
    expect(await m).toEqual({ ok: false, why: "cancelled" });
    expect(put.mock.calls.map((c) => c[0])).toEqual(["answer"]);
  });

  it("PM10 버린 뒤에는 바로 새로 만들 수 있다 — 앞의 것이 아직 안 끝났어도", async () => {
    const waits: ((r: TransferResult) => void)[] = [];
    const request = vi.fn(() => new Promise<TransferResult>((res) => { waits.push(res); }));
    const { put, maker } = setup({ request });
    const old = maker.makeMoved();
    await Promise.resolve(); await Promise.resolve();
    maker.cancel("moved");
    const fresh = maker.makeMoved();
    await Promise.resolve(); await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    waits[1]!(made("new"));
    waits[0]!(made("old"));
    expect((await fresh).ok).toBe(true);
    expect((await old).ok).toBe(false);
    expect(put).toHaveBeenCalledTimes(1);
    expect(await put.mock.calls[0]![1].text()).toBe("new");
  });
});
