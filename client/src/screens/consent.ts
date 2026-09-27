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
  title: "시작하기 전에",
  body: "맨얼굴 사진 3장(정면·왼쪽·오른쪽)을 서버로 보내 화장 완성 예상을 만들어요. 처리가 끝나면 서버에서 바로 지워요. 눈 감은 사진과 화장하는 모습은 이 폰에만 있고, 끝내기를 누르면 폰에서도 지워요.",
  agree: "동의하고 시작",
  deny: "동의하지 않음",
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
      wrap.className = "consent";
      const h = document.createElement("h1");
      h.textContent = CONSENT_TEXT.title;
      const p = document.createElement("p");
      p.textContent = CONSENT_TEXT.body;
      const row = document.createElement("div");
      row.className = "row";
      const choose = (ok: boolean) => () => {
        ctx.log.log({ name: "button", button: ok ? "consent_agree" : "consent_deny" });
        deps.setConsent(ok);
        deps.onConsent(ok);
        ctx.go(ok ? "capture" : "denied");
      };
      row.append(button(CONSENT_TEXT.agree, "primary", choose(true)), button(CONSENT_TEXT.deny, "", choose(false)));
      wrap.append(h, p, row);
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
