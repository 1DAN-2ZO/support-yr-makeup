/**
 * [개발 전용] 완성사진 화면만 혼자 띄워 보는 임시 페이지 (`attempt-probe.html`).
 *
 * 흐름에 끼우는 일(App.tsx 에 자리 만들기)은 다른 사람 몫이라, 확인은 여기서 한다.
 * `npm run build` 에는 들어가지 않는다 (vite 는 index.html 하나만 묶는다).
 * 재는 방식은 촬영 화면의 `capture-probe.tsx` 와 **같게** 맞췄다 — 두 화면의 숫자를 견줄 수 있어야 한다.
 *
 * 여기서 재는 것 — 추측이 아니라 숫자로:
 *  1. **카메라가 확실히 꺼지는가.** `getUserMedia` 를 감싸서 지금까지 열린 트랙을 전부 들고 있다가
 *     `readyState` 를 센다. "live" 가 0 이어야 꺼진 것이다. 들어갔다 나오기를 세 번 해 본다.
 *  2. **루프가 하나만 도는가.** `liveFrameLoops()` 로 지금 돌고 있는 수를 그대로 읽는다.
 *
 * **StrictMode 를 그대로 켠다.** 끄면 두 번 실행 문제가 숨어서 여기서 확인하는 의미가 없어진다.
 */

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Attempt, { type AttemptShots } from "./screens/Attempt";
import { liveFrameLoops } from "./hooks/useFrameLoop";
import "./app.css";

/** 지금까지 `getUserMedia` 가 내준 트랙 전부. 끊긴 것도 버리지 않는다 — 꺼졌는지 세려면 남아 있어야 한다 */
const tracks: MediaStreamTrack[] = [];

function watchCamera(): void {
  const md = navigator.mediaDevices;
  const real = md.getUserMedia.bind(md);
  md.getUserMedia = async (c?: MediaStreamConstraints) => {
    const s = await real(c);
    tracks.push(...s.getTracks());
    return s;
  };
}
watchCamera();

function counts(): { live: number; ended: number; loops: number } {
  return {
    live: tracks.filter((t) => t.readyState === "live").length,
    ended: tracks.filter((t) => t.readyState === "ended").length,
    loops: liveFrameLoops(),
  };
}

function Probe() {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [stat, setStat] = useState(counts);
  const [result, setResult] = useState<string | null>(null);

  // 0.3초마다 다시 센다. 이 숫자가 화면에 그대로 뜨니 눈으로도 보이고 콘솔로도 읽을 수 있다
  useEffect(() => {
    const id = setInterval(() => setStat(counts()), 300);
    return () => clearInterval(id);
  }, []);

  // 자동 검사가 읽을 자리 — 브라우저에서 window.__attemptProbe 로 꺼내 본다
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__attemptProbe = { counts, open, round };
  }, [open, round]);

  return (
    <div className="app">
      <header className="brand">완성사진 화면 임시 페이지</header>

      <p className="sub">
        들어갔다 나오기 {round}번 · 열린 트랙 {stat.live} · 꺼진 트랙 {stat.ended} · 도는 루프 {stat.loops}
      </p>

      <div className="row">
        <button
          type="button"
          className={open ? "go ghost" : "go"}
          onClick={() => {
            if (!open) setRound((n) => n + 1);
            setOpen(!open);
          }}
        >
          {open ? "나가기 (카메라 꺼짐)" : "완성사진 화면 들어가기"}
        </button>
      </div>

      {result && <p className="notice card">{result}</p>}

      {open && (
        <Attempt
          onDone={(shots: AttemptShots) => {
            const list = shots.front_open;
            const kb = Math.round((list[0]?.blob.size ?? 0) / 1024);
            setResult(`넘겼어요 — 묶음 ${list.length}장 · 셔터 장 ${list[0]?.w ?? 0}×${list[0]?.h ?? 0} · ${kb}KB · 얼굴 점 ${list[0]?.lm.length ?? 0}개`);
            setOpen(false);
          }}
          onBack={() => setOpen(false)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Probe />
  </StrictMode>,
);
