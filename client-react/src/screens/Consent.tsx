/**
 * 처리 안내 — 동의 화면(Intro.tsx) **위에 뜨는 시트**, 그리고 거절 뒤의 이용 불가 화면.
 *
 * 본 앱(client/src/screens/consent.ts)과 짜임을 맞췄다. 본 앱은 동의가 **한 화면**이다:
 * 사진이 깔린 바탕(`intro-camera`) 위에 `consent-sheet` 가 모달로 뜬다. 거절하면 가는
 * 곳(이 파일의 `Denied`)도 본 앱 `deniedScreen` 과 같은 자리다.
 *
 * ── 2026-10-14: 배포본(nudy.shelldocs.cloud) 글로 되돌렸다 ──
 *
 * 전에는 "서버가 아직 안 붙어 있어서 어디로도 보내지 않아요" 라고 적혀 있었다. **서버가
 * 붙은 지금은 거짓말이다** — `api.ts` 의 `makeAnswerPicture` 가 맨얼굴과 참고 사진을
 * 백엔드로 보낸다. 안내문에 거짓이 한 줄이라도 있으면 안내가 아니다.
 *
 * 그래서 소제목 넷과 문장을 **배포본 `CONSENT_SECTIONS` 그대로** 가져왔다. 보관 날짜
 * (10월 19일 오후 3시·5시)도 그대로 쓴다 — 이 버전은 배포본과 **같은 백엔드**를 보기
 * 때문에 그 날짜가 실제로 지켜진다.
 *
 * 글을 옮기기 전에 코드로 확인한 것 (추측으로 적지 않는다):
 *  - **무엇이 바깥으로 나가나** → `src/` 에서 `fetch(`·`sendBeacon`·`XMLHttpRequest` 를
 *    모두 찾으면 보내는 곳은 `core/transfer-client.ts` 하나다 (맨얼굴 + 참고 사진 또는
 *    템플릿 번호). 나머지는 `templates.json` 과 얼굴 찾는 프로그램 파일을 **받아 오기만** 한다.
 *  - **사용 기록** → `core/log.ts` 의 기본 sink 가 `console.log` 다. 모아 두거나 보내는
 *    코드가 없다. 그래서 그 묶음만 배포본 글을 못 쓴다 — 아래 네 번째 묶음에 적어 뒀다.
 *
 * 사용 기록을 서버로 보내게 되는 날, 네 번째 묶음부터 배포본 글로 되돌려야 한다.
 */

import { Fragment, useEffect, useRef, type KeyboardEvent } from "react";
import { unlockShutterCue } from "../lib/shutter-cue";

/**
 * `**…**` 로 감싼 곳은 화면에서 굵게 보인다 — 본 앱과 같은 적는 방식.
 *
 * 글은 **본 앱 `screens/consent.ts` 의 `CONSENT_SECTIONS` 와 같다** (2026-10-14, #454 A7) — 사용 기록 보내기(`/events`)와
 * 사진 보관(`/keep`)이 붙었으니(`lib/ops`) 글도 그 동작 그대로여야 한다. 다른 곳은 "폰에 남는 것" 한 줄뿐이다:
 * 이 버전은 폰에 사진을 저장하지 않아서(session-store 없음) "2시간 뒤 지운다" 대신 "창을 닫으면 사라진다" 로 적는다.
 * 본 앱이 글을 바꾸면 여기도 같이 바꾼다
 */
const CONSENT_SECTIONS: readonly { head: string; text: string }[] = [
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
    text: "폰에 있는 사진과 결과는 **끝내기를 누르면 바로 지워져요.** 누르지 않고 닫아도 창을 닫는 순간 사라져요 — 이 버전은 폰에 사진을 따로 저장하지 않아요.",
  },
  {
    head: "사용 기록",
    text: "서비스를 고치는 데 쓰려고 사용 기록도 함께 보내요. 어느 링크로 들어왔는지, 어느 화면까지 갔는지, 버튼을 눌렀는지 같은 것만이고 — **사진과 얼굴 위치는 보내지 않아요.** 사용 기록도 **10월 19일 오후 5시에 모두 지워요.**",
  },
];
/** 본 앱 `CONSENT_TEXT` 와 같은 자리의 글 — 한곳에 모아 둬야 화면과 어긋나지 않는다 */
const CONSENT_TEXT = {
  title: "사진 처리 안내",
  agree: "동의하고 시작",
  /**
   * 배포본과 같은 「닫기」다 — 누르면 **시트만 닫히고** 인트로로 돌아간다 (배포본 consent.ts
   * 의 `button(CONSENT_TEXT.deny, "", closeSheet)`). 전에는 이 버튼이 거절로 걸려 있어서
   * 글을 「동의하지 않을래요」로 바꿔 뒀는데, 배포본과 글도 하는 일도 달라져서 되돌렸다.
   */
  deny: "닫기",
  denied: "서버 처리에 동의해야 사용할 수 있어요",
  back: "다시 생각해 볼게요",
} as const;

/** `**…**` 사이만 굵게. 글자를 그대로 넣는다 — 본 앱도 `innerHTML` 을 쓰지 않는다 */
function bolded(text: string) {
  // 굵은 조각에만 열쇠가 필요하다 — 글이 고정이라 자리(번호)와 글자를 같이 쓰면 겹칠 일이 없다
  return text.split("**").map((piece, i) => (i % 2 ? <strong key={`${i}-${piece}`}>{piece}</strong> : piece));
}

export default function Consent({
  onAgree,
  onClose,
}: {
  onAgree: () => void;
  /**
   * 아무것도 정하지 않고 시트만 닫기 — Esc · 뒷배경 · 「닫기」가 모두 이 길이다.
   * 배포본도 거절로 가는 길이 시트에 없다 (`deniedScreen` 은 남아 있지만 들어갈 길이 없다).
   */
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  // 뜨면 바로 키보드를 창 안으로. 버튼이 아니라 **창 자체**에 둔다 —
  // 「동의하고 시작」에 미리 포커스를 주면 엔터 한 번에 동의가 눌려 버린다
  useEffect(() => {
    box.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    // 탭이 창 안에서만 돌게 한다. 바탕은 `inert` 로 막아 두었지만(Intro.tsx), 주소창까지
    // 나갔다 돌아오는 길이 있어서 창 안에서 한 바퀴 돌도록 여기서 한 번 더 붙잡는다
    // 버튼 말고 안내문(`.consent-body`)도 센다 — 글이 길어 혼자 굴러가는 칸이라
    // 브라우저가 탭으로 잡아 준다 (키보드만으로 끝까지 읽으려면 거기부터 들어가야 한다)
    const items = [...(box.current?.querySelectorAll<HTMLElement>("button, .consent-body") ?? [])];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const now = document.activeElement;
    if (e.shiftKey && (now === first || now === box.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && now === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    // 뒷배경을 누르면 **아무것도 정하지 않고** 닫는다 — 되돌리기 어려운 쪽(거절)이
    // 실수로 눌리면 안 되니, 뒷배경과 Esc 는 언제나 그냥 닫는 쪽이다 (본 앱 restart-modal 규칙)
    <div
      className="consent-sheet-back"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="consent-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-sheet-title"
        tabIndex={-1}
        ref={box}
      >
        <h2 id="consent-sheet-title">{CONSENT_TEXT.title}</h2>

        {/* 글이 길어서 글만 따로 굴린다 — 아래 버튼은 늘 보인다 (본 앱 `.consent-body`) */}
        <div className="consent-body">
          {CONSENT_SECTIONS.map((s) => (
            <Fragment key={s.head}>
              <h3>{s.head}</h3>
              <p>{bolded(s.text)}</p>
            </Fragment>
          ))}
        </div>

        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() => {
              // iOS 는 **사용자가 누르는 그 순간**에 소리를 열어야 나중에 셔터 소리가 난다 —
              // 탭 밖에서 만든 AudioContext 는 멈춤 상태로 둔다. 촬영 화면에서 처음 소리를
              // 내려 하면 그때는 이미 늦다(사용자가 누른 적이 없는 시점이라 거부된다).
              // 자동으로 찍히니 그 소리가 "찍혔다" 는 유일한 신호다.
              // 본 앱도 같은 자리에서 부른다 (client/src/screens/consent.ts 의 `choose(true)`).
              unlockShutterCue();
              onAgree();
            }}
          >
            {CONSENT_TEXT.agree}
          </button>
          {/* 배포본처럼 시트만 닫는다 — 거절은 뒷배경·Esc 와 같은 길이다 */}
          <button type="button" onClick={onClose}>
            {CONSENT_TEXT.deny}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 거절 뒤 — 여기서 멈춘다. 돌아가는 버튼 하나만 둔다 (본 앱 `deniedScreen` 그대로).
 *
 * 본 앱 제목은 "서버 처리에 동의해야 사용할 수 있어요" 인데, 이 버전은 서버가 없어서
 * "서버 처리" 라고 쓸 수 없다. 동의가 쓰는 조건이라는 뜻은 그대로 두고 말만 고쳤다.
 *
 * 모양은 본 앱 `deniedScreen` 그대로다 (2026-10-14) — 가운데 정렬도, 큰 제목도, 알약 버튼도
 * 쓰지 않는다. 본 앱은 작은 제목(`.screen h1`) 하나와 테두리 버튼 한 줄(`.row`)뿐이다.
 */
export function Denied({ onBack }: { onBack: () => void }) {
  return (
    <section className="screen consent">
      <h1>{CONSENT_TEXT.denied}</h1>
      <div className="row">
        <button type="button" onClick={onBack}>
          {CONSENT_TEXT.back}
        </button>
      </div>
    </section>
  );
}
