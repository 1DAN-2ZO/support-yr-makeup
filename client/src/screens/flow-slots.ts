/**
 * 새 흐름 UI 초안 (2026-10-06).
 * 실제 기능 화면이 붙기 전까지 사용자가 보는 형태로 흐름을 이어 준다.
 */

import type { ScreenId } from "@core/screens";
import { nextGuidePart } from "@core/screens";
import { pickProducts, pickShadeText } from "@core/product-picks";
import { FEEDBACK_ORDER, type FeedbackPart } from "@core/guide-feedback";
import type { MakeResult } from "@core/picture-maker";
import { PART_NAME } from "@core/score";
import type { PartId } from "@core/types";
import { MAKE_WAIT_TEXT, makeFailText, shrinkForUpload } from "./answer-make";
import { colorPalette } from "./color-palette";
import { drawGuidePage, type GuideLoad, type GuideView } from "./guide-source";
import { analyzeRefPhoto, REF_FAIL_TEXT } from "./ref-analyze";
import type { RefAnalysis } from "./ref-analyze";
import { DEMO_REF_COLORS } from "./ref-demo";
import { surveyModal } from "./survey-modal";
import { getRefColors, setRefColors } from "./ref-store";
import type { RefFailure } from "./ref-analyze";
import type { Screen, ScreenContext } from "./shell";

export interface SlotSpec {
  title: string;
  owner: string;
  todo: readonly string[];
  next: ScreenId;
  /** 지금 받아 둔 것 한 줄 (들어올 때마다 새로 읽는다) — 다음 담당이 무엇을 받아 쓰는지 보이게 */
  status?: () => string;
}

export interface SlotDeps {
  /** 참고 사진을 재는 함수. 안 주면 진짜 분석기 — 테스트에서 가짜로 바꿔 끼운다 */
  analyze?: (file: File) => Promise<RefAnalysis | RefFailure>;
  /**
   * 정답사진 만들기 (⑥ 백 연결 — main.ts 의 makeAnswer). 주면 "적용하기" 가 참고 사진을 서버로 보내 정답사진을 받아 보여 준다.
   * 안 주면 색만 읽고 참고 사진을 보여 준다 (서버 없이 화면만 볼 때 — ui-preview)
   */
  makeAnswer?: (ref: Blob) => Promise<MakeResult>;
  /** 올리기 전에 참고 사진을 줄이는 함수. 안 주면 진짜 (screens/answer-make) — 테스트에서 바꿔 끼운다 */
  shrink?: (photo: Blob) => Promise<Blob>;
}

export interface PartGuideSlotDeps {
  getPart: () => PartId | null;
  /**
   * 정답사진에서 만든 부위 가이드 재료 (⑥ 잇기 — main.ts 의 getGuide, screens/guide-source). 주면 견본 그림 대신
   * 정답사진을 그 부위로 자른 그림 + 가이드 테두리를 보여 준다. 안 주거나 재료가 없으면 견본 그림 그대로
   */
  getGuide?: () => Promise<GuideLoad>;
  /** 자른 그림을 캔버스에 그리는 함수. 안 주면 진짜 (drawGuidePage) — 테스트에서 바꿔 끼운다 */
  paintGuide?: (out: HTMLCanvasElement, view: GuideView, part: FeedbackPart) => boolean;
}

/** 정답사진 가이드가 있는 부위인가 — 쉐딩(contour)은 없다 */
const hasPhotoGuide = (p: PartId): p is FeedbackPart => (FEEDBACK_ORDER as readonly PartId[]).includes(p);

export interface SaveSlotDeps {
  clearAll: () => Promise<unknown>;
  /** 후기 설문 주소. 있으면 "끝내기" 를 누른 그 화면 위에 모달로 묻는다 */
  surveyUrl?: string | null;
}

const SAMPLE_COLOR: Record<PartId, { hex: string; name: string; copy: string }> = {
  brow: { hex: "#5c4a42", name: "애쉬브라운 계열", copy: "결을 살려 빈 곳을 먼저 채워 주세요" },
  liner: { hex: "#2b2523", name: "소프트블랙 계열", copy: "속눈썹 라인을 따라 얇게 이어 주세요" },
  shadow: { hex: "#8b6f5e", name: "브라운 계열", copy: "눈두덩 중앙은 연하게, 끝은 조금 더 깊게" },
  lip: { hex: "#c08878", name: "MLBB 계열", copy: "입술 안쪽을 조금 더 진하게 올려 주세요" },
  cheek: { hex: "#e89477", name: "코랄 계열", copy: "웃을 때 올라오는 볼 중앙부터 퍼뜨려 주세요" },
  contour: { hex: "#7d6350", name: "브라운 계열", copy: "턱선 아래쪽을 따라 자연스럽게 풀어 주세요" },
};

function logo(): HTMLElement {
  const el = document.createElement("div");
  el.className = "nudy-logo slot-logo";
  el.setAttribute("aria-label", "nudy");
  el.innerHTML = `<span>nudy</span><i aria-hidden="true"></i>`;
  return el;
}

function coach(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "slot-coach";
  el.innerHTML = `
    <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
    <div><span>${text}</span><i aria-hidden="true"></i></div>
  `;
  return el;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "primary";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

/** primary 바로 위에 놓는 보조 버튼 (테두리만) — 눌러도 흐름이 끝나지 않는 길 */
function liveButton(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "slot-live";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function page(cls = ""): HTMLElement {
  const el = document.createElement("div");
  el.className = `slot ${cls}`.trim();
  el.append(logo());
  return el;
}

function testMeta(title: string, owner: string, todo: readonly string[]): HTMLElement {
  const el = document.createElement("div");
  el.className = "slot-dev-meta";
  el.textContent = [title, owner, ...todo].join(" ");
  return el;
}

function title(title: string, sub: string): HTMLElement {
  const head = document.createElement("div");
  head.className = "slot-head";
  const markedTitle = title.includes("·")
    ? `<em>${title.replace("·", "</em> ·")}`
    : title.replace(/^(\S+)/, "<em>$1</em>");
  head.innerHTML = `<h1>${markedTitle}</h1><p>${sub}</p>`;
  return head;
}

function action(ctx: ScreenContext<unknown>, label: string, next: ScreenId): HTMLButtonElement {
  return button(label, () => {
    ctx.log.log({ name: "button", button: `slot_next:${next}` });
    const first = next === "partguide" ? nextGuidePart(null) : null;
    if (first) ctx.goPart(first);
    else ctx.go(next);
  });
}

function resetPage(root: HTMLElement): void {
  root.replaceChildren(logo());
}

/**
 * 참고 사진 업로드. label 로 감싸서 칸 아무 데나 눌러도 사진 고르는 창이 열린다.
 * 고른 사진은 미리보기로 바꿔 보여 준다 — 고르는 것만으로는 서버로 가지 않는다 ("적용하기" 를 눌러야 간다).
 */
function uploadCard(previewUrl: string | null, onPick: (file: File) => void): HTMLElement {
  const card = document.createElement("label");
  card.className = "slot-upload";
  card.innerHTML = previewUrl
    ? `<div class="slot-upload-main has-photo"><img src="${previewUrl}" alt="올린 참고 사진" /><b>다른 사진으로 바꾸기</b></div>`
    : `<div class="slot-upload-main">
         <span aria-hidden="true"></span>
         <strong>참고 사진 업로드</strong>
         <em>정면 사진이면 가장 좋아요</em>
       </div>`;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.className = "slot-upload-input";
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) onPick(f);
  });
  card.append(input);
  return card;
}

/** 사진을 못 읽었을 때 한 줄 안내 */
function uploadWarn(text: string): HTMLElement {
  const el = document.createElement("p");
  el.className = "slot-upload-warn";
  el.setAttribute("role", "status");
  el.textContent = text;
  return el;
}

function loadingCard(): HTMLElement {
  const card = document.createElement("div");
  card.className = "slot-answer-loading";
  card.innerHTML = `
    <span aria-hidden="true"></span>
    <strong>정답사진을 만들고 있어요</strong>
    <p>참고 사진의 화장을 맨얼굴 사진에 맞춰 정리하는 중이에요.</p>
  `;
  return card;
}

function answerPhotoCard(previewUrl?: string, alt = "올린 참고 사진"): HTMLElement {
  const card = document.createElement("div");
  card.className = "slot-answer-photo";
  card.innerHTML = `
    <div class="slot-answer-photo-frame${previewUrl ? " has-ref" : ""}">
      ${previewUrl ? `<img class="slot-answer-ref" src="${previewUrl}" alt="${alt}" />` : ""}
      <span class="slot-answer-face" aria-hidden="true"></span>
      <span class="slot-answer-line one" aria-hidden="true"></span>
      <span class="slot-answer-line two" aria-hidden="true"></span>
    </div>
    <div class="slot-answer-preview">
      <b>정답사진 완성</b>
      <p>이 사진을 기준으로 부위별 화장 가이드를 보여드릴게요.</p>
    </div>
  `;
  return card;
}

function guideMock(part: PartId): HTMLElement {
  const sample = SAMPLE_COLOR[part];
  // 참고 사진에서 읽은 색이 있으면 그걸 쓴다 — 팔레트 화면과 같은 색을 말해야 한다.
  // 없는 부위(쉐딩)나 사진에서 못 읽은 부위는 견본 값으로 둔다
  // 이번에 올린 사진에서 읽은 색. 없으면(새로고침 등) 견본으로 돌아간다
  const colors = getRefColors() ?? DEMO_REF_COLORS;
  const read = part === "contour" ? undefined : colors[part];
  // 동그라미 색과 이름은 **보이는 색** (팔레트 화면과 같아야 한다),
  // 제품을 고르는 데는 **보정한 색** (제품은 피부에 섞이지 않았다)
  const hex = read?.hex ?? sample.hex;
  const name = read ? `${read.name.text} 계열` : sample.name;
  const card = document.createElement("div");
  card.className = "slot-guide-card";
  card.style.setProperty("--slot-color", hex);
  card.innerHTML = `
    <div class="slot-guide-photo">
      <span class="slot-guide-line one"></span>
      <span class="slot-guide-line two"></span>
      <span class="slot-guide-dot"></span>
    </div>
    <div class="slot-color">
      <span aria-hidden="true"></span>
      <div><strong>${name}</strong><p>${sample.copy}</p></div>
    </div>
  `;
  // 이 색 계열에 맞는 제품 둘.
  // 보이는 색과 보정한 색이 다를 수 있어 **양쪽 계열을 다 넣는다** —
  // 보이는 색은 피부가 섞여 탁하고, 보정한 색은 제품 쪽에 가깝다. 어느 쪽이 맞는지
  // 지금은 가릴 길이 없으므로 둘 다 보여 주고 고르게 한다
  const wanted = [...new Set([read?.name.base, read?.product.name.base].filter((f): f is string => !!f))];
  const picks = part === "contour" || !wanted.length ? [] : pickProducts(part, wanted, 2);
  if (picks.length) {
    const box = document.createElement("div");
    box.className = "slot-product";
    box.innerHTML = `
      <b>이런 제품이면 돼요</b>
      ${picks.map(({ pick, family: f }) => `
        <div class="slot-product-row">
          ${pick.photo
            ? `<img class="slot-product-photo" src="${pick.photo}" alt="${pick.brand} ${pick.name}" />`
            : `<span class="slot-product-dot" aria-hidden="true"></span>`}
          <div>
            <strong>${pick.brand} ${pick.name}</strong>
            <em>${pickShadeText(pick, f)}</em>
            <p>${pick.kind}</p>
          </div>
        </div>
      `).join("")}
      ${picks.some((x) => x.pick.photo) ? `<small class="slot-product-credit">제품 사진: 각 브랜드</small>` : ""}
    `;
    card.append(box);
  }
  return card;
}

function feedbackCards(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "slot-feedback-list";
  const rows = [
    ["눈썹", "결 방향은 좋아요. 앞머리 쪽만 조금 더 연하게 풀면 자연스러워요."],
    ["아이라인", "꼬리 길이가 정답사진보다 살짝 길어요. 끝을 조금만 줄여 주세요."],
    ["입술", "중앙 컬러감은 잘 맞아요. 바깥 경계만 손끝으로 흐려 주세요."],
  ];
  for (const [name, copy] of rows) {
    const card = document.createElement("div");
    card.innerHTML = `<strong>${name}</strong><p>${copy}</p>`;
    wrap.append(card);
  }
  return wrap;
}

function saveCard(): HTMLElement {
  const card = document.createElement("div");
  card.className = "slot-save-card";
  card.innerHTML = `
    <div>
      <strong>오늘의 화장 기록</strong>
      <p>정답사진, 시도사진, 피드백을 한 장으로 저장해요.</p>
    </div>
    <span aria-hidden="true"></span>
  `;
  return card;
}

export function slotScreen<S>(spec: SlotSpec, deps: SlotDeps = {}): Screen<S> {
  const analyze = deps.analyze ?? analyzeRefPhoto;
  const shrink = deps.shrink ?? shrinkForUpload;
  return {
    mount(ctx: ScreenContext<S>) {
      const root = page(`slot-${spec.next === "partguide" ? "answer" : spec.next}`);
      let alive = true;
      let previewUrl: string | null = null;
      /** 받은 정답사진을 보여 주는 주소 — 화면을 떠날 때 놓는다 */
      let madeUrl: string | null = null;
      if (spec.next === "partguide") {
        let picked: File | null = null;
        const dropPreview = () => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          previewUrl = null;
        };
        const renderUpload = (warn?: string) => {
          resetPage(root);
          const apply = button("적용하기", () => {
            if (!picked) return;
            ctx.log.log({ name: "button", button: "answer_apply" });
            void run(picked);
          });
          apply.disabled = !picked;
          root.append(
            testMeta(spec.title, spec.owner, spec.todo),
            coach("따라 하고 싶은 화장 사진을 먼저 올려 주세요"),
            title("참고 사진 · 정답사진", "참고 사진을 올리면 정답사진을 만들어드릴게요"),
            uploadCard(previewUrl, (f) => {
              dropPreview();
              picked = f;
              previewUrl = URL.createObjectURL(f);
              renderUpload();
            }),
          );
          if (warn) root.append(uploadWarn(warn));
          root.append(apply);
        };
        const renderLoading = () => {
          resetPage(root);
          root.append(
            testMeta(spec.title, spec.owner, spec.todo),
            title("Beauty AI가 분석중입니다.", "참고 사진의 색감과 위치를 확인하고 있어요"),
            loadingCard(),
          );
          if (deps.makeAnswer) {
            const wait = document.createElement("p");
            wait.className = "muted slot-status";
            wait.textContent = MAKE_WAIT_TEXT;
            root.append(wait);
          }
        };
        /**
         * 사진 한 장을 재서 색조 팔레트까지 (이 폰 안에서). makeAnswer 가 있으면 이어서 서버에 정답사진을 만들어 달라고 한다 —
         * 얼굴을 못 찾은 참고 사진으로는 서버를 부르지 않는다
         */
        const run = async (file: File): Promise<void> => {
          renderLoading();
          let res: RefAnalysis | string;
          try {
            res = await analyze(file);
          } catch {
            res = "noCanvas";
          }
          if (!alive) return;
          if (typeof res === "string") {
            ctx.log.log({ name: "button", button: `answer_fail:${res}` });
            renderUpload(REF_FAIL_TEXT[res as keyof typeof REF_FAIL_TEXT]);
            return;
          }
          let made: Blob | null = null;
          if (deps.makeAnswer) {
            // 줄이지 못하면(구형 브라우저 등) 고른 사진 그대로 — 너무 크면 서버가 too_large 로 답한다
            const ref = await shrink(file).catch(() => file);
            if (!alive) return;
            const r = await deps.makeAnswer(ref);
            if (!alive) return;
            if (!r.ok) {
              ctx.log.log({ name: "button", button: `answer_make_fail:${r.why}` });
              renderUpload(makeFailText(r.why) ?? undefined);
              return;
            }
            ctx.log.log({ name: "button", button: "answer_make_ok" });
            made = r.picture;
            // 다른 사람 사진(참고 사진)은 정답사진을 만든 뒤 바로 놓는다 (서비스 정의서 원칙)
            picked = null;
            dropPreview();
          }
          setRefColors(res.colors);
          renderAnswer(res, made);
        };
        const renderAnswer = (res: RefAnalysis, made: Blob | null) => {
          if (madeUrl) URL.revokeObjectURL(madeUrl);
          madeUrl = made ? URL.createObjectURL(made) : null;
          resetPage(root);
          const read = Object.keys(res.colors).length;
          root.append(
            testMeta(spec.title, spec.owner, spec.todo),
            coach("정답사진이 완성됐어요. 이제 부위별로 따라 해볼게요"),
            title("정답사진 완성", "이 사진을 기준으로 화장 가이드가 만들어져요"),
            madeUrl ? answerPhotoCard(madeUrl, "정답사진") : answerPhotoCard(res.preview),
            colorPalette(res.colors, {
              step: "2.",
              title: "참고 사진의 색조 팔레트",
              note: read === 5 ? "올려 주신 사진에서 읽은 색이에요" : `올려 주신 사진에서 ${read}개 부위의 색을 읽었어요`,
            }),
            action(ctx as ScreenContext<unknown>, "다음 · 화장 가이드 보기", spec.next),
          );
        };
        renderUpload();
      } else if (spec.next === "feedback") {
        root.append(
          testMeta(spec.title, spec.owner, spec.todo),
          coach("화장을 다 했다면 같은 조건으로 한 번 더 찍어 주세요"),
          title("시도사진 촬영", "눈 뜬 사진과 감은 사진 2장을 자동으로 찍어요"),
          uploadCard(null, () => {}),
          action(ctx as ScreenContext<unknown>, "다음 · 피드백 확인하기", spec.next),
        );
      } else {
        root.append(
          testMeta(spec.title, spec.owner, spec.todo),
          coach("정답사진과 시도사진을 비교해서 말로 알려드릴게요"),
          title("피드백", "점수 없이, 어디가 잘 맞고 어디를 조정하면 되는지만 보여줘요"),
          feedbackCards(),
          action(ctx as ScreenContext<unknown>, "다음 · 저장하러 가기", spec.next),
        );
      }
      // 받아 둔 것 한 줄 (#316 시도사진) — 넘어온 칸에만 붙는다.
      // 참고 사진 칸은 resetPage 로 다시 그리므로 여기 붙이지 않는다 (그 칸엔 status 가 없다)
      if (spec.status) {
        const line = document.createElement("p");
        line.className = "muted slot-status";
        line.textContent = spec.status();
        root.append(line);
      }
      ctx.root.append(root);
      return () => {
        alive = false;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (madeUrl) URL.revokeObjectURL(madeUrl);
      };
    },
  };
}

export function partGuideSlot<S>(deps: PartGuideSlotDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const part = deps.getPart() ?? nextGuidePart(null);
      if (!part) return;
      const next = nextGuidePart(part);
      const root = page("slot-partguide");
      const guide = guideMock(part);
      // 실시간 가이드(예전 화면 4 — core/live-run 테두리 엔진)로 보내는 길. #334
      // 처음에는 사진 가이드가 보인다 — 카메라 권한을 묻지 않고 바로 볼 수 있게.
      // 카메라 켜고 끄기·잠금 풀기는 그 화면이 알아서 한다 (screens/live.ts)
      // 가이드 그림 바로 아래 · 색 칸 위 — 그림을 보다가 바로 누르는 자리
      guide.querySelector(".slot-color")?.before(liveButton("실시간 가이드로 보기", () => {
        ctx.log.log({ name: "button", button: `slot_live:${part}` });
        ctx.go("live");
      }));
      root.append(
        coach("정답사진에서 이 부위만 크게 잘라서 보여드릴게요"),
        title(PART_NAME[part], "점과 선을 기준으로 거울 앞에서 천천히 따라 해 주세요"),
        guide,
        button(next ? `다음 — ${PART_NAME[next]}` : "다음 · 시도사진 찍기", () => {
          ctx.log.log({ name: "button", button: `slot_next_part:${next ?? "attempt"}` });
          if (next) ctx.goPart(next);
          else ctx.go("attempt");
        }),
      );
      ctx.root.append(root);

      // 정답사진을 이 부위로 잘라 견본 그림 자리에 넣는다 (⑥ 잇기). 못 만들면 견본 그림으로 돌아간다 — 화면이 비지 않게
      const photo = guide.querySelector<HTMLElement>(".slot-guide-photo");
      if (!deps.getGuide || !photo || !hasPhotoGuide(part)) return;
      let alive = true;
      const mock = [...photo.children];
      const wait = document.createElement("p");
      wait.className = "muted slot-status";
      wait.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;margin:0;";
      wait.textContent = "가이드를 준비하고 있어요…";
      photo.replaceChildren(wait);
      const paint = deps.paintGuide ?? drawGuidePage;
      void deps.getGuide().then((r) => {
        if (!alive) return;
        const out = document.createElement("canvas");
        if (!r.ok || !paint(out, r.view, part)) { photo.replaceChildren(...mock); return; }
        out.style.cssText = "display:block;width:100%;height:auto;";
        // 견본용 틀(세로로 긴 칸 · 얼굴 모양 바탕)을 자른 그림 크기에 맞춘다
        photo.style.cssText = "min-height:0;flex:0 0 auto;background:#000;";
        photo.replaceChildren(out);
        if (!r.view.found.includes(part)) {
          const none = document.createElement("p");
          none.className = "muted slot-status";
          none.textContent = "정답사진에서 이 부위의 화장은 찾지 못했어요. 사진을 보고 따라 해 주세요.";
          photo.after(none);
        }
      }).catch(() => { if (alive) photo.replaceChildren(...mock); });
      return () => { alive = false; };
    },
  };
}

export function saveSlot<S>(deps: SaveSlotDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const root = page("slot-save");
      root.append(
        coach("결과를 저장한 뒤 세션 사진은 기기에서 지울게요"),
        title("저장 · 공유", "원하면 오늘의 결과를 폰에 남길 수 있어요"),
        saveCard(),
      );
      let busy = false;
      const finish = (): void => {
        void deps.clearAll().finally(() => ctx.go("done"));
      };
      root.append(button("끝내기", () => {
        if (busy) return;
        busy = true;
        ctx.log.log({ name: "button", button: "finish" });
        // 다 쓴 바로 그 순간에 묻는다. 화면을 넘긴 뒤에 물으면 잘 답해 주지 않는다
        if (deps.surveyUrl) {
          // 화면 칸(.screen)이 아니라 폰 틀(#app)에 붙인다 — 스크롤을 따라다니지 않게
          const host = ctx.root.closest("#app") ?? ctx.root;
          host.append(surveyModal({ url: deps.surveyUrl, log: ctx.log, onClose: finish }));
          return;
        }
        finish();
      }));
      ctx.root.append(root);
    },
  };
}
