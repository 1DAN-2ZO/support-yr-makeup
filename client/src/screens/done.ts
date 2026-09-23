/**
 * 끝 — 세션을 지운 뒤 (F-11). 모듈 ⑥.
 *
 * 화면 6 의 "끝내기" 가 `sessionStore.clearAll()` 을 부르고 여기로 온다.
 *
 * **지웠다는 것을 말해 준다.** 얼굴 사진을 맡긴 사람이 제일 궁금한 게 그거고,
 * 안 보여 주면 "어디 남아 있나" 를 의심한 채로 끝난다. 우리는 실제로 지우므로 말할 수 있다.
 */

import type { Screen, ScreenContext } from "./shell";

export interface DoneDeps {
  /** 다시 시작 — 세션을 새로 만들고 동의 화면으로 */
  restart: () => void;
  /**
   * 지운 뒤 남은 키 수 (`clearAll()` 의 `remaining`). 0 이 아니면 지우다 만 것이다.
   * 사용자에게 숫자를 보여 주지는 않고, 0 이 아닐 때만 다르게 말한다.
   */
  remaining?: () => number;
}

export function doneScreen<S>(deps: DoneDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const left = deps.remaining?.() ?? 0;

      const wrap = document.createElement("div");
      wrap.className = "done";

      const h = document.createElement("h1");
      h.textContent = "끝났어요";

      const p = document.createElement("p");
      p.className = "muted";
      p.textContent =
        left === 0
          ? "사진과 기록은 모두 지웠어요. 이 기기에도, 서버에도 남아 있지 않아요."
          : "사진은 지웠지만 일부 기록이 남았어요. 브라우저 저장소를 비우면 완전히 지워집니다.";

      wrap.append(h, p);

      if (left !== 0) {
        // 사용자에게는 숫자를 안 보여 주고 로그에만 남긴다 — 검증 대상은 "잔존 0" 이다
        ctx.log.log({ name: "error", where: "done", msg: `clear_remaining:${left}` });
      }

      const row = document.createElement("div");
      row.className = "row";
      const again = document.createElement("button");
      again.type = "button";
      again.className = "primary";
      again.textContent = "다시 하기";
      again.addEventListener("click", () => {
        ctx.log.log({ name: "button", button: "restart" });
        deps.restart();
      });
      row.append(again);
      wrap.append(row);

      ctx.root.append(wrap);
    },
  };
}
