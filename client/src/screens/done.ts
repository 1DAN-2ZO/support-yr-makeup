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
   * 후기 설문 주소 (구글 폼). 없으면 그 칸을 아예 안 그린다 —
   * 주소가 정해지기 전에 눌리는 빈 버튼을 두지 않는다.
   */
  surveyUrl?: string | null;
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

      // 후기 설문 — 묻는 것은 "끝내기" 를 누른 그 화면의 모달이 한다(survey-modal.ts).
      // 여기 칸은 모달을 닫은 뒤 마음이 바뀌었을 때 다시 누를 자리다
      if (deps.surveyUrl) {
        const ask = document.createElement("div");
        ask.className = "done-survey";
        const t = document.createElement("p");
        t.textContent = "써 보니 어땠는지 알려 주시면 서비스를 고치는 데 쓸게요.";
        const link = document.createElement("a");
        link.className = "primary";
        link.href = deps.surveyUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "후기 남기기 (1분)";
        link.addEventListener("click", () => ctx.log.log({ name: "button", button: "survey_open" }));
        ask.append(t, link);
        wrap.append(ask);
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
