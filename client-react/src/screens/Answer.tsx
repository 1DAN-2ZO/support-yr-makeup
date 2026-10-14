/**
 * 정답사진(예상 메이크업) — 본 앱 `screens/flow-slots.ts` 의 `slotScreen` 뒷부분
 * (`renderLoading` · `renderAnswer`) 자리다.
 *
 * 맨얼굴과 참고 사진(또는 템플릿 번호)을 **백엔드 `POST /transfer`** 로 보내면 화장을 입힌
 * 내 얼굴이 한 장 온다 (`core/transfer-client`). 보내는 코드는 `src/api.ts` 의 `makeAnswerPicture`
 * 하나이고, **서버 주소도 거기 한 줄에서만** 정한다 (`API_BASE`).
 *
 * ── 서버가 아직 안 붙었을 때 ──
 *
 * 주소가 비어 있으면 **서버를 부르지 않고** 올린 참고 사진을 그대로 보여 준다. 본 앱도 그렇게
 * 돈다 — `slotScreen` 에 `makeAnswer` 를 안 주면 색만 읽고 참고 사진을 보여 준다 (ui-preview).
 * 다른 것은 **왜 그림이 없는지 글로 말해 준다**는 점뿐이다. 색은 이미 다 읽었으니 다음 화면들
 * (색조 팔레트 · 부위 가이드)은 그대로 돈다 — 그림 한 장이 없다고 흐름을 막지 않는다.
 *
 * ── 상태 네 가지 (본 앱 `answer-make.ts` 가 가른 그대로) ──
 *
 *   보내는 중  올린 사진을 올릴 크기로 줄이는 동안 (`shrinkForUpload`). 템플릿은 이 칸을 건너뛴다 —
 *             보낼 것이 번호 하나라 줄일 사진이 없다
 *   만드는 중  서버가 그리는 동안. 한 장에 8~9초, 줄을 서면 1분 가까이 (`MAKE_WAIT_TEXT`)
 *   완성      받은 그림을 보여 주고 다음으로
 *   실패      까닭을 사람 말로 적고 (`makeFailText`) 「다시 시도」와 **「그냥 화장 가이드 보기」**를 함께 둔다
 *
 * **두 번 보내지 않는다.** 들어올 때 한 번만 보낸다 (`sent`) — React 의 StrictMode 는 개발 중에
 * 효과(useEffect)를 두 번 돌리는데, 막아 두지 않으면 GPU 가 같은 그림을 두 번 그린다.
 * 「다시 시도」로 다시 보내는 것은 사람이 누른 것이라 막지 않는다 (본 앱 `picture-maker` 와 같은 갈래).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { hasAnswerServer, makeAnswerPicture } from "../api";
import type { TransferRef } from "../core/transfer-client";
import { MAKE_WAIT_TEXT, makeFailText, shrinkForUpload } from "../lib/answer-make";

/** 지금 어느 칸인가 — 위 머리글의 네 가지 */
type Phase = "sending" | "making" | "done" | "failed";

export interface AnswerProps {
  /** 서버로 보낼 화장 출처 — 올린 사진이면 그 파일, 템플릿이면 번호 (본 앱 `TransferRef`) */
  source: { photo: File } | { template: number };
  /** 화면에 보여 줄 참고 사진 — 올린 사진의 줄인 미리보기, 또는 템플릿 썸네일 */
  preview: string;
  /** 참고 사진에서 다섯 부위 중 몇 개의 색을 읽었나. 템플릿은 늘 다섯이다 */
  read: number;
  /** 맨얼굴 — 촬영(`Capture`)이 내놓은 것. 없으면 서버를 부르지 않는다 (까닭 `no_bare`) */
  bare: Blob | null;
  /**
   * 이미 만들어 둔 정답사진 주소 (App 이 들고 있다). 있으면 **다시 안 보낸다** —
   * 색조 팔레트에서 뒤로 눌러 돌아왔을 때 GPU 가 같은 그림을 또 그리지 않게
   */
  made: string | null;
  /** 그림이 왔을 때. 주소를 만들고 놓는 일은 받는 쪽(App)이 한다 — 뒤 화면들도 같은 주소를 쓴다 */
  onMade: (picture: Blob) => void;
  /** 「다음 · 화장 가이드 보기」 — 그림이 없어도 갈 수 있다 */
  onNext: () => void;
}

export default function Answer({ source, preview, read, bare, made, onMade, onNext }: AnswerProps) {
  /**
   * 들어올 때 설 칸 — 이미 그림이 있거나 서버 주소가 비어 있으면 부르지 않고 바로 "완성" 이다
   * (주소가 없을 때 참고 사진을 그대로 보여 주는 것은 본 앱과 같다)
   */
  const [phase, setPhase] = useState<Phase>(made || !hasAnswerServer ? "done" : "sending");
  const [failText, setFailText] = useState<string | null>(null);

  /** 보내는 사이에 화면을 떠났으면 결과를 쓰지 않는다 (본 앱 `alive`) */
  const alive = useRef(true);
  // 켜는 줄(`= true`)이 꼭 있어야 한다 — StrictMode 는 효과를 "켜기 → 끄기 → 켜기" 로 돌리는데,
  // 끄기만 적어 두면 두 번째 켜기에서 꺼진 채로 남아 **색을 다 읽고도 화면이 안 넘어간다**
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /** 들어올 때 한 번만 — StrictMode 가 효과를 두 번 돌려도 서버는 한 번만 부른다 */
  const sent = useRef(false);

  const send = useCallback(async (): Promise<void> => {
    setFailText(null);
    let ref: TransferRef;
    if ("template" in source) {
      // 템플릿은 줄일 사진이 없다 — 서버가 같은 번호의 사진을 들고 있다 (본 앱 `runTemplate`)
      setPhase("making");
      ref = { template: source.template };
    } else {
      setPhase("sending");
      // 줄이지 못하면(구형 브라우저 등) 고른 사진 그대로 — 너무 크면 서버가 too_large 로 답한다
      ref = await shrinkForUpload(source.photo).catch(() => source.photo);
      if (!alive.current) return;
      setPhase("making");
    }
    const r = await makeAnswerPicture(bare, ref);
    if (!alive.current) return;
    if (!r.ok) {
      setFailText(makeFailText(r.why));
      setPhase("failed");
      return;
    }
    setPhase("done");
    onMade(r.picture);
  }, [bare, onMade, source]);

  useEffect(() => {
    if (made || !hasAnswerServer || sent.current) return;
    sent.current = true;
    void send();
  }, [made, send]);

  if (phase === "sending" || phase === "making") {
    return (
      <section className="screen">
        {/*
          제목에서 "nudy" 를 뺐다 (2026-10-14, 전지원).
          맨 위 로고 줄에 이미 `nudy♥` 가 있어 "nudy / nudy AI가…" 로 두 번 읽혔다.
          본 앱도 같은 모양이지만 본 앱은 이 화면에 로고 줄이 없다 — 이 버전은 App 이 늘 그린다.
        */}
        <h1 className="title">
          <em>AI</em>가 예상 메이크업을 만들고 있어요
        </h1>
        <p className="sub">참고 사진의 색감과 위치를 확인하고 있어요</p>
        <div className="slot-answer-loading">
          <span aria-hidden="true" />
          <strong>
            {phase === "sending" ? "참고 사진을 보내고 있어요" : "예상 메이크업을 만들고 있어요"}
          </strong>
          <p>
            {phase === "sending"
              ? "올릴 크기로 사진을 줄이는 중이에요."
              : "참고 사진의 화장을 맨얼굴 사진에 맞춰 정리하는 중이에요."}
          </p>
        </div>
        {/* 얼마나 기다려야 하는지 — 안 적으면 멈춘 줄 알고 화면을 닫는다 (본 앱과 같은 자리) */}
        <p className="slot-status" role="status">
          {MAKE_WAIT_TEXT}
        </p>
      </section>
    );
  }

  if (phase === "failed") {
    return (
      <section className="screen">
        <div className="coach">
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <p>
            예상 메이크업은 못 만들었지만 색은 읽었어요
            <i aria-hidden="true" />
          </p>
        </div>

        <h1 className="title">
          <em>예상 메이크업</em>을 못 만들었어요
        </h1>
        <p className="sub">읽은 색으로 부위별 가이드는 그대로 볼 수 있어요</p>

        {/* 까닭 — 사람이 할 수 있는 일로 적는다 (본 앱 `makeFailText`) */}
        {failText && (
          <p className="slot-upload-warn" role="status">
            {failText}
          </p>
        )}

        {/*
          실패해도 흐름을 막지 않는다 — 「다시 시도」와 「그냥 보기」를 **둘 다** 열어 둔다.
          색은 이 폰에서 이미 읽어 뒀으니 가이드는 그림 없이도 돈다
        */}
        <button type="button" className="go ghost" onClick={() => void send()}>
          다시 시도
        </button>
        <button type="button" className="go" onClick={onNext}>
          그냥 화장 가이드 보기
        </button>
      </section>
    );
  }

  return (
    <section className="screen">
      <div className="coach">
        <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
        <p>
          {made
            ? "예상 메이크업이 완성됐어요. 이제 부위별로 따라 해볼게요"
            : "사진에서 색을 읽었어요. 이제 부위별로 따라 해볼게요"}
          <i aria-hidden="true" />
        </p>
      </div>

      <h1 className="title">
        {made ? (
          <>
            <em>예상 메이크업</em> 완성
          </>
        ) : (
          <>
            <em>참고 사진</em>에서 색을 읽었어요
          </>
        )}
      </h1>
      <p className="sub">
        {made ? "이 사진을 기준으로 화장 가이드가 만들어져요" : "읽은 색을 기준으로 화장 가이드가 만들어져요"}
      </p>

      {/*
        본 앱 `answerPhotoCard`. **그림이 없을 때 참고 사진으로 채우지 않는다** —
        그러면 "이 자리가 정답사진 자리" 라는 것이 안 보이고, 올린 사진이 그대로 떠서
        "만들어진 건가?" 로 읽힌다 (2026-10-14, 전지원이 폰에서 확인).
        서버가 안 붙은 동안에는 **빈 자리**를 그대로 보여 주고, 그 옆에 올린 참고 사진을 작게 둔다.
      */}
      <div className="slot-answer-photo">
        <div className={made ? "slot-answer-photo-frame has-ref" : "slot-answer-photo-frame is-empty"}>
          {made ? (
            <img className="slot-answer-ref" src={made} alt="예상 메이크업" />
          ) : (
            <span className="slot-answer-empty">
              <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
              여기에 예상 메이크업이 나와요
            </span>
          )}
        </div>
        <div className="slot-answer-preview">
          <b>{made ? "예상 메이크업 완성" : "예상 메이크업 자리"}</b>
          <p>
            {read === 5
              ? "다섯 부위의 색을 모두 읽었어요."
              : `다섯 부위 가운데 ${read}개 부위의 색을 읽었어요. 못 읽은 곳은 비슷한 견본 색으로 안내해요.`}
          </p>
        </div>
      </div>

      {/* 올린 참고 사진은 작게 따로 — 정답사진 자리와 섞이지 않게 */}
      {!made && preview && (
        <figure className="slot-answer-src">
          <img src={preview} alt="올린 참고 사진" />
          <figcaption>이 사진에서 색을 읽었어요</figcaption>
        </figure>
      )}

      {/*
        서버가 안 붙어 있을 때만 나오는 줄. 그림이 없는 까닭을 안 적으면 "왜 사진이 그대로인가" 를
        알 수 없다 — 다음으로 가는 길은 그대로 열어 둔다
      */}
      {!hasAnswerServer && (
        <p className="slot-upload-warn" role="status">
          예상 메이크업을 만드는 서버가 아직 안 붙었어요. 지금은 읽은 색으로만 안내해 드려요.
        </p>
      )}

      <button type="button" className="go" onClick={onNext}>
        다음 · 화장 가이드 보기
      </button>
    </section>
  );
}
