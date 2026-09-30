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
        <img class="nudy-coach-face" src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
        <div class="intro-bottom-sheet">
          <div class="intro-checks">
            <div class="intro-check">
              <svg class="check-icon" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M11 39V23C11 13 16.8 8 24 8s13 5 13 15v16" />
                <path d="M16 39V25c0-4.7 2.5-8.2 7-10.2" />
                <path d="M24 15c3.8 3.4 5.5 7.3 5.5 12.8V39" />
                <path d="M18 25c3.8 1.4 8.2 1.4 12 0" />
              </svg>
              <span>앞머리</span><i aria-hidden="true"></i>
            </div>
            <div class="intro-check">
              <svg class="check-icon" viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="17" cy="25" r="8" />
                <circle cx="31" cy="25" r="8" />
                <path d="M25 24.2c-.7-.5-1.3-.5-2 0" />
                <path d="M9 22.5 5 20" />
                <path d="m39 22.5 4-2.5" />
              </svg>
              <span>안경</span><i aria-hidden="true"></i>
            </div>
            <div class="intro-check">
              <svg class="check-icon" viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="8" />
                <path d="M24 6v6" />
                <path d="M24 36v6" />
                <path d="M6 24h6" />
                <path d="M36 24h6" />
                <path d="m11.3 11.3 4.2 4.2" />
                <path d="m32.5 32.5 4.2 4.2" />
                <path d="m36.7 11.3-4.2 4.2" />
                <path d="m15.5 32.5-4.2 4.2" />
              </svg>
              <span>밝기</span><i aria-hidden="true"></i>
            </div>
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
      start.innerHTML = `
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M15 17h5l2.5-4h7L32 17h5a5 5 0 0 1 5 5v13a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5V22a5 5 0 0 1 5-5h4Z" />
          <circle cx="24" cy="29" r="8" />
        </svg>
        <span>${CONSENT_TEXT.start}</span>
      `;
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
