/** 옮긴 그림 작업(lib/moved) — #454 B1 · B4. 본 앱 main.ts 의 movedJob · getMoved 와 같은 동작 */
import { describe, expect, it, vi } from "vitest";
import type { MakeResult } from "@core/picture-maker";
import { createMovedJob } from "../src/lib/moved";

function fakeMaker(result: () => Promise<MakeResult>) {
  return { makeMoved: vi.fn(result), cancel: vi.fn() };
}
const picture = new Blob(["moved"]);
const ok = (): Promise<MakeResult> => Promise.resolve({ ok: true, picture, ms: 10 });

describe("createMovedJob", () => {
  it("시작하면 옛 것을 먼저 버리고(cancel('moved')) 새로 만든다 — 피드백이 그 그림을 받는다", async () => {
    const maker = fakeMaker(ok);
    const job = createMovedJob({ maker, enabled: () => true });
    job.start();
    expect(maker.cancel).toHaveBeenCalledWith("moved");
    expect(maker.makeMoved).toHaveBeenCalledTimes(1);
    await expect(job.get()).resolves.toBe(picture);
  });

  it("서버가 없으면 시작하지 않고, 피드백은 'not started' 로 라이너만 포기한다", async () => {
    const maker = fakeMaker(ok);
    const job = createMovedJob({ maker, enabled: () => false });
    job.start();
    expect(maker.makeMoved).not.toHaveBeenCalled();
    await expect(job.get()).rejects.toThrow("moved: not started");
  });

  it("아직 시도사진을 안 찍었으면 'not started'", async () => {
    const job = createMovedJob({ maker: fakeMaker(ok), enabled: () => true });
    await expect(job.get()).rejects.toThrow("moved: not started");
  });

  it("만들기가 실패하면 까닭을 붙여 던진다 (no_attempt 등)", async () => {
    const maker = fakeMaker(() => Promise.resolve({ ok: false, why: "no_attempt" }));
    const job = createMovedJob({ maker, enabled: () => true });
    job.start();
    await expect(job.get()).rejects.toThrow("moved: no_attempt");
  });

  it("한도를 넘기면 'late' 로 던진다 — 60초(본 앱)까지 기다리고 그 뒤엔 라이너 없이 간다", async () => {
    const never = () => new Promise<MakeResult>(() => {});
    const job = createMovedJob({ maker: fakeMaker(never), enabled: () => true, waitMs: 20 });
    job.start();
    await expect(job.get()).rejects.toThrow("moved: late");
  });

  it("맨얼굴 다시 찍기 · 다시 하기(cancel)면 만들던 것을 버리고 'not started' 로 돌아간다", async () => {
    const maker = fakeMaker(ok);
    const job = createMovedJob({ maker, enabled: () => true });
    job.start();
    job.cancel();
    expect(maker.cancel).toHaveBeenLastCalledWith();
    await expect(job.get()).rejects.toThrow("moved: not started");
  });
});
