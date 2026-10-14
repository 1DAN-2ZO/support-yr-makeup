/**
 * [개발 전용] 실시간 가이드 화면만 혼자 띄워 보는 임시 페이지 (`live-probe.html`).
 *
 * 재는 방식은 촬영(`capture-probe.tsx`)·완성사진(`attempt-probe.tsx`)과 **같게** 맞췄다 —
 * 세 화면의 숫자를 견줄 수 있어야 한다. 실시간 가이드는 **매 프레임 캔버스에 그리는 화면**이라
 * 루프가 두 겹이 되면 바로 느려진다 → 여기서 세 가지를 숫자로 본다:
 *
 *  1. **카메라가 확실히 꺼지는가.** `getUserMedia` 를 감싸서 지금까지 열린 트랙을 전부 들고 있다가
 *     `readyState` 를 센다. "live" 가 0 이어야 꺼진 것이다. 들어갔다 나오기를 세 번 해 본다.
 *  2. **루프가 하나만 도는가.** `liveFrameLoops()` 로 지금 돌고 있는 수를 그대로 읽는다.
 *  3. **프레임이 초당 몇 번 도는가.** 루프가 두 겹이면 두 배로 나온다 →
 *     `requestVideoFrameCallback` 을 감싸서 1초마다 몇 번 불렸는지 센다.
 *     (주소에 `?perf` 를 붙이면 화면 안에도 `core/perf-meter` 의 초당 장 수가 뜬다)
 *
 * 맨얼굴 기준은 **여기서 만든다** — 촬영을 거치지 않고 이 화면만 보려고. 얼굴 점 478개를
 * 가짜로 둘 수는 없으니(테두리가 얼굴 그물에 붙는다) MediaPipe 로 지금 카메라에서 한 번 잡아 쓴다.
 *
 * **StrictMode 를 그대로 켠다.** 끄면 두 번 실행 문제가 숨어서 여기서 확인하는 의미가 없어진다.
 */

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Live from "./screens/Live";
import { unitScale } from "./core/baseline";
import type { Baseline } from "./core/types";
import { createLandmarker } from "./lib/landmarker";
import { liveFrameLoops } from "./hooks/useFrameLoop";
import "./app.css";

/**
 * 지금까지 `getUserMedia` 가 내준 트랙 전부. 끊긴 것도 버리지 않는다 — 꺼졌는지 세려면 남아 있어야 한다.
 *
 * **밖에서도 넣을 수 있게 `window` 에 걸어 둔다** (`__liveProbeTracks`). 카메라가 없는 자리(브라우저 미리보기 ·
 * 자동 검사)에서는 `getUserMedia` 를 가짜 영상으로 바꿔 끼우는데, 그때 이 목록에 트랙을 같이 넣어 주면
 * 꺼졌는지 세는 일이 진짜 카메라일 때와 똑같이 돈다
 */
const tracks: MediaStreamTrack[] = [];
(window as unknown as Record<string, unknown>).__liveProbeTracks = tracks;

/** 프레임 콜백이 불린 시각 — 최근 1초만 센다. 루프가 두 겹이면 이 수가 두 배로 나온다 */
const ticks: number[] = [];

function watchCamera(): void {
  const md = navigator.mediaDevices;
  const real = md.getUserMedia.bind(md);
  md.getUserMedia = async (c?: MediaStreamConstraints) => {
    const s = await real(c);
    tracks.push(...s.getTracks());
    return s;
  };
  // 루프가 쓰는 길을 그대로 감싼다 (lib/camera-loop 은 rVFC 가 있으면 그것만 쓴다)
  const proto = HTMLVideoElement.prototype as unknown as { requestVideoFrameCallback?: (cb: (now: number) => void) => number };
  const rvfc = proto.requestVideoFrameCallback;
  if (rvfc) {
    proto.requestVideoFrameCallback = function (cb: (now: number) => void) {
      return rvfc.call(this, (now: number) => {
        ticks.push(performance.now());
        cb(now);
      });
    };
  }
}
watchCamera();

function counts(): { live: number; ended: number; loops: number; fps: number } {
  const t = performance.now();
  while (ticks.length && ticks[0]! < t - 1000) ticks.shift();
  return {
    live: tracks.filter((x) => x.readyState === "live").length,
    ended: tracks.filter((x) => x.readyState === "ended").length,
    loops: liveFrameLoops(),
    fps: ticks.length,
  };
}

/**
 * 맨얼굴 기준 한 번 잡기 — 카메라를 열어 얼굴 점을 한 벌 받고 바로 끈다.
 * 촬영 화면이 하는 일(묶음·얼굴형·이마 밝기)은 하지 않는다. 테두리를 붙일 **얼굴 점과 기준 길이**만 있으면 된다
 */
async function grabBaseline(): Promise<Baseline> {
  const lmk = await createLandmarker("IMAGE", { blendshapes: false });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
  const el = document.createElement("video");
  el.playsInline = true; el.muted = true; el.srcObject = stream;
  // **화면에 붙여야 재생이 시작된다.** 떼어 둔 video 는 play() 가 돌아오지 않는 브라우저가 있다.
  // 보이면 안 되니 실시간 가이드가 영상을 숨기는 것과 같은 방식(1px · 투명)으로 둔다
  el.className = "live-src";
  el.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.append(el);
  try {
    await el.play();
    // 첫 장면은 아직 검을 수 있다 — 얼굴이 잡힐 때까지 몇 번 본다
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (el.readyState < 2) continue;
      const raw = lmk.detect(el).faceLandmarks[0];
      if (!raw) continue;
      const lm = raw.map((p) => ({ x: p.x * el.videoWidth, y: p.y * el.videoHeight }));
      return {
        lm, unit: unitScale(lm), foreheadL: 60, scleraLab: null,
        faceShape: { label: "oval", confidence: 0, method: "rule", version: "probe" },
        bareImage: null, w: el.videoWidth, h: el.videoHeight, expression: null,
      };
    }
    throw new Error("얼굴을 못 찾았어요 — 카메라를 보고 다시 눌러 주세요");
  } finally {
    el.srcObject = null;
    el.remove();
    for (const t of stream.getTracks()) t.stop();
    lmk.close();
  }
}

function Probe() {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [stat, setStat] = useState(counts);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 0.3초마다 다시 센다. 이 숫자가 화면에 그대로 뜨니 눈으로도 보이고 콘솔로도 읽을 수 있다
  useEffect(() => {
    const id = setInterval(() => setStat(counts()), 300);
    return () => clearInterval(id);
  }, []);

  // 자동 검사가 읽을 자리 — 브라우저에서 window.__liveProbe 로 꺼내 본다
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__liveProbe = { counts, open, round, hasBaseline: !!baseline };
  }, [open, round, baseline]);

  return (
    <div className="app">
      <header className="brand">실시간 가이드 화면 임시 페이지</header>

      <p className="sub">
        들어갔다 나오기 {round}번 · 열린 트랙 {stat.live} · 꺼진 트랙 {stat.ended} · 도는 루프 {stat.loops} · 초당 프레임 {stat.fps}
      </p>

      {!baseline && (
        <div className="row">
          <button
            type="button"
            className="go"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setNote(null);
              void grabBaseline().then(
                (b) => { setBaseline(b); setBusy(false); },
                (e: unknown) => { setNote(String(e)); setBusy(false); },
              );
            }}
          >
            {busy ? "얼굴을 찾고 있어요…" : "맨얼굴 기준 잡기 (카메라 한 번)"}
          </button>
        </div>
      )}

      {note && <p className="notice card">{note}</p>}

      {baseline && (
        <div className="row">
          <button
            type="button"
            className={open ? "go ghost" : "go"}
            onClick={() => {
              if (!open) setRound((n) => n + 1);
              setOpen(!open);
            }}
          >
            {open ? "나가기 (카메라 꺼짐)" : "실시간 가이드 들어가기"}
          </button>
        </div>
      )}

      {open && baseline && (
        <Live part="lip" baseline={baseline} onBack={() => setOpen(false)} />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Probe />
  </StrictMode>,
);
