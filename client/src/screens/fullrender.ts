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
import { LandmarkSmoother } from "../core/smoothing";
import type { Pt } from "../core/types";
import type { HairMask } from "../core/sampling";
import { createHairTicker, type HairMasker } from "./hair-segmenter";
import { createLandmarker } from "./landmarker";
import { MakeupGl } from "./makeup-gl";
import { paintLookOf, paintMakeup } from "./makeup-paint";
import type { Screen, ScreenContext } from "./shell";

export interface FullRenderDeps {
  getLookId: () => string | null;
  /** 룩 화면에서 만든 이 룩의 개인화 계획 (core/plan-queue.ts). 없으면 카메라 얼굴로 규칙 계획을 만든다 */
  getPlan?: (lookId: string) => PersonalPlan | null;
  /** 머리카락 분할 (screens/hair-segmenter) — 주면 앞머리 위엔 보정·화장을 안 한다. 없으면 전과 같다 (#173) */
  hairMask?: HairMasker;
}

/**
 * 2-b AR 머리카락 분할 — intervalMs 마다 한 번, 영상을 width px 로 줄여서. 그 사이엔 마지막 마스크 (#173).
 * 가정값 — 폰에서 ?tune 의 "머리카락 분할 ms" 를 보고 정한다. ?nohair 면 끄고 비교
 */
export const HAIR_AR = { intervalMs: 200, width: 320 };   // 폰(2026-09-30 Android): 분할 24~34ms → 500 에서 200 으로

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

      const top = document.createElement("div");
      top.className = "ar-topbar";
      top.innerHTML = `
        <div class="nudy-logo ar-logo" aria-label="nudy">
          <span>nudy</span>
          <i aria-hidden="true"></i>
        </div>
      `;
      const change = document.createElement("button");
      change.type = "button";
      change.className = "ar-change";
      change.textContent = "다른 룩";
      change.addEventListener("click", () => {
        ctx.log.log({ name: "button", button: "look_change" });
        ctx.go("looks");
      });
      top.append(change);

      const head = document.createElement("div");
      head.className = "ar-head";
      head.innerHTML = `
        <div class="ar-coach">
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <div><span>선택한 룩을 내 얼굴에 맞춰 보여드릴게요</span><i aria-hidden="true"></i></div>
        </div>
      `;

      const title = document.createElement("div");
      title.className = "ar-title";
      const h = document.createElement("h1");
      h.textContent = look.name;
      title.append(h);
      head.append(title);

      const stage = document.createElement("div");
      stage.className = "ar-stage";
      const note = document.createElement("p");
      note.className = "ar-note";
      wrap.append(top, head, stage, note);

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
      row.className = "btns ar-actions";
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
      let raf = 0;
      /** 지금 AR 장면을 저장한다 — AR 이 화장을 입혀 보여 줄 때만 채워진다 */
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
          const q = new URLSearchParams(location.search);
          const smoother = q.has("nosmooth") ? null : new LandmarkSmoother(Array.from({ length: 478 }, (_, i) => i), { minCutoff: SMOOTH.minCutoff, beta: SMOOTH.beta, dCutoff: SMOOTH.dCutoff });
          if (smoother && q.has("tune")) wrap.insertBefore(tuner(smoother), stage.nextSibling);
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
              if (hairOn && lm && ref && ticker.due(now)) segment(now, w, hh);
              gl.render(video, w, hh, atlas.mul, atlas.col, atlas.light, lm && ref ? { lm, ref, beauty: 0.3, radius: w * 0.004, hair } : null);
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
 * dCutoff↑ = 속도 추정(edx)이 더 빨리 반응 → beta가 더 일찍 켜짐 (#173, 기존 1.0 고정이 원인 후보).
 * 폰에서 ?tune 으로 맞춰 보고 여기 값을 정한다
 */
export const SMOOTH = { minCutoff: 4, beta: 0.3, dCutoff: 1 };

/** [개발용 ?tune] 슬라이더 세 개 — POC(look-tryon) 와 같은 방식 */
function tuner(sm: LandmarkSmoother): HTMLElement {
  const box = document.createElement("div");
  box.className = "ar-tune";
  const v = { ...SMOOTH };
  const out = document.createElement("p");
  const show = (): void => { out.textContent = `기준 ${v.minCutoff.toFixed(1)} · 반응성 ${v.beta.toFixed(2)} · dCutoff ${v.dCutoff.toFixed(1)}`; };
  const slider = (label: string, key: keyof typeof v, min: number, max: number, step: number): HTMLLabelElement => {
    const l = document.createElement("label");
    l.textContent = label;
    const r = document.createElement("input");
    Object.assign(r, { type: "range", min: String(min), max: String(max), step: String(step), value: String(v[key]) });
    r.addEventListener("input", () => { v[key] = Number(r.value); sm.setParams(v.minCutoff, v.beta, v.dCutoff); show(); });
    l.append(r);
    return l;
  };
  box.append(
    slider("기준 (높을수록 딱 붙음)", "minCutoff", 0.5, 10, 0.1),
    slider("반응성 (높을수록 빨리 따라감)", "beta", 0.01, 1, 0.01),
    slider("dCutoff (높을수록 반응성이 빨리 켜짐)", "dCutoff", 0.5, 5, 0.1),
    out,
  );
  show();
  return box;
}

/** 쓰는 제품 — 접기 없이 전부 (F-04). 룩 화면에서 옮겨 왔다 */
function products(lookId: string): HTMLElement {
  const { look, products: list } = lookDetail(lookId);
  const box = document.createElement("section");
  box.className = "look-detail ar-palette";
  const colorOf = (part: "liner" | "shadow" | "lip" | "cheek", fallback: string): string => {
    const c = look.parts[part]?.color;
    return c ? `rgb(${c.join(" ")})` : fallback;
  };
  const tones = [
    colorOf("shadow", "#c9b7aa"),
    colorOf("liner", "#5c4640"),
    colorOf("cheek", "#eaa59b"),
    colorOf("lip", "#ce7775"),
  ];
  const names = ["베이스", "라인", "블러셔", "립"];
  const productRows = list.slice(0, 7).map((p, i) => {
    const [part = "", item = p] = p.split(" · ");
    return `
      <li>
        <span class="palette-swatch" style="--tone:${tones[i % tones.length]}"></span>
        <span><strong>${item}</strong><em>${part}</em></span>
      </li>
    `;
  }).join("");
  box.innerHTML = `
    <div class="palette-paper">
      <p class="palette-kicker">맞춤형 컬러 처방</p>
      <h2>My Color Palette</h2>
      <ul class="palette-list">${productRows}</ul>
    </div>
    <div class="palette-tags">
      ${tones.map((tone, i) => `<span><b style="background:${tone}"></b>${names[i]}</span>`).join("")}
    </div>
  `;
  return box;
}
