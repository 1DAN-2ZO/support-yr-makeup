/**
 * 화면 2-b — AR 완성 예상 (F-04). 모듈 ⑥. (흐름: 화장을 누름 → 여기)
 *
 * 전면 카메라에 고른 화장을 이 얼굴 위에 입혀 보여 준다.
 *  - 모양: 표준 계획(personalize.standardPlan) — 가이드·채점과 같은 계획이다. 자리 · 크기는 얼굴 점이 맞춘다
 *  - 그리기: 기준 얼굴(카메라에서 처음 잡힌 얼굴)에 화장 층을 한 번 그리고(makeup-paint.ts),
 *    매 프레임 얼굴 그물(삼각형 852개)로 지금 얼굴에 휘어 피부와 섞는다(makeup-gl.ts, WebGL2)
 *  - 떨림: 얼굴 점에 One-Euro 필터(④ smoothing.ts). 가만히 있으면 많이, 움직이면 덜 부드럽게 — 고정 스무딩처럼
 *    눈머리가 뒤처지지 않는다. 비교용으로 ?nosmooth 면 끈다 (2026-09-29 폰: "떨림이 심해")
 *  - 카메라·WebGL 을 못 쓰면 안내만 하고 흐름은 막지 않는다 (2026-09-29: Stable-Makeup 을 빼서 대신 보여 줄 그림이 없다)
 *
 * 쓰는 제품을 같이 보여 주고, "화장하러 가기" 로 부위 반복을 시작한다.
 * (근거 한 줄 칸은 뺐다 — 2026-10-05: 얼굴을 재서 화장을 바꾸는 것이 없어 말할 근거가 없다)
 * 사진은 저장하지 않는다 — 카메라 영상은 이 화면 안에서만 쓴다.
 */

import { EYE_CONTOUR, computeFarEyeFix } from "../core/eye-fit";
import { lookById } from "../core/looks";
import { lookDetail } from "../core/look-view";
import { standardPlan, type PersonalPlan } from "../core/personalize";
import { SMOOTH } from "../core/smooth-params";
import { LandmarkSmoother } from "../core/smoothing";
import type { Pt } from "../core/types";
import type { HairMask } from "../core/sampling";
import { releaseCameraLocks } from "./camera-locks";
import { startFrameLoop } from "./camera-loop";
import { createHairTicker, type HairMasker } from "./hair-segmenter";
import { createLandmarker } from "./landmarker";
import { MakeupGl } from "./makeup-gl";
import { LASHES } from "./lash-assets";
import { paintLookOf, paintMakeup } from "./makeup-paint";
import { smoothTuner } from "./smooth-tune";
import type { Screen, ScreenContext } from "./shell";

export interface FullRenderDeps {
  getLookId: () => string | null;
  /** 이 화장을 그릴 계획. 안 주거나 null 이면 표준 계획 (personalize.standardPlan) */
  getPlan?: (lookId: string) => PersonalPlan | null;
  /** 머리카락 분할 (screens/hair-segmenter) — 주면 앞머리 위엔 보정·화장을 안 한다. 없으면 전과 같다 (#173) */
  hairMask?: HairMasker;
}

/**
 * 2-b AR 머리카락 분할 — intervalMs 마다 한 번, 영상을 width px 로 줄여서. 그 사이엔 마지막 마스크 (#173).
 * 가정값 — 폰에서 ?tune 의 "머리카락 분할 ms" 를 보고 정한다. ?nohair 면 끄고 비교
 */
export const HAIR_AR = { intervalMs: 200, width: 320 };   // 폰(2026-09-30 Android): 분할 24~34ms → 500 에서 200 으로

/**
 * 고개를 크게 돌리면 먼 쪽 눈 랜드마크가 틀어지는 문제 보정 (eye-fit.ts, 2026-10-02 PC 실측 #277) — 화면 4
 * (live-run.ts)에서 먼저 검증된 computeFarEyeFix를 그대로 가져다 쓴다(중복 구현 금지 — #291 리뷰, 변환
 * 공식 자체는 eye-fit.ts 하나뿐). 화면 4는 테두리 다각형에, 여기는 랜드마크 배열 자체에 적용하는 차이뿐이다.
 * 메시 워프(makeup-gl)가 이 배열을 그대로 꼭짓점으로 쓰므로, 여기서 고치면 그 눈 위의 모든 화장(섀도우·라이너
 * 등)이 같이 고쳐진다. yaw 12° 안쪽이면(computeFarEyeFix가 null) 그대로 cur 를 돌려준다 — 보정 없음.
 * export: eye-fit.test.ts가 이 함수를 직접 불러 시험한다(전엔 시험이 이 반복문을 따로 다시 써서, 여기가
 * 바뀌어도(예: 다른 눈에 적용) 못 잡았다 — #298 리뷰).
 */
export function correctFarEye(baseLm: readonly Pt[], cur: readonly Pt[]): Pt[] {
  const r = computeFarEyeFix(baseLm, cur);
  if (!r) return [...cur];
  const out = [...cur];
  for (const i of EYE_CONTOUR[r.far]) {
    const p = cur[i]!, q = r.place(baseLm[i]!);
    out[i] = { x: p.x + (q.x - p.x) * r.weight, y: p.y + (q.y - p.y) * r.weight };
  }
  return out;
}

export function fullRenderScreen<S>(deps: FullRenderDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const lookId = deps.getLookId();
      const look = lookById(lookId);
      // 계획을 안 넘기면 표준 계획 — 카메라 얼굴을 재서 모양을 바꾸지 않는다 (2026-10-05)
      const plan = (lookId && deps.getPlan ? deps.getPlan(lookId) : null) ?? standardPlan();
      let alive = true;
      let live = false;

      const wrap = document.createElement("div");
      wrap.className = "fullrender";
      ctx.root.append(wrap);

      // 맨 위 뒤로 가기 — 카메라 화면·제품 목록에 밀려 아래 버튼이 안 보일 수 있다 (2026-09-29 폰)
      const top = document.createElement("button");
      top.type = "button";
      top.className = "back ghost";
      top.textContent = "‹ 다른 화장";
      top.addEventListener("click", () => {
        ctx.log.log({ name: "button", button: "look_change" });
        ctx.go("looks");
      });
      const h = document.createElement("h1");
      h.textContent = `${look.name} — 내 얼굴에 입혀 봤어요`;
      const stage = document.createElement("div");
      stage.className = "ar-stage";
      const note = document.createElement("p");
      note.className = "muted";
      wrap.append(top, h, stage, note);

      if (lookId) wrap.append(products(lookId));

      const row = document.createElement("div");
      row.className = "btns";
      const go = document.createElement("button");
      go.type = "button";
      go.className = "primary";
      go.textContent = "화장하러 가기";
      go.addEventListener("click", () => {
        ctx.log.log({ name: "button", button: "guide_start" });
        ctx.go("guide");
      });
      const back = document.createElement("button");
      back.type = "button";
      back.className = "secondary";
      back.textContent = "다른 화장 보기";
      back.addEventListener("click", () => {
        ctx.log.log({ name: "button", button: "look_change" });
        ctx.go("looks");
      });
      row.append(go, back);
      wrap.append(row);

      /** 카메라가 아직이거나 못 쓸 때 — 안내만. 부위 반복은 그대로 시작할 수 있다 */
      function drawFallback(): void {
        if (live) return;
        const figure = document.createElement("div");
        figure.className = "full-img empty";
        figure.textContent = "이 기기에서는 미리보기를 볼 수 없어요";
        stage.replaceChildren(figure);
        note.textContent = "그대로 시작할 수 있어요. 부위마다 그릴 자리를 보여 드릴게요.";
      }

      drawFallback();

      // ── AR ───────────────────────────────────────────
      let stopLoop = (): void => {};
      let stream: MediaStream | null = null;
      let closeLandmarker: (() => void) | null = null;
      let disposeGl: (() => void) | null = null;
      if (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") void startAr();

      async function startAr(): Promise<void> {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
          if (!alive) return stopStream();
          // 앞 세션·다른 화면이 남긴 카메라 잠금부터 푼다 (#267: PC 웹캠이 하얗게·파랗게 고정된 채 남음). 2-b 는 아무것도 잠그지 않는다
          const track = stream.getVideoTracks()[0];
          if (track) await releaseCameraLocks(track as unknown as Parameters<typeof releaseCameraLocks>[0]);
          if (!alive) return stopStream();
          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.srcObject = stream;
          await video.play();
          // blendshapes: false — 표정 계수·변환행렬은 여기서 안 읽는다(쉐딩 등 모양은 랜드마크만으로 충분, #173)
          const lmk = await createLandmarker("VIDEO", { blendshapes: false });
          closeLandmarker = () => lmk.close();
          if (!alive) return cleanup();

          const canvas = document.createElement("canvas");
          canvas.className = "ar-canvas";
          const gl = new MakeupGl(canvas);
          disposeGl = () => gl.dispose();
          const mk = () => document.createElement("canvas");
          const atlas = { mul: mk(), col: mk(), light: mk() }, off = mk();
          const paintLook = paintLookOf(look);
          let ref: Pt[] | null = null;
          const q = new URLSearchParams(location.search);
          const smoother = q.has("nosmooth") ? null : new LandmarkSmoother(Array.from({ length: 478 }, (_, i) => i), { minCutoff: SMOOTH.minCutoff, beta: SMOOTH.beta, dCutoff: SMOOTH.dCutoff });
          // 떨림 필터 값(SMOOTH)·?tune 슬라이더는 화면 4 와 같이 쓴다 (#244)
          if (smoother && q.has("tune")) wrap.insertBefore(smoothTuner(smoother), stage.nextSibling);
          // 머리카락: 간격마다 줄인 영상으로 분할 → 셰이더가 그 위엔 보정·화장을 안 한다 (#173)
          const hairOn = !!deps.hairMask && !q.has("nohair");
          const ticker = createHairTicker(HAIR_AR.intervalMs);
          const small = document.createElement("canvas");
          let hair: HairMask | null = null;
          const hairInfo = q.has("tune") && hairOn ? document.createElement("p") : null;
          if (hairInfo) { hairInfo.className = "ar-tune"; hairInfo.textContent = "머리카락 분할 준비 중"; wrap.insertBefore(hairInfo, stage.nextSibling); }
          const segment = (now: number, w: number, hh: number): void => {
            const g = small.getContext("2d", { willReadFrequently: true });
            if (!g || !deps.hairMask) return;
            ticker.start(now);
            small.width = HAIR_AR.width;
            small.height = Math.round((hh * HAIR_AR.width) / w);
            g.drawImage(video, 0, 0, small.width, small.height);
            const px = g.getImageData(0, 0, small.width, small.height), t0 = performance.now();
            deps.hairMask({ data: px.data, w: small.width, h: small.height })
              .then((m) => {
                if (m) hair = m;
                if (hairInfo) hairInfo.textContent = `머리카락 분할 ${Math.round(performance.now() - t0)}ms · 간격 ${HAIR_AR.intervalMs}ms`;
              })
              .catch(() => {})
              .finally(() => ticker.done());
          };

          // now = 공용 루프가 주는 늘어나기만 하는 시각 — 얼굴 찾기 · 떨림 필터 · 머리카락 분할 간격이 같이 쓴다
          const frame = (now: number): void => {
            if (!alive) return;
            const w = video.videoWidth, hh = video.videoHeight;
            if (w && hh) {
              const face = lmk.detectForVideo(video, now).faceLandmarks[0];
              const raw = face && face.length >= 478 ? face.map((p) => ({ x: p.x * w, y: p.y * hh })) : null;
              const lm = smoother ? smoother.smooth(raw, now) : raw;
              // ?looseref — 기준 얼굴 판정을 느슨하게(테스트용, 캠 각도가 안 좋아 못 들어갈 때, #298)
              const refTol = q.has("looseref") ? { margin: 0.08, yaw: 0.3 } : undefined;
              if (lm && !ref && goodRef(raw!, w, hh, refTol)) {
                // 기준 얼굴: 정면으로 다 보이는 첫 얼굴(goodRef). 화장 층은 여기에 한 번만 그린다 (계획은 정해져 있다)
                ref = lm;
                for (const c of [atlas.mul, atlas.col, atlas.light, off]) { c.width = w; c.height = hh; }
                paintMakeup({ mul: atlas.mul.getContext("2d")!, col: atlas.col.getContext("2d")!, light: atlas.light.getContext("2d")! }, off, ref, paintLook, plan, plan.liner.plan.style, LASHES);
              }
              if (hairOn && lm && ref && ticker.due(now)) segment(now, w, hh);
              // 먼 쪽 눈 보정(#277) — 메시 워프 꼭짓점으로 그대로 들어가니 그 눈 위 화장 전부가 같이 고쳐진다.
              // 비교용으로 ?nofareye 면 끈다 (#298 — 켠 것·끈 것을 같은 자세로 비교)
              const fixedLm = lm && ref && !q.has("nofareye") ? correctFarEye(ref, lm) : lm;
              gl.render(video, w, hh, atlas.mul, atlas.col, atlas.light, fixedLm && ref ? { lm: fixedLm, ref, beauty: 0.3, radius: w * 0.004, hair } : null);
              if (!live) {
                live = true;
                stage.replaceChildren(canvas);
                note.textContent = "카메라에 비친 내 얼굴이에요. 고개를 돌려 봐도 따라가요.";
              }
            }
          };
          // 카메라 새 장면에만 얼굴을 찾는다 (#245 — 전에는 화면 그리기마다라 같은 장면을 두세 번, #173 느림의 원인 후보)
          stopLoop = startFrameLoop(video, frame, {
            onError: (e) => {
              // 루프 안 오류는 바깥 try 가 못 잡는다 — 기록하고 서버 그림으로 돌아간다 (#172 리뷰)
              ctx.log.log({ name: "error", where: "ar", msg: e instanceof Error ? e.message : String(e) });
              cleanup(false);
              live = false;
              drawFallback();
            },
          });
        } catch (e) {
          // 카메라 거부·WebGL 없음 — 서버 그림으로 둔다
          ctx.log.log({ name: "error", where: "ar", msg: e instanceof Error ? e.message : String(e) });
          cleanup(false);
        }
      }

      function stopStream(): void {
        // 잠금을 풀고 끈다 — PC 웹캠은 잠금을 기기에 저장해서 다음에 열 때 남는다 (#267)
        for (const t of stream?.getTracks() ?? []) void releaseCameraLocks(t as unknown as Parameters<typeof releaseCameraLocks>[0]).finally(() => t.stop());
        stream = null;
      }

      function cleanup(all = true): void {
        stopLoop();
        stopStream();
        closeLandmarker?.();
        closeLandmarker = null;
        disposeGl?.();
        disposeGl = null;
        if (all) alive = false;
      }

      return () => {
        cleanup();
      };
    },
  };
}

/**
 * 화장을 한 번 그릴 기준 얼굴로 쓸 만한가 (#172 리뷰: 첫 프레임이 고개를 돌렸거나 잘렸으면 그 비뚤어진 그물에
 * 그린 화장이 세션 내내 따라다녔다). 얼굴 전체가 화면 안(가장자리 2%)에 있고, 코끝이 두 눈 바깥 끝의 가운데에서
 * 눈 사이 거리의 12% 안(대략 정면 ±10°)이어야 한다. 그때까지는 화장 없이 영상만 보인다
 */
/** margin: 프레임 가장자리 여유 비율(기본 2%). yaw: 코끝 치우침 허용(기본 0.12) — ?looseref 로 테스트할 때 풀어 쓴다(#298) */
export function goodRef(lm: readonly Pt[], w: number, h: number, tol: { margin: number; yaw: number } = { margin: 0.02, yaw: 0.12 }): boolean {
  const mx = w * tol.margin, my = h * tol.margin;
  if (lm.some((p) => p.x < mx || p.x > w - mx || p.y < my || p.y > h - my)) return false;
  const a = lm[33], b = lm[263], n = lm[1];
  if (!a || !b || !n) return false;
  const eye = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return Math.abs(n.x - (a.x + b.x) / 2) / eye < tol.yaw;
}

/** 쓰는 제품 — 접기 없이 전부 (F-04). 룩 화면에서 옮겨 왔다 */
function products(lookId: string): HTMLElement {
  const { look, products: list } = lookDetail(lookId);
  const box = document.createElement("section");
  box.className = "look-detail";
  const h = document.createElement("h2");
  h.textContent = `${look.name} — 쓰는 것`;
  const ul = document.createElement("ul");
  for (const p of list) {
    const li = document.createElement("li");
    li.textContent = p;
    ul.append(li);
  }
  box.append(h, ul);
  return box;
}
