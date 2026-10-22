/**
 * 화면 1 앞 — 서버 처리 동의 · 이용 불가 (F-01, 정의서 1-6). 모듈 ①.
 *
 * 세션마다 묻는다. 거부하면 "서버 처리에 동의해야 사용할 수 있어요" 에서 멈춘다 (폰 전용 모드 없음).
 * 이벤트: consent{ok} (capture-events).
 */

import type { Screen, ScreenContext } from "./shell";
import { unlockShutterCue } from "./capture";

export interface ConsentDeps {
  /** 세션에 동의 여부를 적는다 */
  setConsent: (ok: boolean) => void;
  /** consent 이벤트 (capture-events.consent) */
  onConsent: (ok: boolean) => void;
}

/**
 * 안내문 — 소제목 넷. `**…**` 로 감싼 곳은 화면에서 굵게 보인다 (2026-10-13: 한 덩어리 글이라 데이터 처리 방식이 안 보인다는 피드백).
 * 테스트 기간은 2026-10-19 오후 3시까지, 사진 · 사용 기록은 같은 날 오후 5시에 모두 지운다. 지워 달라는 요청은 후기 설문으로 받는다 (2026-10-12 결정).
 * "테스트 기간 보관" 은 서버의 보관 설정(compose.yml DHE_KEEP_UNTIL)과 짝이다 — 보관을 끄면 이 묶음도 같이 뺀다
 */
export const CONSENT_SECTIONS = [
  {
    head: "서버로 보내는 사진",
    text: "맨얼굴 사진을 한 장 찍어요. 그 사진과 올려 주신 참고 사진을 **서버로 보내** 예상 메이크업을 만들어요. 화장을 다 한 뒤에 찍는 사진도 **서버로 보내** 피드백에 써요.",
  },
  {
    head: "테스트 기간 보관",
    text: "지금은 테스트 기간이에요 (10월 19일 오후 3시까지). 맨얼굴, 예상 메이크업, 화장한 뒤 찍은 사진과 피드백 결과를 **서버에 10월 19일 오후 5시까지 보관해요.** 피드백이 맞는지 사람이 확인하고 기준을 다듬는 데만 써요. **10월 19일 오후 5시에 모두 지우고**, 그 전에도 지워 달라고 하시면 바로 지워요 — **끝낼 때 나오는 후기 설문에 적어 주세요.** 올려 주신 **참고 사진은 보관하지 않고**, 예상 메이크업을 만든 뒤 바로 지워요.",
  },
  {
    head: "폰에 남는 것",
    text: "폰에 있는 사진과 결과는 **끝내기를 누르면 바로 지워져요.** 누르지 않고 닫으면 폰에 남아 있다가, 2시간이 지난 뒤 다시 열 때 지워져요.",
  },
  {
    head: "사용 기록",
    text: "서비스를 고치는 데 쓰려고 사용 기록도 함께 보내요. 어느 링크로 들어왔는지, 어느 화면까지 갔는지, 버튼을 눌렀는지 같은 것만이고 — **사진과 얼굴 위치는 보내지 않아요.** 사용 기록도 **10월 19일 오후 5시에 모두 지워요.**",
  },
] as const;

/**
 * 「동의하고 시작」 바로 위의 요약 세 줄 (2026-10-13).
 *
 * 얼굴 · 카메라 · 사진을 쓰는 앱이라 사용자가 망설인다. 전문은 소제목 넷에 긴 글이라
 * 끝까지 읽지 않는 사람이 많다 — 누르기 직전에 **언제 지우는지**만 짧게 다시 말한다.
 *
 * **새 약속을 만들지 않는다.** 세 줄 다 위 CONSENT_SECTIONS 에 이미 있는 말이고,
 * 전문이 바뀌면 여기도 같이 고친다. "임시 저장" 같은 두루뭉술한 말 대신 날짜를 적는 것은,
 * 지금 사진을 **서버에 10월 19일까지 보관하기 때문**이다 (#385). 짧게 쓰려고 사실을
 * 흐리면 전문과 어긋나 거짓말이 된다.
 */
export const CONSENT_POINTS = [
  "참고 사진은 예상 메이크업을 만든 뒤 바로 지워요",
  "나머지 사진은 10월 19일 오후 5시에 모두 지워요",
  "얼굴 위치·사진은 사용 기록에 담기지 않아요",
] as const;

export const CONSENT_TEXT = {
  start: "촬영 시작",
  notice: "처리 안내",
  status: "오늘 얼굴 기준 만들기",
  bubble: "먼저 맨얼굴을 확인할게요",
  coachMessage: "찍기전에 확인해주세요",
  checks: ["앞머리", "안경", "밝기"],
  title: "사진 처리 안내",
  // 안내문 전체 (굵게 표시를 뺀 글) — 화면은 CONSENT_SECTIONS 로 그린다
  body: CONSENT_SECTIONS.map((s) => s.text.replaceAll("**", "")).join("\n\n"),
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
        <div class="nudy-coach-bubble">
          <span>${CONSENT_TEXT.coachMessage}</span>
          <i aria-hidden="true"></i>
        </div>
        <svg class="shading-guide" viewBox="0 0 941 1672" aria-hidden="true">
          <path class="shading-guide-main" d="M616 753 Q563 828 478 868" />
          <circle class="shading-guide-dot" cx="486" cy="862" r="8" />
          <line class="shading-guide-line" x1="493" y1="861" x2="540" y2="882" />
        </svg>
        <div class="makeup-label label-shading">쉐딩</div>
        <div class="intro-bottom-sheet">
          <div class="intro-checks">
            <div class="intro-check">
              <img class="check-icon" src="/ui/icon-bangs.svg" alt="" aria-hidden="true" />
              <span>앞머리</span><i aria-hidden="true"></i>
            </div>
            <div class="intro-check">
              <img class="check-icon" src="/ui/icon-glasses.svg" alt="" aria-hidden="true" />
              <span>안경</span><i aria-hidden="true"></i>
            </div>
            <div class="intro-check">
              <img class="check-icon" src="/ui/icon-brightness.svg" alt="" aria-hidden="true" />
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
        // iOS 는 사용자가 누르는 그 순간에 소리를 열어 둬야 촬영 때 "삑" 이 난다.
        // 자동으로 찍히니 그 소리가 찍혔다는 신호다 (#338 ③)
        if (ok) unlockShutterCue();
        deps.setConsent(ok);
        deps.onConsent(ok);
        ctx.go(ok ? "capture" : "denied");
      };
      const start = button(CONSENT_TEXT.start, "intro-camera-start", openSheet);
      start.innerHTML = `
        <img src="/ui/icon-camera-start.svg" alt="" aria-hidden="true" />
        <span>${CONSENT_TEXT.start}</span>
      `;
      const sheetTitle = document.createElement("h2");
      sheetTitle.textContent = CONSENT_TEXT.title;
      // 소제목 + 문단. `**…**` 사이만 굵게 — 글자를 그대로 넣는다 (innerHTML 안 씀)
      const sheetBody = document.createElement("div");
      sheetBody.className = "consent-body";
      for (const s of CONSENT_SECTIONS) {
        const head = document.createElement("h3");
        head.textContent = s.head;
        const p = document.createElement("p");
        s.text.split("**").forEach((piece, i) => {
          if (!piece) return;
          if (i % 2) {
            const b = document.createElement("strong");
            b.textContent = piece;
            p.append(b);
          } else p.append(piece);
        });
        sheetBody.append(head, p);
      }
      // 누르기 직전에 한 번 더 — 전문을 끝까지 안 읽어도 언제 지우는지는 보이게
      const points = document.createElement("ul");
      points.className = "consent-points";
      for (const t of CONSENT_POINTS) {
        const li = document.createElement("li");
        li.textContent = t;
        points.append(li);
      }
      const row = document.createElement("div");
      row.className = "row";
      row.append(button(CONSENT_TEXT.agree, "primary", choose(true)), button(CONSENT_TEXT.deny, "", closeSheet));
      sheet.append(sheetTitle, sheetBody, points, row);
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
