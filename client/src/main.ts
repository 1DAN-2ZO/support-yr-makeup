/**
 * 진입점 — 껍데기를 세우고 각 모듈의 화면을 등록한다.
 *
 * 각 모듈이 자기 화면을 올리면 여기 `registerAll()` 에 한 줄씩 추가된다.
 *
 * 세션 draft (①, 1-11 · F-07): 세션이 바뀔 때마다 `set()` 이 IndexedDB 에 저장하고, 켤 때 `restore()` 가 되살린다.
 * 사진·랜드마크는 draft 에 없다 — 기준 랜드마크는 쌩얼 사진에서 다시 찾는다 (core/restore.ts).
 */

import { createLogger } from "./core/log";
import { createCaptureEvents, type CaptureEvents } from "./core/capture-events";
import { planRestore, rebuildBaseline, toCapture } from "./core/restore";
import { createLogStore } from "./core/log-store";
import { emptyJobSource } from "./core/look-jobs";
import {
  applyResult,
  applySkip,
  createSession,
  nextPart,
  setCurrentPart,
  setScreen,
  stripImages,
  toReviewParts,
  type ScreenId,
  type Session,
  setPlan,
  withBaseline,
} from "./core/flow";
import { planGuide } from "./core/personal-guide";
import { LIGHTING_NOTE, lightingDiffers } from "./core/review";
import { VlmFailure, createVlmClient, type VlmClient } from "./core/vlm-client";
import { PROMPT_VER, planWithVlm, vlmSchema } from "./core/vlm-flow";
import { measureFace } from "./core/face-measure";
import { resolvePlan, type PersonalPlan } from "./core/personalize";
import { createPlanQueue } from "./core/plan-queue";
import type { CaptureBundle } from "./core/types";
import { checkSecureContext, readEnv, type SecureCheck } from "./core/secure-context";
import { createSessionStore, indexedDbBackend, memoryBackend, type SessionStore } from "./core/session-store";
import { getVersions } from "./core/versions";
import { lookById, SUMMARY_TEMPLATE } from "./core/looks";
import { captureScreen, type CaptureDeps, type ShotData } from "./screens/capture";
import { consentScreen, deniedScreen, type ConsentDeps } from "./screens/consent";
import { doneScreen, type DoneDeps } from "./screens/done";
import { landmarksFromImage } from "./screens/landmarker";
import { createHairMasker, maskOfImage } from "./screens/hair-segmenter";
import { guideScreen, type GuideDeps } from "./screens/guide";
import { liveScreen, type LiveDeps } from "./screens/live";
import { fullRenderScreen, type FullRenderDeps } from "./screens/fullrender";
import { looksScreen, type LooksDeps } from "./screens/looks";
import { processingScreen, type ProcessingDeps } from "./screens/processing";
import { resultScreen, type ResultDeps } from "./screens/result";
import { reviewScreen, type ReviewDeps } from "./screens/review";
import { startReviewShot } from "./screens/review-shot";
import { faceImage } from "./screens/vlm-image";
import { createShell } from "./screens/shell";

/** 카메라를 못 여는 환경이면 맨 위에 띄운다. 흐름은 막지 않는다 */
function showWarning(c: SecureCheck): void {
  const box = document.createElement("div");
  box.className = "warn";
  const p = document.createElement("p");
  p.textContent = c.message;
  const small = document.createElement("p");
  small.className = "warn-hint";
  small.textContent = c.hint;
  box.append(p, small);
  el("app").prepend(box);
}

/** VLM 서버가 없거나 꺼져 있을 때 — 개인화가 핵심이라 시작하지 않는다 (2026-09-29 결정) */
function showUnavailable(): void {
  const root = el("screen");
  root.textContent = "";
  const box = document.createElement("div");
  box.className = "unavailable";
  const h = document.createElement("h1");
  h.textContent = "지금은 이용할 수 없어요";
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = "화장을 맞춰 줄 서버가 쉬고 있어요. 잠시 후 다시 열어 주세요.";
  const again = document.createElement("button");
  again.type = "button";
  again.className = "primary";
  again.textContent = "다시 시도";
  again.addEventListener("click", () => location.reload());
  box.append(h, p, again);
  root.append(box);
}

/** 개발 중 서버 주소(VITE_DHE_API)가 없을 때 — 규칙만으로 돈다고 알린다 */
function showDevRuleOnly(): void {
  const box = document.createElement("div");
  box.className = "warn";
  box.textContent = "개발 모드: VLM 서버 주소(VITE_DHE_API)가 없어 규칙만으로 개인화해요";
  el("app").prepend(box);
}

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} 가 없습니다`);
  return found;
}

/** 앱 첫 진입 스플래시. 세션 화면이 아니라 부팅 중에만 보인다. */
function showSplash(ms = 3000): Promise<void> {
  const root = el("screen");
  root.textContent = "";
  const splash = document.createElement("div");
  splash.className = "splash";
  splash.innerHTML = `
    <div class="splash-logo" aria-label="nudy">
      <span>nudy</span>
      <i aria-hidden="true"></i>
    </div>
  `;
  root.append(splash);
  return new Promise((resolve) => {
    window.setTimeout(() => {
      splash.classList.add("leaving");
      window.setTimeout(resolve, 280);
    }, ms);
  });
}

async function boot(): Promise<void> {
  const splashDone = showSplash();
  let session: Session = createSession();

  // 로그는 세션과 같은 IndexedDB 를 쓴다 — DB 를 두 벌 만들지 않는다.
  // 끝내기(sessionStore.clearAll)가 키를 전부 지우므로 로그도 같이 지워진다 (F-11).
  const sessionStore = await createSessionStore();
  const backend = (await indexedDbBackend()) ?? memoryBackend();
  const logStore = await createLogStore({ backend });
  const sid = crypto.randomUUID();

  const log = createLogger(
    { sid, screen: session.screen, part: session.currentPart, ver: getVersions() },
    logStore.sink,
  );
  // 머리카락 분할 (screens/hair-segmenter) — 화면 5 채점용. 실패는 로그에 한 번 남기고 마스크 없이 간다
  const hairMask = createHairMasker(undefined, (e) => log.log({ name: "error", where: "hair", msg: (e instanceof Error ? e.message : String(e)).slice(0, 120) }));
  const events = createCaptureEvents(log);

  // 세션을 바꾸는 곳은 전부 여기로 — 바뀔 때마다 draft 저장 (앱이 꺼져도 돌아오게, F-07)
  // 동의 전·거부·끝은 저장하지 않는다: 되살릴 게 없고, 끝내기(clearAll) 뒤에 키가 다시 생기면 안 된다 (F-11)
  let saving: Promise<void> = Promise.resolve();
  const set = (next: Session): void => {
    session = next;
    if (NO_DRAFT.includes(session.screen)) return;
    const draft = stripImages(session);
    saving = saving.then(() => sessionStore.saveDraft(draft)).catch(() => {});
  };

  session = await restore(sessionStore, events, session);
  // 서버 처리 화면(Stable-Makeup 그림 기다리기)은 흐름에서 빠졌다 — 거기서 멈춘 세션은 화장 선택으로
  if (session.screen === "processing") session = setScreen(session, "looks");

  // VLM 서버 (2026-09-29: 개인화는 VLM 이 정하고 규칙이 거른다. VLM 이 없으면 이용 불가).
  // 주소가 없으면 — 개발 중에만 — 규칙만으로 돌리고 그렇다고 표시한다
  const apiBase = import.meta.env.VITE_DHE_API as string | undefined;
  const vlm: VlmClient | null = apiBase ? createVlmClient(apiBase) : null;
  if (vlm) {
    const h = await vlm.health();
    if (!h.ok) {
      log.log({ name: "error", where: "boot", msg: "vlm_unavailable" });
      await splashDone;
      showUnavailable();
      return;
    }
  } else if (import.meta.env.DEV) {
    showDevRuleOnly();
  } else {
    log.log({ name: "error", where: "boot", msg: "vlm_not_configured" });
    await splashDone;
    showUnavailable();
    return;
  }

  const shell = createShell<Session>({
    root: el("screen"),
    chipsRoot: el("chips"),
    hintRoot: el("hint"),
    log,
    getSession: () => session,
    read: (s) => ({ screen: s.screen, currentPart: s.currentPart, parts: s.parts }),
    setScreen: (to: ScreenId) => {
      set(setScreen(session, to));
    },
    setPart: (p) => {
      set(setCurrentPart(session, p));
    },
    orientation: () =>
      window.matchMedia("(orientation: landscape)").matches ? "landscape" : "portrait",
  });

  // 카메라가 열릴 수 있는 곳인지 먼저 알려 준다. 안 그러면 "왜 안 되지"로 한참 헤맨다
  const secure = checkSecureContext(readEnv());
  if (!secure.ok) {
    showWarning(secure);
    log.log({ name: "error", where: "boot", msg: `secure_context:${secure.reason}` });
  }

  // 화장별 개인화 계획 — 화장을 누를 때 한 번씩, 마지막에 누른 것 먼저 (2026-09-28 흐름).
  // VLM 이 정하고 규칙 관문이 거른다. 거절되면 이유를 붙여 한 번 더 묻는다 (core/vlm-flow.ts)
  const rulePlan = (): PersonalPlan | null => {
    const b = session.baseline;
    return b ? resolvePlan(measureFace(b.lm), { faceShape: b.faceShape }) : null;
  };
  // VLM 에 보낼 얼굴 사진 — 기준 얼굴마다 한 번만 자른다.
  // 촬영 직후엔 쌩얼이 아직 저장 중일 수 있다 — 끝나길 기다렸다가 저장소에서 읽는다 (#179 리뷰: 바로 누르면 실패했다)
  const bareOf = async (b: NonNullable<Session["baseline"]>): Promise<Blob | ImageBitmap> => {
    if (b.bareImage) return b.bareImage;
    await saving;
    const d = await sessionStore.loadImage("bare");
    if (!d) throw new VlmFailure("unavailable", "쌩얼 사진이 없다");
    return d instanceof Blob ? d : new Blob([d]);
  };
  let vlmImage: { baseline: unknown; url: Promise<string> } | null = null;
  const imageFor = (b: NonNullable<Session["baseline"]>): Promise<string> => {
    // 얼굴 점은 촬영 프레임(b.w·b.h) 좌표, 쌩얼은 긴 변 1024 로 줄여 저장 — faceImage 가 맞춘다
    if (vlmImage?.baseline !== b) vlmImage = { baseline: b, url: bareOf(b).then((photo) => faceImage(photo, b.lm, { w: b.w, h: b.h })) };
    const url = vlmImage.url;
    url.catch(() => { if (vlmImage?.url === url) vlmImage = null; });   // 실패는 기억하지 않는다
    return url;
  };
  const plans = createPlanQueue<PersonalPlan>(async (lookId) => {
    const b = session.baseline;
    if (!b) throw new Error("기준 얼굴이 없습니다");
    if (!vlm) return rulePlan()!;   // 개발 중 서버 주소가 없을 때만
    const image = await imageFor(b);
    const t0 = performance.now();
    let model: string | null = null;
    try {
      const r = await planWithVlm(measureFace(b.lm), lookById(lookId), b.faceShape, async (prompt) => {
        const res = await vlm.plan({ image, prompt, schema: vlmSchema(), promptVer: PROMPT_VER, lookId });
        model = res.model;
        return res.proposal;
      });
      log.log({ name: "vlm_plan", look_id: lookId, ms: Math.round(performance.now() - t0), tries: r.tries, first_rejected: r.firstRejected.length, left_rejected: r.plan.rejected.length, model, fail: r.retryFailed ? "retry_failed" : null });
      // 세션에 저장 — 앱을 다시 켜도 같은 계획 (① #181). 그 사이 얼굴이 바뀌었으면(정면 다시 찍기) 버린다
      if (session.baseline === b) set(setPlan(session, lookId, r.plan));
      return r.plan;
    } catch (e) {
      // 첫 질문에서 실패 — 한 번 물었다
      log.log({ name: "vlm_plan", look_id: lookId, ms: Math.round(performance.now() - t0), tries: 1, first_rejected: 0, left_rejected: 0, model, fail: e instanceof VlmFailure ? e.reason : "error" });
      throw e;
    }
  });
  // 앱을 다시 켜면 큐는 비어 있지만 세션에 저장한 계획(① #181)이 있다 — 그것을 먼저 쓴다. 둘 다 없으면 규칙 계획.
  // 규칙 계획을 쓴 사실은 화장마다 한 번 로그로 남긴다 (#179 리뷰: VLM 계획과 구분이 안 됐다)
  const restoredRule = new Set<string>();
  const planFor = (lookId: string | null): PersonalPlan | null => {
    if (!lookId) return null;
    const p = session.plans[lookId] ?? plans.get(lookId);
    if (p) return p;
    if (vlm && !restoredRule.has(lookId)) {
      restoredRule.add(lookId);
      log.log({ name: "vlm_plan", look_id: lookId, ms: 0, tries: 0, first_rejected: 0, left_rejected: 0, model: null, fail: "restored_rule" });
    }
    return rulePlan();
  };

  // 가이드 모양 한 곳 — 화면 3 테두리 · 화면 4 테두리 · 화면 5 채점이 같은 것을 쓴다 ("따라 그린 선 = 채점 기준").
  // 고른 화장을 이 얼굴에 맞춘 계획 = 2-b AR 에서 본 모양. 계획이 없으면(개인화 전·복원 직후) 표준 모양
  // (planGuide(x, null) = lookGuide(x), plan-guide.test)
  const guideFor = () => planGuide(lookById(session.lookId).parts, planFor(session.lookId));

  // 끝내기가 지우고 남은 키 수. 0 이어야 한다 (F-11)
  let clearRemaining = 0;

  registerAll(
    shell,
    {
      setConsent: (ok) => set({ ...session, consent: ok }),
      onConsent: (ok) => events.consent(ok),
    },
    {
      getShots: () => session.shots,
      setShot: (id, data) => {
        const shots = { ...session.shots };
        if (data) shots[id] = data;
        else delete shots[id];
        set({ ...session, shots });
      },
      getBaseline: () => session.baseline,
      setBaseline: (b) => {
        // 얼굴이 바뀌면 앞 얼굴로 만든 계획은 버린다 — 세션 계획(#181)도 withBaseline 이 같이 비운다.
        // 같은 얼굴에 쌩얼 사진만 붙는 갱신은 계획을 그대로 둔다
        const next = withBaseline(session, b);
        if (next.plans !== session.plans) plans.clear();
        set(next);
      },
      // 쌩얼 저장도 draft 와 같은 줄에 세운다 — 끝내기(clearAll)가 인코딩·저장이 끝날 때까지 기다린다 (#162 리뷰)
      saveBare: (blob) => {
        const done = saving.then(() => blob).then((b) => sessionStore.saveImage("bare", b));
        saving = done.catch(() => {});
        return done;
      },
      setFaceShapeFrames: (frames) => set({ ...session, faceShapeFrames: frames }),
      events,
      // 서버 처리 화면 없이 바로 화장 선택 (2026-09-29 — 기다릴 서버 그림이 없다)
      next: "looks",
    },
    {
      getLookId: () => session.lookId,
      setLookId: (lookId: string) => {
        set({ ...session, lookId });
      },
      personalize: (lookId) => plans.request(lookId).then(() => {}),
      isPersonalized: (lookId) => session.plans[lookId] !== undefined || plans.get(lookId) !== undefined,
      minBusyMs: 1500,
      getPlan: (lookId) => planFor(lookId),
      // 2-b AR 도 앞머리 위엔 보정·화장 안 함 — 화면 3·5 와 같은 분할기 (#173)
      hairMask,
    },
    {
      getParts: () => toReviewParts(session),
      getLookName: () => lookById(session.lookId).name,
      // 조명 차 안내 (#79): 리뷰에 들어오며 찍은 "지금" 사진의 이마 L* 를 맨얼굴 기준과 견준다 (8 이상 차이면 한 줄)
      lightingNote: (nowL) => {
        const b = session.baseline;
        return b && typeof nowL === "number" && lightingDiffers(b, { foreheadL: nowL }) ? LIGHTING_NOTE : null;
      },
      shoot: (host, done) => startReviewShot(host, done, log),
      store: {
        loadImage: (k) => sessionStore.loadImage(k),
        saveImage: (k, b) => sessionStore.saveImage(k, b),
        async clearAll() {
          await saving;   // 저장 중인 draft·쌩얼이 지운 뒤에 써지지 않게
          // 로그 저장소를 먼저 닫는다 — 안 닫으면 버퍼·시간 저장이 지운 뒤에 events 키를 다시 만든다
          await logStore.clear();
          const r = await sessionStore.clearAll();
          clearRemaining = r.remaining;
          return r;
        },
      },
      // 합산 설정은 전 룩 공통이다 (결정 2026-09-22). 값은 rules/looks.json
      template: SUMMARY_TEMPLATE,
    },
    {
      getPart: () => session.currentPart,
      getBaseline: () => session.baseline,
      // 화면 4(②) 가 확인받기 순간의 프레임 묶음을 parts[].captured 에 둔다 (CaptureBundle)
      getCapture: (part) => (session.parts.find((p) => p.partId === part)?.captured as CaptureBundle | null) ?? null,
      // 화면 3·4 테두리와 같은 계획 가이드로 채점한다 (2-b AR 에서 본 모양과 같은 기준)
      guide: guideFor,
      getStatus: (part) => session.parts.find((p) => p.partId === part)?.status ?? "in_progress",
      apply: (part, outcome) => {
        set(applyResult(session, part, outcome));
      },
      skip: (part) => {
        set(applySkip(session, part));
      },
      nextPart: (after) => nextPart(session, after),
      // 앞머리·옆머리 칸을 채점에서 뺀다 (#201). 모델은 화면 5 에 처음 들어갈 때 한 번 — 못 불러오면 전처럼 채점
      hairMask,
      // 개발용: 주소에 ?tune 이면 판정 근거 숫자 (밝기 차 등)
      tune: new URLSearchParams(location.search).has("tune"),
      // ?tune "채점 사진 저장" 에 같이 — PC 에서 같은 가이드로 재현하려고
      tuneInfo: () => ({ lookId: session.lookId, plan: planFor(session.lookId), ver: getVersions() }),
    },
    // 서버 처리 화면은 흐름에서 빠졌다 (등록만 남김 — 되살린 세션은 위에서 화장 선택으로 보낸다)
    { jobs: emptyJobSource() },
    {
      getPart: () => session.currentPart,
      firstPart: () => nextPart(session, null),
      getBaseline: () => session.baseline,
      getLook: () => lookById(session.lookId),
      getFaceShape: () => session.faceShape,
      // 화면 3 완성본(#192) = 쌩얼 정면 + 같은 개인화 계획 화장. 원본은 메모리에만 있어 앱을 다시 켜면 저장한 쌩얼
      getPlan: () => planFor(session.lookId),
      getBareSource: () => (session.shots.front_open as ShotData | undefined)?.cv ?? null,
      // 앞머리 위엔 화장·보정을 안 한다 — 화면 5 채점과 같은 분할기 (#173 셰이더, ⑥)
      getHairMask: (d) => maskOfImage(hairMask, d.img, d.w, d.h),
      getGuide: guideFor,
    },
    {
      getPart: () => session.currentPart,
      getBaseline: () => session.baseline,
      // 정면 장의 이마 a*·b* 는 메모리에만 있다 (복원하면 없음 → 색 조건 생략)
      getBaseAb: () => {
        const f = (session.shots.front_open as ShotData | undefined)?.forehead;
        return f ? { a: f.a, b: f.b } : null;
      },
      getLookParts: () => lookById(session.lookId).parts,
      // 맨얼굴 정면 때 표정 — ① 이 촬영·복원 때 Baseline 에 채운다 (#177). 없으면 화면 4 가 표정 조건을 건너뛴다
      getBaseExpr: () => session.baseline?.expression ?? null,
      getGuide: guideFor,
      setCapture: (part, bundle) => {
        set({ ...session, parts: session.parts.map((p) => (p.partId === part ? { ...p, captured: bundle } : p)) });
      },
      next: "result",
    },
    {
      remaining: () => clearRemaining,
      // 세션을 통째로 새로 만든다 — 앞 세션 값이 하나도 안 남게
      restart: () => {
        logStore.reopen();
        plans.clear();
        set(createSession());
        clearRemaining = 0;
        shell.render();
      },
    },
  );

  // 방향이 바뀌면 안내만 다시 그린다
  window.addEventListener("orientationchange", () => shell.render());
  window.matchMedia("(orientation: landscape)").addEventListener("change", () => shell.render());

  // 탭을 닫기 전에 버퍼에 남은 로그를 저장
  window.addEventListener("pagehide", () => void logStore.flush());

  await splashDone;
  shell.render();
}

/**
 * 각 모듈이 자기 화면을 여기에 올린다.
 *
 *   ① capture : consent · denied · capture
 *   ② guide   : guide · live
 *   ③ score   : result
 *   ⑥ app     : processing · looks · fullrender · review · done
 *
 * 예) shell.register("looks", looksScreen);
 */
type LookDeps = LooksDeps & FullRenderDeps;

function registerAll(
  shell: ReturnType<typeof createShell<Session>>,
  consent: ConsentDeps,
  capture: CaptureDeps,
  look: LookDeps,
  review: ReviewDeps,
  result: ResultDeps,
  processing: ProcessingDeps,
  guide: GuideDeps,
  live: LiveDeps,
  done: DoneDeps,
): void {
  shell.register("consent", consentScreen<Session>(consent));
  shell.register("denied", deniedScreen<Session>());
  shell.register("capture", captureScreen<Session>(capture));
  shell.register("processing", processingScreen<Session>(processing));
  shell.register("looks", looksScreen<Session>(look));
  shell.register("fullrender", fullRenderScreen<Session>(look));
  shell.register("result", resultScreen<Session>(result));
  shell.register("review", reviewScreen<Session>(review));
  shell.register("done", doneScreen<Session>(done));
  shell.register("guide", guideScreen<Session>(guide));
  shell.register("live", liveScreen<Session>(live));
  // 등록 안 된 화면은 담당 모듈을 알려주는 자리표시가 뜬다
}

const NO_DRAFT: readonly ScreenId[] = ["consent", "denied", "done"];

/**
 * 켤 때 draft 가 있으면 되살린다 (1-11). 규칙은 core/restore.ts.
 * 촬영 뒤 화면이면 쌩얼 사진에서 기준 랜드마크를 다시 찾고, 못 찾으면 촬영부터.
 */
async function restore(store: SessionStore, events: CaptureEvents, fresh: Session): Promise<Session> {
  // restore{ok}: 사용자가 하던 그대로 돌아왔나. 만료는 복원 시도가 아니라 정상 동작이라 찍지 않는다 (#162 리뷰 — "복원 성공률" 지표)
  const loaded = await store.loadDraft();
  if (!loaded.draft) return fresh;
  const plan = planRestore(loaded.draft);
  if (plan.kind === "fresh") return fresh;
  if (plan.kind === "capture") {
    // 촬영 도중: 찍어 둔 장이 있었으면 사진을 잃은 것 → ok=false
    events.restore(plan.lostShots === 0, false);
    return plan.session;
  }
  const bare = await store.loadImage("bare");
  const blob = bare instanceof Blob ? bare : bare ? new Blob([bare]) : null;
  const found = blob ? await landmarksFromImage(blob).catch(() => null) : null;
  if (!blob || !found) {
    events.restore(false, !!blob);
    return toCapture(plan.session);
  }
  events.restore(true, true);
  return { ...plan.session, baseline: rebuildBaseline(plan.baseline, found, blob) };
}

void boot();
