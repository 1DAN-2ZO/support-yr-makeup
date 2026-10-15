/**
 * 참고 사진 올리기 — 본 앱 `screens/flow-slots.ts` 의 `slotScreen`("참고 사진 · 예상 메이크업")
 * 앞부분(`renderUpload`)이다.
 *
 * 따라 하고 싶은 화장 사진을 고르면 **이 폰 안에서** 얼굴 점을 찍고 부위별 색을 읽는다
 * (`lib/ref-analyze` → `core/ref-colors`). 사진은 색을 읽는 동안에도 어디로도 안 나간다 —
 * 서버로 보내는 일은 다음 화면(`Answer.tsx`)이 맡는다.
 *
 * ── 본 앱과 갈라 둔 것 ──
 *
 * 본 앱은 올리기 · 만드는 중 · 완성을 **한 화면**에서 다시 그린다. 이 버전은 올리기(여기)와
 * 정답사진(`Answer.tsx`)을 두 화면으로 갈랐다 — React 는 "지금 어느 상태인가" 를 화면 단위로
 * 들고 있는 편이 읽기 쉽고, App.tsx 의 앞뒤로 오가는 길(`FLOW`)에도 그대로 얹힌다.
 * 대신 **갈라지는 지점은 본 앱과 같다**: 사진에서 얼굴을 못 찾으면 서버를 부르지 않고
 * 여기 머물러 까닭만 말한다 (본 앱 `run()` 의 앞부분과 같다).
 *
 * 기다리는 동안의 말도 본 앱 것을 그대로 쓰지 못한다. 본 앱은 색 읽기와 서버 부르기를 한 칸에서
 * 하니까 "예상 메이크업을 만들고 있어요" 한 줄로 덮을 수 있지만, 여기서 도는 것은 색 읽기뿐이다 —
 * 서버를 아직 안 불렀는데 만들고 있다고 적으면 거짓이 된다.
 *
 * 「템플릿 선택」으로 가는 길은 본 앱과 같은 자리다 (`orLine("또는")` 아래, #420) — 올릴 사진이
 * 없는 사람도 시작할 수 있게. 고르는 화면은 따로 있다 (`Templates.tsx`).
 */

import { useEffect, useRef, useState } from "react";
import { analyzeRefPhoto, REF_FAIL_TEXT, type RefAnalysis } from "../lib/ref-analyze";

export interface UploadProps {
  /** 색을 다 읽었을 때 — 읽은 것과 보낼 사진을 넘긴다 (보내는 일은 다음 화면이 한다) */
  onDone: (found: RefAnalysis, photo: File) => void;
  /** 「템플릿 선택」 — 사진 없이 시작하는 다른 길 */
  onTemplates: () => void;
}

export default function Upload({ onDone, onTemplates }: UploadProps) {
  const [picked, setPicked] = useState<File | null>(null);
  /** 고른 사진의 미리보기 주소. 바꿀 때마다 앞의 것을 놓는다 (안 놓으면 고를수록 쌓인다) */
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  /** 못 읽은 까닭 한 줄 — 비어 있으면 안 그린다 */
  const [warn, setWarn] = useState<string | null>(null);

  /** 색 읽기는 1~2초 걸린다. 그 사이에 화면을 떠났으면 결과를 쓰지 않는다 (본 앱 `alive`) */
  const alive = useRef(true);
  // 켜는 줄(`= true`)이 꼭 있어야 한다 — StrictMode 는 효과를 "켜기 → 끄기 → 켜기" 로 돌리는데,
  // 끄기만 적어 두면 두 번째 켜기에서 꺼진 채로 남아 **색을 다 읽고도 화면이 안 넘어간다**
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // 미리보기 주소는 화면을 떠날 때도 놓아야 한다 — 고른 사진이 메모리에 남지 않게
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (file: File): void => {
    setPicked(file);
    setPreview(URL.createObjectURL(file));
    setWarn(null);
  };

  /** 「적용하기」 — 이 폰에서 색을 읽는다. 못 읽으면 까닭만 말하고 여기 머문다 */
  const apply = async (): Promise<void> => {
    if (!picked) return;
    setReading(true);
    setWarn(null);
    let found: RefAnalysis | string;
    try {
      found = await analyzeRefPhoto(picked);
    } catch {
      // 무엇이 틀렸는지(모델을 못 받았다·캔버스가 없다)는 사용자가 어쩔 수 있는 일이 아니다.
      // 본 앱도 던진 것을 "사진을 읽지 못했어요"(noCanvas) 로 몰아 둔다
      found = "noCanvas";
    }
    if (!alive.current) return;
    setReading(false);
    if (typeof found === "string") {
      setWarn(REF_FAIL_TEXT[found as keyof typeof REF_FAIL_TEXT]);
      return;
    }
    onDone(found, picked);
  };

  if (reading) {
    return (
      <section className="screen">
        <h1 className="title">
          <em>사진에서 화장 색</em>을 읽고 있어요
        </h1>
        <p className="sub">얼굴 자리를 찾아 부위별로 어떤 색을 썼는지 재는 중이에요</p>
        <div className="slot-answer-loading">
          <span aria-hidden="true" />
          <strong>사진을 읽고 있어요</strong>
          <p>올린 사진은 이 폰에서만 봐요. 아직 아무 데도 보내지 않았어요.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen">
      <div className="coach">
        <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
        <p>
          따라 하고 싶은 화장 사진을 먼저 올려 주세요
          <i aria-hidden="true" />
        </p>
      </div>

      <h1 className="title">
        <em>참고 사진</em> · 예상 메이크업
      </h1>
      <p className="sub">참고 사진을 올리면 예상 메이크업을 만들어드릴게요</p>

      {/*
        칸 전체가 label 이라 아무 데나 눌러도 사진 고르는 창이 열린다 (본 앱 `uploadCard`).
        고르는 것만으로는 아무 일도 안 일어난다 — 「적용하기」를 눌러야 색을 읽는다
      */}
      <label className="slot-upload">
        <div className={`slot-upload-main${preview ? " has-photo" : ""}`}>
          {preview ? (
            <>
              <img src={preview} alt="올린 참고 사진" />
              <b>다른 사진으로 바꾸기</b>
            </>
          ) : (
            <>
              <span aria-hidden="true">
                <img src="/ui/icon-camera-start.svg" alt="" />
              </span>
              <strong>참고 사진 업로드</strong>
              <em>정면 사진이면 가장 좋아요</em>
            </>
          )}
        </div>
        <input
          type="file"
          accept="image/*"
          className="slot-upload-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
            // 같은 사진을 다시 고를 수도 있다 — 칸을 비워 두지 않으면 change 가 두 번째엔 안 온다
            e.target.value = "";
          }}
        />
      </label>

      {/* 사진이 없어도 시작할 수 있는 다른 길 (본 앱 #420) — 고르는 화면은 따로 있다 */}
      <div className="slot-or">
        <span>또는</span>
      </div>
      <button type="button" className="go ghost" onClick={onTemplates}>
        템플릿 선택
      </button>

      {/* 못 읽은 까닭 — 흐름을 막지 않는다. 다른 사진을 고르거나 템플릿으로 갈 수 있다 */}
      {warn && (
        <p className="slot-upload-warn" role="status">
          {warn}
        </p>
      )}

      <button type="button" className="go" disabled={!picked} onClick={() => void apply()}>
        적용하기
      </button>
    </section>
  );
}
