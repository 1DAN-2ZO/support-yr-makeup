/**
 * 화면 8 — 저장 · 끝내기.
 *
 * 본 앱 `client/src/screens/flow-slots.ts` 의 `saveSlot` 자리다. 본 앱은 예상 메이크업·
 * 완성사진·피드백을 한 장으로 만들어 폰에 저장하고, 그 다음 끝 화면에서 "다 지웠어요" 를
 * 알려 준다 (이 버전의 끝 화면은 `screens/Done.tsx`).
 *
 * 고른 템플릿·부위별 색·추천 제품을 **한 장에 모아 보여 준다** — 본 앱의 "오늘의 화장 기록"
 * 이 그 자리다. "다 지웠어요" 는 빼 뒀다: 이 버전은 폰에도 서버에도 아무것도 남기지 않아서
 * 지울 것이 없다 (사진은 메모리에만 들고 있다가 「다시 하기」 때 그대로 사라진다).
 *
 * ── 「결과 저장」이 붙었다 (2026-10-14) ──
 *
 * 본 앱 `saveSlot` 의 "저장하기" 자리다. 예상 메이크업 · 완성사진 · 피드백을 **한 장으로 만들어**
 * 폰에 내려받는다. 그리는 것은 본 앱 것 그대로다 (`lib/feedback-card` 의 `prepareSave` — 본 앱
 * `screens/feedback-card.ts` 를 가져오기 경로만 고쳐 옮겼다). 이 화면이 하는 일은 **재료가 되는지
 * 가리고, 버튼을 걸고, 눌린 뒤 무슨 일이 일어났는지 한 줄로 말하는 것**뿐이다.
 *
 * 본 앱과 다른 곳 둘 —
 *  1. **누른 뒤에 만든다.** 본 앱은 화면에 들어설 때 미리 그려 둔다 (iOS 가 "누른 그 순간" 에만
 *     공유 창을 열어 주니까). 이 버전은 **안 누르고 끝내는 사람이 훨씬 많아서**, 들어설 때마다
 *     1080×수천 짜리 캔버스를 그려 두면 그 값을 거의 다 버리게 된다. 그 대신 iOS 에서는 누른 때와
 *     `share()` 사이에 그리는 시간이 끼어 공유 창이 안 열릴 수 있는데, 그때는 본 앱 `saveCard` 가
 *     **내려받기로 떨어진다** (사용자가 창을 닫은 AbortError 만 "취소" 로 보고 나머지는 내려받는다).
 *     만든 한 장은 아래 `made` 가 들고 있어서 **두 번 눌러도 두 번 그리지 않는다.**
 *  2. **미리보기 그림을 안 그린다.** 본 앱은 만들어 둔 한 장을 화면에 띄워 보여 주는데, 그러려면
 *     사진 주소(objectURL)를 화면이 들고 있어야 한다. 이 레포는 그 주소를 놓는 자리를 App 의
 *     `clear()` 한 곳에 모으는 규칙이라, 화면이 따로 들기 시작하면 놓는 자리가 둘이 된다.
 *     내려받기는 주소를 만들어 그 자리에서 바로 놓으므로(`lib/result-card` 의 `anchorDownload`)
 *     화면이 들고 있을 것이 없다.
 *
 * 재료가 모자라면(맨얼굴 · 예상 메이크업 · 완성사진 없음 · 판정이 막힘 · 문장이 없음) **버튼을
 * 아예 안 그리고** 왜 못 만드는지 한 줄만 적는다 — 눌리지 않는 빈 버튼을 두지 않는 것이 이 레포
 * 규칙이다 (설문 모달 · 부위 가이드가 같다). 값을 지어내지 않는 것도 같다: 못 만들면 못 만들었다고 적는다.
 *
 * ── 본 앱과 모양을 맞춘 것 (2026-10-14) ──
 *
 * 코치 말풍선 · 제목 묶음 · 카드 모양(`.slot-save-card`)을 본 앱 `saveSlot` 에 맞췄다.
 * 제목은 본 앱의 「저장 · 공유」를 못 쓴다 — 저장도 공유도 안 하니 거짓이 된다. 본 앱 카드
 * 안의 글("오늘의 화장 기록")이 이 화면이 하는 일 그대로라 그것을 제목으로 올렸다.
 * 말풍선도 본 앱의 "결과를 저장한 뒤 세션 사진은 기기에서 지울게요" 는 못 쓴다 (지울 것이 없다).
 *
 * ── 2026-10-14 ──
 *
 * 아래 버튼을 본 앱과 같게 **「끝내기」 하나**로 바꿨다 (본 앱 `saveSlot`). 전에는 「이전」과
 * 「처음부터 다시」 둘이었는데, 「처음부터 다시」가 곧바로 동의 화면으로 가서 **본 앱의 마지막
 * 한 칸(끝 화면)을 건너뛰었다.** 이제 본 앱 차례대로 `save → done` 으로 간다.
 * 「이전」은 맨 위 로고 줄의 화살표가 맡는다 (App.tsx `LogoRow`).
 *
 * 머리글 첫 줄의 "본 앱 마지막 두 화면을 하나로 합쳤다" 는 이제 맞지 않는다 — 끝 화면은
 * `screens/Done.tsx` 로 따로 있다.
 */

import type { PartColors } from "../api";
import { PART_NAME, PART_ORDER } from "../parts";
import { pickProducts } from "@core/product-picks";
import { useEffect, useRef, useState } from "react";
import type { MakeupTemplate } from "@core/templates";
import { prepareSave, SAVE_TEXT, SHARE_HINT, type SaveKit, type SaveSource } from "../lib/feedback-card";
import { useLang } from "../i18n/useLang";
import { colorText, hueText, productText } from "../lib/core-text";
import type { Key } from "../i18n";
import type { FeedbackLoad } from "../lib/feedback-source";
import { surveyLink } from "../survey-link";
import Survey from "./Survey";
import "../save.css";

/**
 * 한 장으로 **못 만드는 까닭** — 사람 말로. 열쇠 다섯은 `core/feedback-run` 의 `FeedbackMissing`
 * 넷에 이 화면이 가리는 둘(`blocked` · `empty`)과 피드백을 아예 안 거친 `none` 을 더한 것이다.
 *
 * 본 앱은 이 자리에 "이번에는 저장할 결과가 없어요" 한 줄만 적는데(`flow-slots.ts` 의 `none()`),
 * 여기는 **무엇이 없어서인지**까지 적는다 — 피드백 화면이 같은 방식으로 까닭을 밝히고 있어서
 * (`Feedback.tsx` 의 `MISSING_TEXT`) 두 화면이 같은 말을 하게 둔다
 */
const WHY_TEXT: Record<string, Key> = {
  bare: "save.why.bare",
  answer: "save.why.answer",
  answer_size: "save.why.answer_size",
  attempt: "save.why.attempt",
  /* 판정이 막힌 것(본 앱 blocked) — 문장이 없으니 한 장에 넣을 것도 없다 */
  blocked: "save.why.blocked",
  empty: "save.why.empty",
  none: "save.why.none",
  error: "save.why.error",
};

/** 「결과 저장」을 그릴 수 있는지 — 들어설 때 한 번 가린다 (여기서 그리지는 않는다) */
type Ready =
  | { k: "wait" }
  | { k: "can"; src: SaveSource }
  | { k: "no"; why: string };

export default function Save({
  template,
  colors,
  getFeedback,
  onDone,
}: {
  template: MakeupTemplate;
  colors: PartColors;
  /**
   * 견준 결과 받아 오기 — **피드백 화면이 받는 것과 같은 보관함**이다 (App 의 `createFeedbackKeeper`).
   * 같은 것을 받으므로 이 화면에 와서 다시 채점하지 않는다. 안 주면 「결과 저장」을 안 그리고
   * 까닭(`none`)만 적는다
   */
  getFeedback?: () => Promise<FeedbackLoad>;
  /** 「끝내기」 — 끝 화면으로 (본 앱 `saveSlot` 의 `finish()` → `ctx.go("done")`) */
  onDone: () => void;
}) {
  /*
   * 「끝내기」를 누르면 **먼저 후기 설문을 묻고** 닫은 뒤에 끝 화면으로 간다 (배포본
   * survey-modal.ts 와 같은 자리·같은 차례). 끝내기를 누른 순간이 서비스를 막 다 쓴
   * 때라 그때 묻는 것이 가장 잘 답해 준다.
   *
   * 주소는 화면을 그리는 동안 한 번만 읽는다 — 같은 창에서는 세션 번호가 안 바뀌고,
   * 다시 읽어 봐야 같은 주소다. 주소가 없으면(설문을 꺼 뒀으면) 모달을 아예 안 띄우고
   * 곧바로 끝 화면으로 간다 — 눌리지 않는 빈 창을 보여 주지 않는다
   */
  const { lang, t } = useLang();
  const [survey] = useState<string | null>(() => surveyLink());
  const [asking, setAsking] = useState(false);

  /** 「결과 저장」을 그릴 수 있는지. 처음에는 "가리는 중" — 보관함이 바로 답해 주면 한 번 깜빡이고 끝난다 */
  const [ready, setReady] = useState<Ready>(() => (getFeedback ? { k: "wait" } : { k: "no", why: "none" }));
  /** 눌린 뒤 무슨 일이 일어났는지 한 줄 (배포본 `.save-msg`). 비어 있으면 줄 자체를 안 그린다 */
  const [msg, setMsg] = useState("");
  /** 지금 만들거나 내보내는 중 — 버튼을 잠근다 */
  const [busy, setBusy] = useState(false);

  /**
   * 만들어 둔 한 장. **약속(Promise)째로 들고 있는다** — 다 되기 전에 또 눌려도 같은 약속을 받아
   * 가므로 두 번 그리지 않는다. 상태가 아니라 ref 인 까닭은 이 값으로 **그리는 것이 없어서**다
   * (화면에 보이는 것은 위의 `msg` 뿐이다). 상태에 넣으면 사진 한 장을 담은 채 화면을 한 번 더 그린다
   */
  const made = useRef<Promise<SaveKit | null> | null>(null);

  /*
   * 들어서면 **재료가 되는지만** 한 번 묻는다. 보관함이 들고 있는 것을 받는 것이라
   * (App 의 `createFeedbackKeeper`) 개발 모드(StrictMode)에서 효과가 두 번 돌아도 같은 약속을
   * 두 번 받을 뿐 채점은 한 번만 돈다 — 피드백 화면이 푼 방식과 같다.
   *
   * **여기서 한 장을 그리지는 않는다.** 그리는 것은 누를 때다 (머리글 1번)
   */
  useEffect(() => {
    if (!getFeedback) return;
    let alive = true;
    void getFeedback()
      .then((r) => {
        if (!alive) return;
        if (!r.ok) return setReady({ k: "no", why: r.missing });
        const fb = r.view.feedback;
        // 본 앱 `prepareSave` 가 null 을 주는 조건과 같다 (`lib/feedback-card`) — 여기서 먼저 가려야
        // 눌러 봐야 아무 일도 안 일어나는 버튼을 안 그린다
        if (fb.blocked) return setReady({ k: "no", why: "blocked" });
        if (!fb.parts.length) return setReady({ k: "no", why: "empty" });
        setReady({ k: "can", src: { feedback: fb, answer: r.view.answer, attempt: r.view.attempt } });
      })
      .catch(() => { if (alive) setReady({ k: "no", why: "error" }); });
    return () => { alive = false; };
  }, [getFeedback]);

  /**
   * 「결과 저장」. 한 장을 만들고(처음 눌렀을 때만) 공유 창 또는 내려받기로 내보낸다.
   * 결과는 본 앱 글 그대로 말한다 (`SAVE_TEXT` · `SHARE_HINT`)
   */
  const makeAndSave = (src: SaveSource): void => {
    if (busy) return;
    setBusy(true);
    // 몇 초 걸릴 수 있다 — 아무 말이 없으면 안 눌린 줄 안다
    setMsg(t("save.making"));
    made.current ??= prepareSave(src);
    void made.current
      .then((kit) => {
        // 캔버스를 못 쓰는 브라우저. 지어내지 않고 못 만들었다고 적는다
        if (!kit?.card) return setMsg(t(SAVE_TEXT.unavailable));
        // 공유 창이 열리는 기기에서는 거기서 "이미지 저장" 을 눌러야 사진에 들어간다 — 열리기 직전에 알린다
        if (kit.usesShareSheet) setMsg(t(SHARE_HINT));
        return kit.save().then((outcome) => setMsg(t(SAVE_TEXT[outcome])));
      })
      .catch(() => setMsg(t(SAVE_TEXT.unavailable)))
      .finally(() => setBusy(false));
  };

  return (
    <section className="screen">
      <div className="coach">
        <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
        <p>
          {t("save.coach")}
          <i aria-hidden="true" />
        </p>
      </div>

      <h1 className="title">
        <em>{t("save.titleEm")}</em>
        {t("save.titleRest")}
      </h1>
      <p className="sub">{t("save.sub")}</p>

      <div className="slot-save-card">
        <div>
          <strong>{template.name}</strong>
          <p>{template.about}</p>
        </div>
        {/* 본 앱은 이 자리에 색이 번지는 네모를 두는데, 여기에는 보여 줄 그림이 실제로 있다 */}
        <img src={template.thumb} alt="" aria-hidden="true" />
      </div>

      <ul className="save-list">
        {PART_ORDER.map((part) => {
          const color = colors[part];
          /*
           * 부위마다 **하나씩만** 건다. 부위 가이드는 둘을 보여 주지만(고를 여지를 주려고)
           * 여기는 한 장으로 모아 보는 자리라 열 줄이 되면 "모았다" 가 아니라 목록이 된다.
           * 고르는 방식은 부위 가이드와 같다 — 보이는 색과 피부를 걷어낸 색, 두 계열을 다 넣는다
           */
          const families = [...new Set([color.name.base, color.product.name.base])];
          const top = pickProducts(part, families, 1)[0];
          return (
            <li key={part}>
              {/* 동그라미는 거드는 것이고 이름이 본문이다 — 색만으로 줄을 가르지 않는다 */}
              <span className="dot" style={{ background: color.hex }} aria-hidden="true" />
              <span className="save-text">
                <strong>
                  {t(PART_NAME[part])} · {colorText(t, color.name)}
                </strong>
                {/* 제품을 못 찾은 부위도 있다 — 줄을 비우면 "안 불러온 건가" 로 읽힌다 */}
                <em>
                  {top
                    ? `${productText(lang, top.pick).brand} ${productText(lang, top.pick).name} · ${t("guide.family", { name: hueText(t, top.family) })}`
                    : t("save.noProduct")}
                </em>
              </span>
            </li>
          );
        })}
      </ul>

      {/*
        「결과 저장」 — 본 앱 `saveSlot` 이 "끝내기" 위에 끼우는 것과 같은 자리다.
        가리는 중에는 아무것도 안 그린다 (보관함이 바로 답해 주면 보이지도 않는다).
        못 만들 때는 **버튼 대신 까닭 한 줄**만 둔다
      */}
      {ready.k === "can" && (
        <>
          <p className="save-ask">{t("save.ask")}</p>
          <button type="button" className="go ghost" onClick={() => makeAndSave(ready.src)} disabled={busy}>
            {t("save.do")}
          </button>
        </>
      )}
      {ready.k === "no" && <p className="save-why">{t(WHY_TEXT[ready.why] ?? "save.why.unknown")}</p>}

      {/* 눌린 뒤에만 글이 찬다 — 빈 동안에는 `.save-msg:empty` 가 줄을 접는다 */}
      <p className="save-msg" role="status">
        {msg}
      </p>

      {/*
        아래에는 큰 버튼 하나만 — 본 앱 `saveSlot` 과 같은 글(「끝내기」)·같은 자리다.
        뒤로 가는 길은 맨 위 로고 줄의 화살표(→ 피드백)이고, 처음으로 돌아가는 길은 다음 화면(끝)에 둔다
      */}
      <button type="button" className="go" onClick={() => (survey ? setAsking(true) : onDone())}>
        {t("save.finish")}
      </button>

      {/* 어느 버튼으로 닫았든 끝 화면으로 한 번만 간다 — 이 화면에 갇히면 안 된다 */}
      {asking && survey && <Survey url={survey} onClose={onDone} />}
    </section>
  );
}
