/**
 * 화면 1 — 동의. 그 바탕이 되는 안내 화면이다.
 *
 * 본 앱(client/src/screens/consent.ts)의 `intro-camera` 를 옮겼다. 본 앱은 동의가
 * **한 화면**이다 — 사진과 확인할 것 셋이 깔린 바탕 위에 「사진 처리 안내」가 시트로 뜬다.
 * 이 버전도 2026-10-14 에 그렇게 되돌렸다: 전에는 안내(Intro)와 처리 안내(Consent)를
 * 두 화면으로 나눠 놔서 본 앱 흐름과 어긋났다.
 *
 * 시트가 열렸는지는 **이 화면이 들고 있다** (본 앱도 동의 화면이 들고 있다). 그래서
 * App.tsx 는 "동의 단계" 하나만 알면 되고, 창을 여닫는 일은 여기서 끝난다.
 *
 * 확인할 것 셋(앞머리·안경·밝기)과 아이콘 그림은 본 앱 것 그대로다 (2026-10-12, PR #421).
 *
 * ── 본 앱과 모양을 맞춘 날 (2026-10-14) ──
 *
 * 말풍선 글을 본 앱 `CONSENT_TEXT.coachMessage`("찍기전에 확인해주세요")로 되돌렸다.
 * 전에는 찍는 화면이 없어서 "화장하기 전에" 로 바꿔 뒀는데, 같은 날 촬영 화면이 바로 다음
 * 걸음으로 들어왔으니 이제 거짓이 아니다 — 본 앱 글을 그대로 쓸 수 있을 때는 그대로 쓴다.
 *
 * 버튼도 본 앱처럼 「촬영 시작」 + 카메라 아이콘(icon-camera-start.svg)으로 바꿨다.
 * 로고(`.intro-overlay-logo`)도 본 앱처럼 사진 위 왼쪽 위에 얹는다 — 이 화면에서는 폰 틀의
 * 로고 줄이 가려지기 때문이다 (app.css 의 `.app:has(.intro-camera) > .brand`).
 *
 * 2026-10-14: **쉐딩 안내선과 「쉐딩」 딱지를 가져왔다.** 전에는 "이 버전은 쉐딩을 쓰지
 * 않는다(src/parts.ts)" 는 까닭으로 뺐는데, 배포본과 나란히 놓고 보니 이 화면만 라벨이
 * 셋이라 눈에 띄게 달랐다. 여기 라벨은 **화장할 부위를 고르는 곳이 아니라 "이런 걸 봐 드려요"
 * 를 보여 주는 사진 장식**이라, 가이드에서 쉐딩을 안 쓰는 것과는 상관이 없다. 모양은
 * 배포본과 같아야 하니 되살렸다 (src/intro.css).
 */

import { useEffect, useRef, useState } from "react";
import Consent from "./Consent";
import "../intro.css";

/** 확인할 것 셋 — 이름과 아이콘 모두 본 앱(public/ui/icon-*.svg) 것이다 */
const CHECKS: readonly { name: string; icon: string }[] = [
  { name: "앞머리", icon: "/ui/icon-bangs.svg" },
  { name: "안경", icon: "/ui/icon-glasses.svg" },
  { name: "밝기", icon: "/ui/icon-brightness.svg" },
];

/** 본 앱 `CONSENT_TEXT` 와 같은 자리의 글 — 한곳에 모아 둬야 화면과 어긋나지 않는다 */
const INTRO_TEXT = {
  start: "촬영 시작",
  coachMessage: "찍기전에 확인해주세요",
} as const;

export default function Intro({ onAgree }: { onAgree: () => void }) {
  const [sheet, setSheet] = useState(false);
  const start = useRef<HTMLButtonElement>(null);
  /** 그냥 닫은 참인가 — 처음 그릴 때까지 포커스를 옮기지 않으려고 둔다 */
  const closing = useRef(false);

  const close = (): void => {
    closing.current = true;
    setSheet(false);
  };

  // 그냥 닫으면 포커스를 열었던 버튼으로 되돌린다 — 키보드로만 쓰면 포커스가 화면 맨 앞으로
  // 튕겨서 "내가 어디 있었지" 가 된다. **다시 그린 뒤에** 옮겨야 한다 — 닫기로 정한 그 순간엔
  // 바탕이 아직 `inert` 라 그 안의 버튼은 포커스를 받지 못한다
  useEffect(() => {
    if (sheet || !closing.current) return;
    closing.current = false;
    start.current?.focus();
  }, [sheet]);

  return (
    <section className="screen">
      {/*
        시트가 떠 있는 동안 바탕은 `inert` 다 — 뒤 화면의 버튼이 탭으로 눌리면 모달이 아니다.
        시트 안에서도 탭을 한 바퀴 돌려 붙잡는다 (Consent.tsx)
      */}
      <div className="intro-camera" inert={sheet}>
        {/*
          본 앱에서는 이 사진이 화면 전체 바탕이다. 여기서는 폰 폭(.app) 안에 본 앱과 같은
          비율(941:1672)로 넣는다 — 부위 이름(눈썹·아이라인·볼터치)이 들어 있는 윗부분이
          보이도록 위를 기준으로 자른다
        */}
        <img
          className="intro-photo"
          src="/ui/intro-face-guides.webp"
          alt="눈썹·아이라인·볼터치 자리를 짚어 둔 화장 예시 사진"
        />
        {/*
          「쉐딩」만 사진에 안 그려져 있어서 여기서 얹는다 — 배포본도 같은 방식이다.
          좌표는 본 앱 consent.ts 의 것 그대로이고, `viewBox` 가 사진 비율(941:1672)과
          같아서 폭이 달라져도 자리가 안 어긋난다
        */}
        <svg className="shading-guide" viewBox="0 0 941 1672" aria-hidden="true">
          <path d="M616 753 Q563 828 478 868" />
          <circle cx="486" cy="862" r="8" />
          <line x1="493" y1="861" x2="540" y2="882" />
        </svg>
        <div className="makeup-label label-shading">쉐딩</div>

        {/* 로고 — 본 앱도 이 사진 위 왼쪽 위에 얹는다 (`.intro-overlay-logo`) */}
        <div className="brand intro-overlay-logo" aria-label="nudy">
          <span>nudy</span>
          <i className="heart" aria-hidden="true" />
        </div>

        <img className="nudy-coach-face" src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
        {/*
          말풍선이 이 화면의 제목이다 — 다른 화면처럼 `h1` 로 둔다. 화면을 읽어 주는 기기에는
          화면마다 제목이 하나씩 있어야 "어디로 넘어왔는지" 가 들린다. 보이는 모양은 말풍선 그대로다
        */}
        <h1 className="nudy-coach-bubble">
          {INTRO_TEXT.coachMessage}
          {/* 말풍선 오른쪽 위의 작은 하트 — 본 앱 `.nudy-coach-bubble i` */}
          <i aria-hidden="true" />
        </h1>

        {/* 사진 위에 얹히는 바탕 시트 — 본 앱 `.intro-bottom-sheet` 자리 */}
        <div className="intro-bottom-sheet">
          <ul className="intro-checks">
            {CHECKS.map((c) => (
              <li key={c.name} className="intro-check">
                {/* 그림 파일(SVG)이라 색을 CSS 로 못 바꾼다 — 색은 파일 안에 있다 (본 앱 주석 그대로) */}
                <img className="check-icon" src={c.icon} alt="" aria-hidden="true" />
                <span>{c.name}</span>
                {/* 초록 체크 동그라미는 장식이다 — 눌러서 켜고 끄는 것이 아니라 "이것만 보면 된다" 는 표시 */}
                <i aria-hidden="true" />
              </li>
            ))}
          </ul>

          <button
            ref={start}
            type="button"
            className="intro-camera-start"
            onClick={() => setSheet(true)}
          >
            {/* 아이콘은 꾸밈이다 — 글자가 이미 무엇을 하는지 말한다 */}
            <img src="/ui/icon-camera-start.svg" alt="" aria-hidden="true" />
            <span>{INTRO_TEXT.start}</span>
          </button>
        </div>
      </div>

      {sheet && <Consent onAgree={onAgree} onClose={close} />}
    </section>
  );
}
