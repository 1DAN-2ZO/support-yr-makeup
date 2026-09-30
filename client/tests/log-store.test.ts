import { SCORE_VERSION } from "@core/score";
import { describe, expect, it, vi } from "vitest";
import { createLogStore, EVENTS_KEY, exportFileName } from "@core/log-store";
import { createLogger } from "@core/log";
import { memoryBackend } from "@core/session-store";
import { getVersions, resetVersions, setVersions, versionStamp } from "@core/versions";
import { LOOKS_VERSION } from "@core/looks";

/** 시간 저장을 끄고 수동으로 flush 하는 저장소 */
async function store(flushEvery = 20) {
  const backend = memoryBackend();
  const s = await createLogStore({ backend, flushEvery, flushAfterMs: 0 });
  return { backend, s };
}

describe("로그 저장", () => {
  it("버퍼에 모았다가 flush 할 때 저장된다", async () => {
    const { backend, s } = await store();
    const logger = createLogger(
      { sid: "s1", screen: "capture", part: null, ver: getVersions() },
      s.sink,
    );
    logger.log({ name: "consent", ok: true });
    logger.log({ name: "gate_fail", first_fail: "bright" });

    expect(s.pending()).toBe(2);
    expect(await backend.get(EVENTS_KEY)).toBeUndefined();

    await s.flush();
    expect(s.pending()).toBe(0);
    const saved = (await backend.get(EVENTS_KEY)) as unknown[];
    expect(saved).toHaveLength(2);
  });

  it("정해진 개수가 쌓이면 스스로 저장한다", async () => {
    const { s } = await store(3);
    const logger = createLogger({ sid: "s1", screen: "x", part: null, ver: getVersions() }, s.sink);
    for (let i = 0; i < 3; i++) logger.log({ name: "button", button: `b${i}` });
    await s.flush();
    expect(await s.all()).toHaveLength(3);
  });

  it("시간이 지나도 저장한다", async () => {
    const backend = memoryBackend();
    const timer: { fire: (() => void) | null } = { fire: null };
    const s = await createLogStore({
      backend,
      flushEvery: 999,
      flushAfterMs: 100,
      setTimer: (fn) => {
        timer.fire = fn;
        return 1;
      },
      clearTimer: () => {
        timer.fire = null;
      },
    });
    s.sink("", { name: "button", button: "a" } as never);
    expect(s.pending()).toBe(1);
    expect(timer.fire).not.toBeNull();
    timer.fire?.();
    await s.flush();
    expect(await s.all()).toHaveLength(1);
  });

  it("상한을 넘으면 오래된 것부터 버린다", async () => {
    const backend = memoryBackend();
    const s = await createLogStore({ backend, flushEvery: 1, flushAfterMs: 0, max: 3 });
    for (let i = 0; i < 5; i++) {
      s.sink("", { name: "button", button: `b${i}` } as never);
      await s.flush();
    }
    const list = await s.all();
    expect(list).toHaveLength(3);
    expect(list.map((e) => ("button" in e ? e.button : ""))).toEqual(["b2", "b3", "b4"]);
  });

  it("JSONL 은 한 줄에 하나씩", async () => {
    const { s } = await store();
    const logger = createLogger({ sid: "s1", screen: "x", part: null, ver: getVersions() }, s.sink);
    logger.log({ name: "button", button: "a" });
    logger.log({ name: "button", button: "b" });
    const text = await s.exportJsonl();
    const lines = text.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).button).toBe("a");
  });

  it("끝내기: 버퍼와 저장분을 모두 지운다", async () => {
    const { backend, s } = await store(1);
    s.sink("", { name: "button", button: "a" } as never);
    await s.flush();
    s.sink("", { name: "button", button: "b" } as never);

    await s.clear();
    expect(s.pending()).toBe(0);
    expect(await backend.get(EVENTS_KEY)).toBeUndefined();
    expect(await s.all()).toHaveLength(0);
  });

  it("내보내기 파일 이름에 개인 정보가 없다", () => {
    const name = exportFileName("abcdef1234567890", new Date("2026-10-08T12:00:00Z"));
    expect(name).toBe("danghwaeung-events-2026-10-08-abcdef12.jsonl");
  });
});

describe("버전 다섯 개", () => {
  it("룩 버전은 rules/looks.json 에서 온다", () => {
    resetVersions();
    expect(getVersions().look).toBe(LOOKS_VERSION);
    expect(Object.keys(getVersions()).sort()).toEqual([
      "app",
      "faceshape",
      "look",
      "score",
      "transfer",
    ]);
  });

  it("자기 칸만 바꾸고 남의 칸은 그대로", () => {
    resetVersions();
    const before = getVersions();
    setVersions({ transfer: "transfer-sm-fp16-8" });
    const after = getVersions();
    expect(after.transfer).toBe("transfer-sm-fp16-8");
    expect(after.score).toBe(before.score);
    expect(after.look).toBe(before.look);
  });

  it("빈 값은 무시한다", () => {
    resetVersions();
    setVersions({ score: "" });
    expect(getVersions().score).toBe(SCORE_VERSION);   // rules/score.json (#44)
  });

  it("결과 카드 도장은 앱·채점·룩 셋", () => {
    resetVersions();
    const stamp = versionStamp();
    expect(stamp).toContain(LOOKS_VERSION);
    expect(stamp.split(" · ")).toHaveLength(3);
  });

  it("로그 한 줄에 버전 다섯 개가 그대로 들어간다", async () => {
    resetVersions();
    setVersions({ faceshape: "faceshape-model-v0.2" });
    const { s } = await store();
    const logger = createLogger(
      { sid: "s1", screen: "review", part: null, ver: getVersions() },
      s.sink,
    );
    logger.log({ name: "session_end", reason: "finish", last_screen: "review" });
    const [line] = (await s.exportJsonl()).split("\n");
    const parsed = JSON.parse(line!);
    expect(parsed.ver.faceshape).toBe("faceshape-model-v0.2");
    expect(Object.keys(parsed.ver)).toHaveLength(5);
  });
});

describe("얼굴 데이터는 로그에 못 들어간다", () => {
  it("좌표를 넣으면 거부한다", async () => {
    const { s } = await store();
    const logger = createLogger({ sid: "s1", screen: "x", part: null, ver: getVersions() }, s.sink);
    const bad = { name: "error", where: "x", msg: "y", pts: [[1, 2]] } as never;
    expect(() => logger.log(bad)).toThrow(/forbidden/);
    expect(s.pending()).toBe(0);
  });

  it("저장된 줄에 사진·좌표 키가 없다", async () => {
    const { s } = await store();
    const logger = createLogger({ sid: "s1", screen: "x", part: null, ver: getVersions() }, s.sink);
    logger.log({ name: "score", part: "lip", status: "passed", check_reason: null, ms: 42 });
    const text = await s.exportJsonl();
    for (const k of ["lm", "pts", "frames", "photo", "bareImage", "path"]) {
      expect(text).not.toContain(`"${k}"`);
    }
  });
});

describe("시간 저장 타이머", () => {
  it("flush 하면 예약된 타이머를 취소한다", async () => {
    const backend = memoryBackend();
    const clearTimer = vi.fn();
    const s = await createLogStore({
      backend,
      flushEvery: 999,
      flushAfterMs: 100,
      setTimer: () => 7,
      clearTimer,
    });
    s.sink("", { name: "button", button: "a" } as never);
    await s.flush();
    expect(clearTimer).toHaveBeenCalledWith(7);
  });
});

describe("로그 저장 — 끝내기 뒤 잔존 0 (F-11, 1-12 #8)", () => {
  it("clear 뒤에 들어온 이벤트는 저장하지 않는다 — flush 해도, 시간이 지나도 키가 다시 생기지 않는다", async () => {
    const backend = memoryBackend();
    const timer: { fire: (() => void) | null } = { fire: null };
    const s = await createLogStore({ backend, flushAfterMs: 3000, setTimer: (fn) => { timer.fire = fn; return 1; }, clearTimer: () => { timer.fire = null; } });
    const logger = createLogger({ sid: "s1", screen: "review", part: null, ver: getVersions() }, s.sink);
    logger.log({ name: "consent", ok: true });
    await s.flush();
    await s.clear();
    logger.log({ name: "session_end", completed: true } as never);   // 끝내기 뒤 화면 전환에서 찍히는 것들
    timer.fire?.();
    await s.flush();
    expect(await backend.get(EVENTS_KEY)).toBeUndefined();
    expect(s.pending()).toBe(0);
  });

  it("clear 전에 버퍼에 남아 있던 것도 지운다", async () => {
    const { backend, s } = await store();
    const logger = createLogger({ sid: "s1", screen: "review", part: null, ver: getVersions() }, s.sink);
    logger.log({ name: "consent", ok: true });
    await s.clear();
    await s.flush();
    expect(await backend.get(EVENTS_KEY)).toBeUndefined();
  });

  it("reopen 하면(새 세션) 다시 저장한다", async () => {
    const { backend, s } = await store();
    const logger = createLogger({ sid: "s1", screen: "consent", part: null, ver: getVersions() }, s.sink);
    await s.clear();
    s.reopen();
    logger.log({ name: "consent", ok: true });
    await s.flush();
    expect(((await backend.get(EVENTS_KEY)) as unknown[]).length).toBe(1);
  });
});
