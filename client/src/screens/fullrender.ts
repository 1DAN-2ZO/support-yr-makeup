/**
 * 화면 2-b — AR 완성 예상 (F-04). 모듈 ⑥. (2026-09-28 흐름: 룩을 누름 → 개인화 → 여기)
 *
 * 전면 카메라에 고른 룩을 **이 얼굴에 맞게 개인화해서** 입혀 보여 준다.
 *  - 모양: 개인화 계획(personalize.ts) — 가이드·채점과 같은 계획이다
 *  - 그리기: 기준 얼굴(카메라에서 처음 잡힌 얼굴)에 화장 층을 한 번 그리고(makeup-paint.ts),
 *    매 프레임 얼굴 그물(삼각형 852개)로 지금 얼굴에 휘어 피부와 섞는다(makeup-gl.ts, WebGL2)
 *  - 떨림: 얼굴 점에 One-Euro 필터(④ smoothing.ts). 가만히 있으면 많이, 움직이면 덜 부드럽게 — 고정 스무딩처럼
 *    눈머리가 뒤처지지 않는다. 비교용으로 ?nosmooth 면 끈다 (2026-09-29 폰: "떨림이 심해")
 *  - 카메라·WebGL 을 못 쓰면 안내만 하고 흐름은 막지 않는다 (2026-09-29: Stable-Makeup 을 빼서 대신 보여 줄 그림이 없다)
 *
 * 근거 한 줄(개인화 계획의 rationale)과 쓰는 제품을 같이 보여 주고, "화장하러 가기" 로 부위 반복을 시작한다.
 * 사진은 저장하지 않는다 — 카메라 영상은 이 화면 안에서만 쓴다.
 */

import { measureFace } from "../core/face-measure";
import { lookById } from "../core/looks";
import { lookDetail } from "../core/look-view";
import { resolvePlan, type PersonalPlan } from "../core/personalize";
import type { ArFrame } from "../core/ar-frame-store";
import { LandmarkSmoother } from "../core/smoothing";
import type { Pt } from "../core/types";
import { createLandmarker } from "./landmarker";
import { MakeupGl } from "./makeup-gl";
import { paintLookOf, paintMakeup } from "./makeup-paint";
import type { Screen, ScreenContext } from "./shell";

export interface FullRenderDeps {
  getLookId: () => string | null;
  /** 룩 화면에서 만든 이 룩의 개인화 계획 (core/plan-queue.ts). 없으면 카메라 얼굴로 규칙 계획을 만든다 */
  getPlan?: (lookId: string) => PersonalPlan | null;
  /**
   * "화장하러 가기" 를 누른 순간의 AR 한 장면 + 얼굴 점 — 화면 3 완성본용 (#182). 화장이 입혀져 보일 때만 부른다.
   * 사진·점은 안 뒤집힌 카메라 좌표 (캔버스는 CSS 로만 거울). JPEG 로 바꾸는 중이라 Promise 로 넘긴다
   */
  saveArFrame?: (lookId: string, f: Promise<ArFrame | null>) => void;
}

export function fullRenderScreen<S>(deps: FullRenderDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const lookId = deps.getLookId();
      const look = lookById(lookId);
      const plan = lookId && deps.getPlan ? deps.getPlan(lookId) : null;
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

      const why = Object.values(plan?.rationale ?? {}).filter((t): t is string => !!t);
      if (why.length) {
        const ul = document.createElement("ul");
        ul.className = "ar-why";
        for (const t of why) {
          const li = document.createElement("li");
          li.textContent = t;
          ul.append(li);
        }
        wrap.append(ul);
      }
      if (lookId) wrap.append(products(lookId));

      const row = document.createElement("div");
      row.className = "btns";
      const go = document.createElement("button");
      go.type = "button";
      go.className = "primary";
      go.textContent = "화장하러 가기";
      go.addEventListener("click", () => {
        ctx.log.log({ name: "button", button: "guide_start" });
        snapshot?.();
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
      let raf = 0;
      /** 지금 AR 장면을 저장한다 — AR 이 화장을 입혀 보여 줄 때만 채워진다 */
      let snapshot: (() => void) | null = null;
      let stream: MediaStream | null = null;
      let closeLandmarker: (() => void) | null = null;
      let disposeGl: (() => void) | null = null;
      if (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") void startAr();

      async function startAr(): Promise<void> {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
          if (!alive) return stopStream();
          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.srcObject = stream;
          await video.play();
          const lmk = await createLandmarker("VIDEO");
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
          /** 마지막으로 화장을 입혀 그린 프레임의 얼굴 점·크기 */
          let shown: { lm: Pt[]; w: number; h: number } | null = null;
          snapshot = () => {
            if (!shown || !lookId || !deps.saveArFrame) return;
            // 화면을 떠나면 WebGL 을 돌려줘서(dispose) 그림이 사라진다 — 누른 순간 2D 캔버스로 바로 옮긴다
            const copy = document.createElement("canvas");
            copy.width = shown.w;
            copy.height = shown.h;
            const c2 = copy.getContext("2d");
            if (!c2) return;
            c2.drawImage(canvas, 0, 0, shown.w, shown.h);
            const f = shown, id = lookId;
            // JPEG 는 늦게 끝난다 — 화면 3 이 기다렸다 받게 자리(Promise)를 먼저 넘긴다
            deps.saveArFrame(id, new Promise<ArFrame | null>((resolve) => {
              copy.toBlob((b) => resolve(b ? { lookId: id, image: b, lm: f.lm, w: f.w, h: f.h } : null), "image/jpeg", 0.9);
            }));
          };
          const q = new URLSearchParams(location.search);
          const smoother = q.has("nosmooth") ? null : new LandmarkSmoother(Array.from({ length: 478 }, (_, i) => i), { minCutoff: SMOOTH.minCutoff, beta: SMOOTH.beta });
          if (smoother && q.has("tune")) wrap.insertBefore(tuner(smoother), stage.nextSibling);

          const tick = (): void => {
            if (!alive) return;
            try {
              frame();
            } catch (e) {
              // 루프 안 오류는 바깥 try 가 못 잡는다 — 기록하고 서버 그림으로 돌아간다 (#172 리뷰)
              ctx.log.log({ name: "error", where: "ar", msg: e instanceof Error ? e.message : String(e) });
              cleanup(false);
              live = false;
              drawFallback();
              return;
            }
            raf = requestAnimationFrame(tick);
          };
          const frame = (): void => {
            const w = video.videoWidth, hh = video.videoHeight;
            if (w && hh) {
              const face = lmk.detectForVideo(video, performance.now()).faceLandmarks[0];
              const now = performance.now();
              const raw = face && face.length >= 478 ? face.map((p) => ({ x: p.x * w, y: p.y * hh })) : null;
              const lm = smoother ? smoother.smooth(raw, now) : raw;
              if (lm && !ref && goodRef(raw!, w, hh)) {
                // 기준 얼굴: 정면으로 다 보이는 첫 얼굴(goodRef). 화장 층은 여기에 한 번만 그린다 (계획은 정해져 있다)
                ref = lm;
                for (const c of [atlas.mul, atlas.col, atlas.light, off]) { c.width = w; c.height = hh; }
                const p = plan ?? resolvePlan(measureFace(ref));
                paintMakeup({ mul: atlas.mul.getContext("2d")!, col: atlas.col.getContext("2d")!, light: atlas.light.getContext("2d")! }, off, ref, paintLook, p, p.liner.plan.style);
              }
              gl.render(video, w, hh, atlas.mul, atlas.col, atlas.light, lm && ref ? { lm, ref, beauty: 0.3, radius: w * 0.004 } : null);
              shown = lm && ref ? { lm, w, h: hh } : null;
              if (!live) {
                live = true;
                stage.replaceChildren(canvas);
                note.textContent = "카메라에 비친 내 얼굴이에요. 고개를 돌려 봐도 따라가요.";
              }
            }
          };
          raf = requestAnimationFrame(tick);
        } catch (e) {
          // 카메라 거부·WebGL 없음 — 서버 그림으로 둔다
          ctx.log.log({ name: "error", where: "ar", msg: e instanceof Error ? e.message : String(e) });
          cleanup(false);
        }
      }

      function stopStream(): void {
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
      }

      function cleanup(all = true): void {
        cancelAnimationFrame(raf);
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
export function goodRef(lm: readonly Pt[], w: number, h: number): boolean {
  const mx = w * 0.02, my = h * 0.02;
  if (lm.some((p) => p.x < mx || p.x > w - mx || p.y < my || p.y > h - my)) return false;
  const a = lm[33], b = lm[263], n = lm[1];
  if (!a || !b || !n) return false;
  const eye = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return Math.abs(n.x - (a.x + b.x) / 2) / eye < 0.12;
}

/**
 * One-Euro 값. ④ 기본값(2.5 / 0.08)은 움직이기 시작할 때 뒤처졌다 (2026-09-29 폰: "트래킹이 느려졌다").
 * 기준(minCutoff)↑ = 가만히 있을 때도 덜 부드럽게(더 딱 붙음), 반응성(beta)↑ = 움직일 때 더 빨리 따라감.
 * 폰에서 ?tune 으로 맞춰 보고 여기 값을 정한다
 */
export const SMOOTH = { minCutoff: 4, beta: 0.3 };

/** [개발용 ?tune] 슬라이더 두 개 — POC(look-tryon) 와 같은 방식 */
function tuner(sm: LandmarkSmoother): HTMLElement {
  const box = document.createElement("div");
  box.className = "ar-tune";
  const v = { ...SMOOTH };
  const out = document.createElement("p");
  const show = (): void => { out.textContent = `기준 ${v.minCutoff.toFixed(1)} · 반응성 ${v.beta.toFixed(2)}`; };
  const slider = (label: string, key: keyof typeof v, min: number, max: number, step: number): HTMLLabelElement => {
    const l = document.createElement("label");
    l.textContent = label;
    const r = document.createElement("input");
    Object.assign(r, { type: "range", min: String(min), max: String(max), step: String(step), value: String(v[key]) });
    r.addEventListener("input", () => { v[key] = Number(r.value); sm.setParams(v.minCutoff, v.beta); show(); });
    l.append(r);
    return l;
  };
  box.append(slider("기준 (높을수록 딱 붙음)", "minCutoff", 0.5, 10, 0.1), slider("반응성 (높을수록 빨리 따라감)", "beta", 0.01, 1, 0.01), out);
  show();
  return box;
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
