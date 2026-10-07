/**
 * 후기 설문 모달 — "끝내기" 를 누른 그 화면 위에 가운데로 띄운다 (2026-10-07).
 *
 * 화면을 넘긴 뒤에 묻지 않는다. 끝내기를 누른 순간이 서비스를 막 다 쓴 때라
 * 그때 묻는 것이 가장 잘 답해 준다. 모달을 닫으면 그때 끝 화면으로 넘어간다.
 *
 * 주소가 없으면 아예 띄우지 않는다 — 눌리지 않는 빈 버튼을 두지 않는다.
 */

import type { Logger } from "@core/log";

export interface SurveyModalOptions {
  url: string;
  log: Logger;
  /** 닫힌 뒤에 할 일 (끝 화면으로 넘어가기). 어느 버튼으로 닫았든 한 번만 부른다 */
  onClose: () => void;
}

export function surveyModal(opts: SurveyModalOptions): HTMLElement {
  const back = document.createElement("div");
  back.className = "done-modal-back";
  back.tabIndex = -1;

  const box = document.createElement("div");
  box.className = "done-modal";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "survey-modal-title");

  const h = document.createElement("h2");
  h.id = "survey-modal-title";
  h.textContent = "사용자 의견을 들려주세요";

  const p = document.createElement("p");
  p.textContent = "써 보니 어땠는지 알려 주시면 서비스를 고치는 데 쓸게요. 1분이면 끝나요.";

  const go = document.createElement("a");
  go.className = "primary";
  go.href = opts.url;
  go.target = "_blank";
  go.rel = "noopener noreferrer";
  go.textContent = "후기 남기기";

  const later = document.createElement("button");
  later.type = "button";
  later.className = "done-modal-later";
  later.textContent = "다음에 할게요";

  let done = false;
  const close = (why: string): void => {
    if (done) return;
    done = true;
    opts.log.log({ name: "button", button: why });
    back.remove();
    opts.onClose();
  };

  go.addEventListener("click", () => close("survey_open"));
  later.addEventListener("click", () => close("survey_later"));
  // 뒷배경을 눌러도 닫힌다 — 모달 안을 누른 것과 구분한다
  back.addEventListener("click", (e) => { if (e.target === back) close("survey_later"); });
  back.addEventListener("keydown", (e) => { if (e.key === "Escape") close("survey_later"); });

  box.append(h, p, go, later);
  back.append(box);
  // 띄운 수 대비 누른 수가 참여율이다
  opts.log.log({ name: "button", button: "survey_shown" });
  queueMicrotask(() => go.focus());
  return back;
}
