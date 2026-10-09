/**
 * 처음부터 다시 하기 확인 창 (2026-10-09, #369 피드백).
 *
 * 로고를 누르면 안내 화면으로 돌아가면서 **찍은 사진과 올린 사진을 다 지운다.**
 * 되돌릴 수 없는 일이라 한 번 묻는다 — 로고는 화면 맨 위 왼쪽이라
 * 스크롤하다 잘못 닿기 쉽고, 막 촬영을 끝낸 사람이 실수로 누르면 처음부터 다시 찍어야 한다.
 *
 * 모양은 후기 설문 모달(survey-modal.ts)과 같은 것을 쓴다 — 같은 앱에서 창이 두 가지로 보이면 안 된다.
 */

import type { Logger } from "@core/log";

export interface RestartModalOptions {
  log: Logger;
  /** 다시 시작하기로 했을 때 — 지우고 안내 화면으로 */
  onRestart: () => void;
  /** 그만두고 보던 화면에 남을 때 */
  onCancel?: () => void;
}

export function restartModal(opts: RestartModalOptions): HTMLElement {
  const back = document.createElement("div");
  back.className = "done-modal-back";
  back.tabIndex = -1;

  const box = document.createElement("div");
  box.className = "done-modal";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "restart-modal-title");

  const h = document.createElement("h2");
  h.id = "restart-modal-title";
  h.textContent = "처음부터 다시 할까요?";

  const p = document.createElement("p");
  // 무엇이 없어지는지 먼저 말한다 — "다시 할까요" 만으로는 사진이 지워지는 줄 모른다
  p.textContent = "찍은 사진과 올려 주신 사진이 모두 지워져요. 다시 되돌릴 수 없어요.";

  const go = document.createElement("button");
  go.type = "button";
  go.className = "primary";
  go.textContent = "지우고 다시 시작";

  const stay = document.createElement("button");
  stay.type = "button";
  stay.className = "done-modal-later";
  stay.textContent = "그냥 둘게요";

  let done = false;
  const close = (why: string, then?: () => void): void => {
    if (done) return;
    done = true;
    opts.log.log({ name: "button", button: why });
    back.remove();
    then?.();
  };

  go.addEventListener("click", () => close("restart_yes", opts.onRestart));
  stay.addEventListener("click", () => close("restart_no", opts.onCancel));
  // 뒷배경을 누르면 "그냥 둘게요" 와 같다 — 되돌릴 수 없는 쪽이 실수로 눌리면 안 되므로
  // 뒷배경은 언제나 안 지우는 쪽이다
  back.addEventListener("click", (e) => {
    if (e.target === back) close("restart_no", opts.onCancel);
  });
  back.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") close("restart_no", opts.onCancel);
  });

  box.append(h, p, go, stay);
  back.append(box);
  // 창이 뜨면 바로 키보드가 여기로 — 뒤 화면의 버튼이 눌리지 않게
  queueMicrotask(() => { stay.focus(); });
  return back;
}
