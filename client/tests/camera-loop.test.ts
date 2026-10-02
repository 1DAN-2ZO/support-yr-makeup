// 공용 카메라 루프 (#245) — 카메라에 새 장면이 들어올 때만 부른다. 화면 4 · 촬영(②), 2-b(⑥ 따로). 브라우저 객체는 전부 가짜
import { describe, expect, it, vi } from "vitest";
import { startFrameLoop } from "../src/screens/camera-loop";
import type { DocLike } from "../src/screens/camera-locks";

type Cb = (now: number) => void;

/** 예약된 콜백 모음 — frame(now) 가 한 번에 부르고 비운다 (브라우저처럼 한 번 예약 = 한 번 불림) */
function queue() {
  let next = 1;
  const pending = new Map<number, Cb>();
  return {
    add: (cb: Cb): number => { const h = next++; pending.set(h, cb); return h; },
    remove: (h: number): void => { pending.delete(h); },
    fire: (now: number): void => { const cbs = [...pending.values()]; pending.clear(); cbs.forEach((cb) => cb(now)); },
    size: (): number => pending.size,
  };
}

/** rVFC 가 있는 영상. cancel: false 면 취소가 없는 브라우저 */
function videoWithVfc(o: { cancel?: boolean } = {}) {
  const q = queue();
  const v = {
    paused: false,
    play: vi.fn(async () => { v.paused = false; }),
    requestVideoFrameCallback: q.add,
    ...(o.cancel === false ? {} : { cancelVideoFrameCallback: q.remove }),
    /** 카메라가 새 장면을 하나 내보낸다 */
    frame: q.fire,
    pending: q.size,
  };
  return v;
}

/** rVFC 가 없는 영상 + 화면 그리기(rAF) */
function videoWithRaf() {
  const q = queue();
  const v = { paused: false, play: vi.fn(async () => {}) };
  return { v, env: { raf: q.add, caf: q.remove, doc: null }, draw: q.fire, pending: q.size };
}

function fakeDoc(): DocLike & { set(s: "visible" | "hidden"): void; count(): number } {
  const fns = new Set<() => void>();
  const d = {
    visibilityState: "visible" as "visible" | "hidden",
    addEventListener: (_: "visibilitychange", fn: () => void) => { fns.add(fn); },
    removeEventListener: (_: "visibilitychange", fn: () => void) => { fns.delete(fn); },
    set(s: "visible" | "hidden") { d.visibilityState = s; fns.forEach((fn) => fn()); },
    count: () => fns.size,
  };
  return d;
}

const noRaf = { raf: () => { throw new Error("rAF 를 쓰면 안 됨"); }, caf: () => {}, doc: null };

describe("camera loop", () => {
  it("L1 rVFC 가 있으면 새 장면마다 한 번 — 화면 그리기(rAF)는 안 쓴다 · 시작하자마자 부르지 않는다", () => {
    const v = videoWithVfc();
    const seen: number[] = [];
    startFrameLoop(v, (now) => seen.push(now), { env: noRaf });
    expect(seen).toEqual([]);
    v.frame(10);
    v.frame(43);
    expect(seen).toEqual([10, 43]);
  });

  it("L2 rVFC 가 없으면 화면 그리기(rAF)마다", () => {
    const r = videoWithRaf();
    const seen: number[] = [];
    startFrameLoop(r.v, (now) => seen.push(now), { env: r.env });
    r.draw(16);
    r.draw(33);
    expect(seen).toEqual([16, 33]);
  });

  it("L3 시각은 늘어나기만 — 같거나 거꾸로 온 시각은 직전 + 1 (detectForVideo 조건)", () => {
    const v = videoWithVfc();
    const seen: number[] = [];
    startFrameLoop(v, (now) => seen.push(now), { env: noRaf });
    v.frame(100);
    v.frame(100);
    v.frame(90);
    v.frame(200);
    expect(seen).toEqual([100, 101, 102, 200]);
  });

  it("L4 stop() 뒤에는 안 불린다 — 걸어 둔 예약도 지운다", () => {
    const v = videoWithVfc();
    const seen: number[] = [];
    const stop = startFrameLoop(v, (now) => seen.push(now), { env: noRaf });
    v.frame(1);
    stop();
    expect(v.pending()).toBe(0);
    v.frame(2);
    expect(seen).toEqual([1]);

    const r = videoWithRaf();
    const stop2 = startFrameLoop(r.v, (now) => seen.push(now), { env: r.env });
    stop2();
    expect(r.pending()).toBe(0);
  });

  it("L5 예약 취소가 없는 브라우저에서도 stop() 뒤에는 안 불린다", () => {
    const v = videoWithVfc({ cancel: false });
    const seen: number[] = [];
    const stop = startFrameLoop(v, (now) => seen.push(now), { env: noRaf });
    stop();
    v.frame(1);
    expect(seen).toEqual([]);
  });

  it("L6 콜백 안에서 stop() 하면 다음 장면에 안 불린다 (묶음 다 모음 · 화면 떠남)", () => {
    const v = videoWithVfc();
    let n = 0;
    const stop = startFrameLoop(v, () => { n++; stop(); }, { env: noRaf });
    v.frame(1);
    v.frame(2);
    expect(n).toBe(1);
    expect(v.pending()).toBe(0);
  });

  it("L7 콜백 오류는 onError 로 — 루프는 계속 돌고, 멈출지는 부른 쪽이 정한다", () => {
    const v = videoWithVfc();
    const errs: unknown[] = [];
    const seen: number[] = [];
    startFrameLoop(v, (now) => { seen.push(now); if (now === 1) throw new Error("한 장 실패"); }, { env: noRaf, onError: (e) => errs.push(e) });
    v.frame(1);
    v.frame(2);
    expect(seen).toEqual([1, 2]);
    expect(errs).toEqual([expect.objectContaining({ message: "한 장 실패" })]);

    // 2-b 처럼 오류가 나면 정리하고 대체 화면으로: onError 에서 stop()
    const w = videoWithVfc();
    let calls = 0;
    const stop = startFrameLoop(w, () => { calls++; throw new Error("x"); }, { env: noRaf, onError: () => stop() });
    w.frame(1);
    w.frame(2);
    expect(calls).toBe(1);
  });

  it("L8 onError 가 없으면 오류를 삼키지 않는다(그대로 던짐) — 다음 장면 예약은 이미 걸려 있다", () => {
    const v = videoWithVfc();
    let n = 0;
    startFrameLoop(v, () => { n++; if (n === 1) throw new Error("boom"); }, { env: noRaf });
    expect(() => v.frame(1)).toThrow("boom");
    v.frame(2);
    expect(n).toBe(2);
  });

  it("L9 가렸다 돌아왔을 때 영상이 멈춰 있으면 다시 튼다 (rVFC 는 멈춘 영상에서 안 불린다) · stop() 뒤엔 안 건드림", () => {
    const v = videoWithVfc();
    const doc = fakeDoc();
    const stop = startFrameLoop(v, () => {}, { env: { ...noRaf, doc } });
    doc.set("hidden");
    v.paused = true;
    expect(v.play).not.toHaveBeenCalled();
    doc.set("visible");
    expect(v.play).toHaveBeenCalledTimes(1);
    // 안 멈춰 있으면 건드리지 않는다
    doc.set("hidden");
    doc.set("visible");
    expect(v.play).toHaveBeenCalledTimes(1);
    stop();
    expect(doc.count()).toBe(0);
  });
});
