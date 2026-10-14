/** 폰 뒤로 버튼(lib/phone-back) — #454 C4. 본 앱 screens/phone-back 과 같은 동작 */
import { describe, expect, it, vi } from "vitest";
import { armPhoneBack } from "../src/lib/phone-back";

function fake() {
  let onPop: (() => void) | null = null;
  const history = { pushState: vi.fn(), back: vi.fn() };
  const listen = (cb: () => void) => {
    onPop = cb;
    return () => {
      onPop = null;
    };
  };
  return { history, listen, pop: () => onPop?.(), armed: () => onPop !== null };
}

describe("armPhoneBack", () => {
  it("켜면 기록에 한 칸을 쌓아 둔다 (뒤로가 곧 사이트 나가기가 되지 않게)", () => {
    const f = fake();
    armPhoneBack({ back: () => null, log: () => {}, history: f.history, listen: f.listen });
    expect(f.history.pushState).toHaveBeenCalledTimes(1);
  });

  it("뒤로가 눌리면 화살표와 같은 곳으로 가고, 칸을 다시 쌓고, 기록을 남긴다", () => {
    const f = fake();
    const onBack = vi.fn();
    const log = vi.fn();
    armPhoneBack({ back: () => ({ stage: "palette", onBack }), log, history: f.history, listen: f.listen });
    f.pop();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(f.history.pushState).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith("back_phone:palette");
    expect(f.history.back).not.toHaveBeenCalled();
  });

  it("앞 화면이 없는 곳(화살표 없음)에서는 막지 않는다 — 한 번 더 뒤로 보내 원래대로 나간다", () => {
    const f = fake();
    const log = vi.fn();
    armPhoneBack({ back: () => null, log, history: f.history, listen: f.listen });
    f.pop();
    expect(f.history.back).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("끄는 함수를 돌려준다", () => {
    const f = fake();
    const off = armPhoneBack({ back: () => null, log: () => {}, history: f.history, listen: f.listen });
    expect(f.armed()).toBe(true);
    off();
    expect(f.armed()).toBe(false);
  });
});
