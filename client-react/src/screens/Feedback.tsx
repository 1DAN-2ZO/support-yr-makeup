/**
 * 화면 7 — 피드백.
 *
 * **점수·숫자는 보여 주지 않는다** (본 앱의 정해진 규칙). 85점이라고 적으면 사람은 15점이
 * 어디서 깎였는지를 묻게 되는데, 사진에서 뽑은 색으로는 그만큼을 설명할 수 없다.
 * 그래서 부위마다 「비슷해요 / 다시 볼 곳 / 알림」 과 문장 한 줄로만 말한다.
 *
 * ── 2026-10-14: 진짜 채점이 붙었다 ──
 *
 * 전에는 어느 부위가 어느 묶음으로 가는지가 **이 파일에 박혀 있었다** (아래 `SAME` · `AGAIN`).
 * 이제는 **예상 메이크업(정답사진)과 완성사진 두 장을 실제로 견줘서** 부위별 문장을 받는다 —
 * 재는 것도 문장을 고르는 것도 본 앱 것 그대로다 (`core/feedback-measure` → `core/feedback-whole`).
 * 이 화면이 하는 일은 **그린 것뿐**이다. 문장을 여기서 만들지 않는다 (본 앱 `feedbackSlot` 과 같다).
 *
 * 그리는 상태 넷 (본 앱 `flow-slots.ts` 의 `feedbackSlot` 과 같은 차례) —
 *   wait    견주는 중. 부위별로 하나씩 채우지 않고 **다 되면 한 번에** 바꾼다
 *   done    견준 결과 — 사진 두 장 · 요약 두 줄 · 부위별 줄
 *   blocked 사진 조건이 맨얼굴과 많이 달라 판정하지 않았다 → 다시 찍으러 가는 길
 *   cannot  아예 못 견줬다 (맨얼굴 · 예상 메이크업 · 완성사진 없음) → **아래 본보기 문장으로 떨어진다**
 *
 * **본보기 문장은 못 견뎠을 때만 쓴다.** 견준 적이 없는데 견준 것처럼 보이면 그게 거짓이라,
 * 그때는 `.fb-note` 에 **왜 견준 결과가 아닌지** 한 줄을 반드시 같이 적는다.
 *
 * 본 앱과 다른 곳 둘 —
 *  - 라이너 꼬리 · 눈썹 꼬리는 못 잰다. 본 앱은 서버가 만든 「옮긴 그림」과 머리카락 분할을
 *    같이 넣는데 이 버전에는 둘 다 없다 (`lib/feedback-source` 의 `getMoved` · `getHair` 를 안 넘긴다).
 *    그 줄은 본 앱이 같은 상황에서 쓰는 말 그대로 「이번에는 볼 수 없었어요」로 나오고,
 *    아래 `.fb-side` 에 왜인지를 적는다.
 *  - 판정이 막혔을 때(blocked) 본 앱은 「완성사진 다시 찍기」 하나만 두는데, 여기는 **다음으로 가는
 *    길도 같이** 둔다. PC 미리보기에는 카메라가 없어 다시 찍을 수 없는데 그 버튼 하나만 두면
 *    흐름이 거기서 막힌다.
 *
 * 2026-10-14: 아래에 있던 「이전」을 뺐다. 뒤로 가는 길은 **맨 위 로고 줄의 화살표**다
 * (App.tsx `LogoRow`) — 본 앱과 같은 자리이고, 아래에는 큰 버튼 하나만 둔다.
 */

import { useEffect, useState } from "react";
import type { PartColors } from "../api";
import { PART_NAME } from "../parts";
import type { PalettePart } from "@core/color-family";
import type { FeedbackLine } from "@core/feedback-whole";
import type { MakeupTemplate } from "@core/templates";
import type { FeedbackLoad, FeedbackView } from "../lib/feedback-source";
import "../feedback.css";

/*
 * 색 이름 **뒤에 조사를 붙이지 않는다** — "코랄이/코랄가" 는 받침에 따라 갈리는데, 색 이름은
 * "딥레드"(받침 없음)와 "코랄"(받침 있음)이 섞여 나와서 하나로 적으면 한쪽이 틀린 말이 된다.
 * 쉼표로 끊거나 "○○ 라인이" 처럼 다른 낱말을 세워 두면 어떤 이름이 와도 말이 된다.
 */

/** 잘 따라간 부위 — 색 이름을 넣어 "무엇이 비슷한지" 까지 말한다 (못 견뎠을 때만 쓴다) */
const SAME: readonly { part: PalettePart; say: (color: string) => string }[] = [
  { part: "brow", say: (c) => `${c}, 결을 살려 빈 곳까지 채웠어요` },
  { part: "lip", say: (c) => `${c}, 안쪽부터 자연스럽게 번졌어요` },
  { part: "cheek", say: (c) => `${c}, 웃는 자리에 동그랗게 올라갔어요` },
];

/** 다시 볼 부위 — 뭐가 아쉬운지가 아니라 **무엇을 해 보라는 것**으로 적는다 (못 견뎠을 때만 쓴다) */
const AGAIN: readonly { part: PalettePart; say: (color: string) => string }[] = [
  { part: "liner", say: (c) => `${c} 라인이 눈 끝에서 끊겼어요. 속눈썹 쪽으로 더 붙여 보세요` },
  { part: "shadow", say: (c) => `${c}, 눈두덩 가운데에 몰렸어요. 끝 쪽으로 더 펴 주세요` },
];

/** 묶음 이름 — 본 앱 `TONE_LABEL` 그대로. info 는 "견줄 것이 없거나 볼 수 없었다" 는 줄이다 */
const TONE_LABEL: Record<string, string> = { ok: "비슷해요", fix: "다시 볼 곳", info: "알림" };

/** 못 그리는 까닭 — 왜 아직 피드백을 못 주는지 사람 말로 (본 앱 `FEEDBACK_MISSING`, `core/feedback-run` 의 FeedbackMissing) */
const MISSING_TEXT: Record<string, string> = {
  bare: "맨얼굴 사진이 없어요. 처음 촬영부터 다시 해 주세요",
  answer: "예상 메이크업이 아직 없어요. 참고 사진을 올리는 화면부터 다시 해 주세요",
  attempt: "화장한 사진이 없어요. 완성사진을 먼저 찍어 주세요",
  answer_size: "예상 메이크업이 맨얼굴과 크기가 달라요. 참고 사진을 다시 올려 주세요",
  /* 사진을 못 풀었거나 얼굴 점이 모자라 재다가 터진 것 — 까닭을 가릴 수 없으니 할 수 있는 일만 말한다 */
  error: "사진을 견주다가 멈췄어요. 완성사진을 다시 찍으면 한 번 더 해 볼게요",
};

/** 지금 그릴 것 */
type Phase =
  | { k: "wait" }
  | { k: "done"; view: FeedbackView }
  | { k: "cannot"; why: string };

/** 부위별 줄 — 순서·문장은 `core/feedback-whole` 이 정한 그대로 그린다. 종류를 색만으로 가르지 않고 딱지에 글자로도 적는다 */
function Line({ p }: { p: FeedbackLine }) {
  return (
    <div className={`fb-line is-${p.tone}`}>
      <div className="fb-head">
        <strong>{p.name}</strong>
        <em>{TONE_LABEL[p.tone] ?? ""}</em>
      </div>
      <p className="fb-say">{p.line}</p>
      {p.more && <p className="fb-more">{p.more}</p>}
      {p.fix && <p className="fb-fix">{p.fix}</p>}
    </div>
  );
}

export default function Feedback({
  template,
  colors,
  getFeedback,
  onNext,
  onRetake,
}: {
  template: MakeupTemplate;
  colors: PartColors;
  /**
   * 견준 결과 받아 오기 (App 의 보관함 — `lib/feedback-source` 의 `createFeedbackKeeper`).
   *
   * **한 번 만들고 바꾸지 않는 함수여야 한다.** 그릴 때마다 새로 만들면 아래 효과가 다시 돌아
   * 같은 사진을 또 재러 간다. 안 주면 곧바로 본보기 문장으로 떨어진다
   */
  getFeedback?: () => Promise<FeedbackLoad>;
  /**
   * 저장·끝 화면으로 (2026-10-14).
   *
   * 전에는 여기가 마지막이라 "처음부터 다시" 였는데, 뒤에 저장 화면이 붙으면서 **다음으로
   * 넘기는 버튼**이 됐다. 처음으로 돌아가는 길은 마지막 화면 하나에만 둔다 — 두 화면에
   * 같이 두면 어디가 끝인지가 흐려진다
   */
  onNext: () => void;
  /** 완성사진을 다시 찍으러. 사진 조건이 달라 판정이 막혔을 때만 쓴다. 안 주면 그 버튼을 안 그린다 */
  onRetake?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(() => (getFeedback ? { k: "wait" } : { k: "cannot", why: "answer" }));

  /*
   * 들어오면 한 번 받아 온다. **보관함이 들고 있는 것을 받는 것**이라, 개발 모드(StrictMode)에서
   * 효과가 두 번 돌아도 같은 약속을 두 번 받을 뿐 채점은 한 번만 돈다 — `useCamera` · `App.tsx` 의
   * `createGuideKeeper` 가 푼 방식과 같다. 화면을 다시 들어와도 마찬가지다.
   *
   * 사진 주소(objectURL)를 여기서 돌려주지 않는 것도 그래서다 — 들고 있는 쪽이 보관함이라,
   * 놓는 자리도 App 의 `clear()` 한 곳이다. 여기서 놓으면 다시 들어왔을 때 빈 사진이 뜬다
   */
  useEffect(() => {
    if (!getFeedback) return;
    let alive = true;
    void getFeedback()
      .then((r) => {
        if (!alive) return;
        setPhase(r.ok ? { k: "done", view: r.view } : { k: "cannot", why: r.missing });
      })
      // 재료 모으기가 오류로 끝나도(사진을 못 풂 등) 기다리는 화면에서 멈추지 않는다
      .catch(() => { if (alive) setPhase({ k: "cannot", why: "error" }); });
    return () => { alive = false; };
  }, [getFeedback]);

  const next = (
    <button type="button" className="go" onClick={onNext}>
      다음 · 저장하러 가기
    </button>
  );

  // ── 견주는 중 ── 부위별로 하나씩 채우지 않는다. 얼마나 걸리는지 적어 둔다 — 안 적으면 멈춘 줄 안다
  if (phase.k === "wait") {
    return (
      <section className="screen">
        <div className="coach">
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <p>
            예상 메이크업과 견줘서 어디를 다시 보면 좋을지 알려드릴게요
            <i aria-hidden="true" />
          </p>
        </div>
        <h1 className="title">
          <em>피드백</em>
        </h1>
        <p className="sub">점수 없이, 어디가 잘 맞고 어디를 다듬으면 되는지만 보여줘요</p>

        <div className="slot-answer-loading">
          <span aria-hidden="true" />
          <strong>찍은 사진을 보고 있어요</strong>
          <p>예상 메이크업과 견주는 중이에요. 잠시만 기다려 주세요.</p>
        </div>
      </section>
    );
  }

  // ── 못 견줬다 ── 흐름은 막지 않는다. 본보기 문장으로 떨어지되 **왜 견준 결과가 아닌지**를 같이 적는다
  if (phase.k === "cannot") {
    return (
      <section className="screen">
        <div className="coach">
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <p>
            아직 견줄 것이 없어요
            <i aria-hidden="true" />
          </p>
        </div>
        <h1 className="title">
          <em>피드백</em>
        </h1>
        <p className="sub">조금만 더 준비하면 바로 보여드릴게요</p>

        {/* 견준 사진이 없으니 고른 화장 한 장만 — 빈 칸을 남기면 안 불러온 것으로 보인다 */}
        <div className="fb-photos one">
          <figure>
            <img src={template.thumb} alt={`${template.name} 화장 참고 사진`} />
            <figcaption>고른 화장</figcaption>
          </figure>
        </div>

        <div className="fb-lines">
          {SAME.map(({ part, say }) => (
            <div className="fb-line is-ok" key={part}>
              <div className="fb-head">
                <strong>{PART_NAME[part]}</strong>
                <em>{TONE_LABEL.ok}</em>
              </div>
              <p className="fb-say">{say(colors[part].name.text)}</p>
            </div>
          ))}
          {AGAIN.map(({ part, say }) => (
            <div className="fb-line is-fix" key={part}>
              <div className="fb-head">
                <strong>{PART_NAME[part]}</strong>
                <em>{TONE_LABEL.fix}</em>
              </div>
              <p className="fb-say">{say(colors[part].name.text)}</p>
            </div>
          ))}
        </div>

        {/* 견준 적이 없다는 것을 밝힌다 — 안 적으면 내 화장을 보고 쓴 말로 읽힌다 */}
        <p className="fb-note">
          {MISSING_TEXT[phase.why] ?? "지금은 피드백을 만들 수 없어요"}. 그래서 위 이야기는 고른 화장을
          기준으로 미리 적어 둔 본보기예요 — 찍은 사진과 견준 결과가 아니에요.
        </p>

        {next}
      </section>
    );
  }

  const v = phase.view, fb = v.feedback;

  // ── 사진 조건이 많이 다르다 ── 판정하지 않는다. 안내 한 줄과 다시 찍으러 가는 길 (본 앱 blocked)
  if (fb.blocked) {
    return (
      <section className="screen">
        <div className="coach">
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <p>
            사진을 한 번만 다시 찍어 주세요
            <i aria-hidden="true" />
          </p>
        </div>
        <h1 className="title">
          <em>다시 찍기</em>
        </h1>
        <p className="sub">처음 찍은 사진과 조건이 많이 달라서 견주기 어려워요</p>

        <Photos view={v} />

        <p className="fb-note">{fb.blocked}</p>

        {/* 본 앱은 이 버튼 하나뿐이다. 다음으로 가는 길을 같이 두는 까닭은 머리글에 적어 뒀다 */}
        {onRetake && (
          <button type="button" className="go ghost" onClick={onRetake}>
            완성사진 다시 찍기
          </button>
        )}
        {next}
      </section>
    );
  }

  // ── 견준 결과 ──
  return (
    <section className="screen">
      <div className="coach">
        <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
        <p>
          예상 메이크업과 견줘서 어디를 다시 보면 좋을지 알려드릴게요
          <i aria-hidden="true" />
        </p>
      </div>

      {/* 제목·설명은 본 앱 `feedbackSlot` 의 글 그대로다 */}
      <h1 className="title">
        <em>피드백</em>
      </h1>
      <p className="sub">점수 없이, 어디가 잘 맞고 어디를 다듬으면 되는지만 보여줘요</p>

      <Photos view={v} />

      {/* 요약 두 줄 — 부위 이름만. 비어 있는 묶음은 안 그린다 (본 앱 `feedbackSummary`) */}
      {(fb.ok.length > 0 || fb.fix.length > 0) && (
        <div className="fb-summary">
          {fb.ok.length > 0 && (
            <div className="fb-sum is-ok">
              <b>비슷한 곳</b>
              <span>{fb.ok.join(" · ")}</span>
            </div>
          )}
          {fb.fix.length > 0 && (
            <div className="fb-sum is-fix">
              <b>다시 볼 곳</b>
              <span>{fb.fix.join(" · ")}</span>
            </div>
          )}
        </div>
      )}

      <div className="fb-lines">
        {fb.parts.map((p) => (
          <Line p={p} key={p.part} />
        ))}
      </div>

      {/*
        이 버전이 **못 잰 것**을 밝힌다. 「이번에는 볼 수 없었어요」 줄은 견준 결과가 아니라
        "넣을 재료가 없어서 안 봤다" 는 뜻이다 — 안 적으면 견주고 나서 괜찮다고 한 말로 읽힌다
      */}
      <p className="fb-side">
        라이너 꼬리와 눈썹 꼬리는 이 버전에서 재지 못해요. 본 앱은 서버가 만든 「옮긴 그림」과
        머리카락 자리를 같이 넣는데 여기는 아직 둘 다 없어요 — 「이번에는 볼 수 없었어요」라고
        적힌 줄은 견준 결과가 아니에요.
      </p>

      {next}
    </section>
  );
}

/**
 * 사진 두 장 — 전체 얼굴. 부위 확대는 없다 (본 앱 `feedbackPhotos` 와 같은 짜임).
 * 왼쪽이 예상 메이크업, 오른쪽이 방금 찍은 내 화장 — 이 두 장을 견줘서 위 문장이 나온 것이다
 */
function Photos({ view }: { view: FeedbackView }) {
  return (
    <div className="fb-photos">
      <figure>
        <img src={view.answerUrl} alt="예상 메이크업" />
        <figcaption>예상 메이크업</figcaption>
      </figure>
      <figure>
        <img src={view.attemptUrl} alt="내 화장" />
        <figcaption>내 화장</figcaption>
      </figure>
    </div>
  );
}
