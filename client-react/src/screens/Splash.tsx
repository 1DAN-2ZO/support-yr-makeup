/**
 * 화면 1 — 스플래시.
 *
 * 본 앱(client/src/main.ts 의 `showSplash`)이 켤 때 띄우는 그림과 움직임을 그대로 옮겼다 —
 * 들어올 때 `splash-in`(520ms), 나갈 때 `splash-out`(280ms).
 *
 * **머무는 시간만 다르다.** 본 앱은 모델·카메라를 준비하는 동안 최소 3초를 띄우는데,
 * 이 버전은 준비할 것이 없어서 2초만 둔다. 그래도 기다리기 싫은 사람이 있으니
 * **누르면 바로 넘어간다.**
 *
 * 나가는 동안(0.28초)을 기다렸다가 다음 화면으로 넘긴다. 애니메이션 도중에 빼 버리면
 * 그림이 깜빡 사라져서 잘못 눌린 것처럼 보인다.
 */

import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n/useLang";

/** 가만히 둘 때 머무는 시간 */
const STAY_MS = 2000;
/** 나가는 애니메이션 길이 — app.css 의 `splash-out` 과 같은 값이어야 한다 */
const LEAVE_MS = 280;

export default function Splash({ onDone }: { onDone: () => void }) {
  const { t } = useLang();
  const [leaving, setLeaving] = useState(false);
  // App 이 다시 그릴 때마다 `onDone` 은 새 함수가 된다 — 그대로 효과에 넣으면 타이머가 처음부터 다시 돈다
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  // 2초 뒤 저절로 나가기 시작한다. 그 전에 눌렸으면 `leaving` 이 이미 참이라 아무 일도 없다
  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), STAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => done.current(), LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  return (
    /* 화면 전체가 버튼이다 — "어디를 눌러야 넘어가는지" 를 따로 알려 주지 않아도 된다 */
    <button
      type="button"
      className={leaving ? "splash leaving" : "splash"}
      aria-label={t("splash.aria")}
      onClick={() => setLeaving(true)}
    >
      <span className="splash-frame">
        {/* 이름은 그림 안에 그려져 있고, 한 줄 소개만 글자로 얹는다.
            원래 그림에는 "내 얼굴에 맞는 메이크업 가이드" 가 박혀 있었는데 이 버전은 얼굴을
            보지 않아 사실이 아니었다. 그림에서 그 글씨를 지우고 여기에 글자로 넣었다 —
            글자로 두면 문구를 고칠 때 그림을 다시 만들지 않아도 되고, 화면 읽어 주는 기능에도 읽힌다 */}
        <img src="/ui/nudy-splash.webp" alt="" aria-hidden="true" />
        <span className="splash-tag">{t("splash.tagline")}</span>
      </span>
    </button>
  );
}
