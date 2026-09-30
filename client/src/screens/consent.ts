/**
 * 화면 1 앞 — 서버 처리 동의 · 이용 불가 (F-01, 정의서 1-6). 모듈 ①.
 *
 * 세션마다 묻는다. 거부하면 "서버 처리에 동의해야 사용할 수 있어요" 에서 멈춘다 (폰 전용 모드 없음).
 * 이벤트: consent{ok} (capture-events).
 */

import type { Screen, ScreenContext } from "./shell";

export interface ConsentDeps {
  /** 세션에 동의 여부를 적는다 */
  setConsent: (ok: boolean) => void;
  /** consent 이벤트 (capture-events.consent) */
  onConsent: (ok: boolean) => void;
}

export const CONSENT_TEXT = {
  start: "촬영 시작",
  notice: "처리 안내",
  status: "오늘 얼굴 기준 만들기",
  bubble: "먼저 맨얼굴을 확인할게요",
  checks: ["앞머리", "안경", "밝기"],
  title: "사진 처리 안내",
  body: "맨얼굴 사진 3장(정면·왼쪽·오른쪽)을 서버로 보내 화장 완성 예상을 만들어요. 처리가 끝나면 서버에서 바로 지워요. 눈 감은 사진과 화장하는 모습은 이 폰에만 있고, 끝내기를 누르면 폰에서도 지워요.",
  agree: "동의하고 시작",
  deny: "닫기",
  denied: "서버 처리에 동의해야 사용할 수 있어요",
  back: "다시 생각해 볼게요",
} as const;

function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

export function consentScreen<S>(deps: ConsentDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const wrap = document.createElement("div");
      wrap.className = "intro-camera";
      wrap.innerHTML = `
        <div class="nudy-logo intro-overlay-logo" aria-label="nudy">
          <span>nudy</span>
          <i aria-hidden="true"></i>
        </div>
        <div class="intro-bottom-sheet">
          <div class="intro-checks">
            <div class="intro-check"><b class="check-icon hair"></b><span>앞머리</span><i aria-hidden="true"></i></div>
            <div class="intro-check"><b class="check-icon glasses"></b><span>안경</span><i aria-hidden="true"></i></div>
            <div class="intro-check"><b class="check-icon light"></b><span>밝기</span><i aria-hidden="true"></i></div>
          </div>
        </div>
      `;
      const bottom = wrap.querySelector(".intro-bottom-sheet");
      if (!bottom) throw new Error("intro bottom sheet is missing");
      const sheet = document.createElement("div");
      sheet.className = "consent-sheet";
      sheet.hidden = true;
      const openSheet = () => {
        ctx.log.log({ name: "button", button: "consent_open" });
        sheet.hidden = false;
      };
      const closeSheet = () => {
        ctx.log.log({ name: "button", button: "consent_close" });
        sheet.hidden = true;
      };
      const choose = (ok: boolean) => () => {
        ctx.log.log({ name: "button", button: ok ? "consent_agree" : "consent_deny" });
        deps.setConsent(ok);
        deps.onConsent(ok);
        ctx.go(ok ? "capture" : "denied");
      };
      const start = button(CONSENT_TEXT.start, "intro-camera-start", openSheet);
      const sheetTitle = document.createElement("h2");
      sheetTitle.textContent = CONSENT_TEXT.title;
      const sheetBody = document.createElement("p");
      sheetBody.textContent = CONSENT_TEXT.body;
      const row = document.createElement("div");
      row.className = "row";
      row.append(button(CONSENT_TEXT.agree, "primary", choose(true)), button(CONSENT_TEXT.deny, "", closeSheet));
      sheet.append(sheetTitle, sheetBody, row);
      bottom.append(start);
      wrap.append(sheet);
      ctx.root.append(wrap);
    },
  };
}

/** 거부 뒤. 여기서 멈춘다 — 동의 화면으로 돌아가는 버튼 하나만 */
export function deniedScreen<S>(): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const wrap = document.createElement("div");
      wrap.className = "consent";
      const h = document.createElement("h1");
      h.textContent = CONSENT_TEXT.denied;
      const row = document.createElement("div");
      row.className = "row";
      row.append(button(CONSENT_TEXT.back, "", () => {
        ctx.log.log({ name: "button", button: "consent_back" });
        ctx.go("consent");
      }));
      wrap.append(h, row);
      ctx.root.append(wrap);
    },
  };
}
