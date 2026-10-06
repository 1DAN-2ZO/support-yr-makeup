/**
 * 새 흐름 UI 초안 (2026-10-06).
 * 실제 기능 화면이 붙기 전까지 사용자가 보는 형태로 흐름을 이어 준다.
 */

import type { ScreenId } from "@core/screens";
import { nextGuidePart } from "@core/screens";
import { PART_NAME } from "@core/score";
import type { PartId } from "@core/types";
import { colorPalette } from "./color-palette";
import { DEMO_REF_COLORS } from "./ref-demo";
import type { Screen, ScreenContext } from "./shell";

export interface SlotSpec {
  title: string;
  owner: string;
  todo: readonly string[];
  next: ScreenId;
}

export interface PartGuideSlotDeps {
  getPart: () => PartId | null;
}

export interface SaveSlotDeps {
  clearAll: () => Promise<unknown>;
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

function uploadCard(): HTMLElement {
  const card = document.createElement("div");
  card.className = "slot-upload";
  card.innerHTML = `
    <div class="slot-upload-main">
      <span aria-hidden="true"></span>
      <strong>참고 사진 업로드</strong>
      <em>정면 사진이면 가장 좋아요</em>
    </div>
  `;
  return card;
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

function answerPhotoCard(): HTMLElement {
  const card = document.createElement("div");
  card.className = "slot-answer-photo";
  card.innerHTML = `
    <div class="slot-answer-photo-frame">
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
  const read = part === "contour" ? undefined : DEMO_REF_COLORS[part];
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

export function slotScreen<S>(spec: SlotSpec): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const root = page(`slot-${spec.next === "partguide" ? "answer" : spec.next}`);
      let loadingTimer: number | null = null;
      if (spec.next === "partguide") {
        const renderUpload = () => {
          resetPage(root);
          root.append(
            testMeta(spec.title, spec.owner, spec.todo),
            coach("따라 하고 싶은 화장 사진을 먼저 올려 주세요"),
            title("참고 사진 · 정답사진", "참고 사진을 올리면 정답사진을 만들어드릴게요"),
            uploadCard(),
            button("적용하기", () => {
              ctx.log.log({ name: "button", button: "answer_apply" });
              renderLoading();
              loadingTimer = window.setTimeout(renderAnswer, 900);
            }),
          );
        };
        const renderLoading = () => {
          resetPage(root);
          root.append(
            testMeta(spec.title, spec.owner, spec.todo),
            title("Beauty AI가 분석중입니다.", "참고 사진의 색감과 위치를 확인하고 있어요"),
            loadingCard(),
          );
        };
        const renderAnswer = () => {
          if (loadingTimer !== null) {
            window.clearTimeout(loadingTimer);
            loadingTimer = null;
          }
          resetPage(root);
          root.append(
            testMeta(spec.title, spec.owner, spec.todo),
            coach("정답사진이 완성됐어요. 이제 부위별로 따라 해볼게요"),
            title("정답사진 완성", "이 사진을 기준으로 화장 가이드가 만들어져요"),
            answerPhotoCard(),
            // 색조 팔레트 — 지금은 더미. 업로드가 붙으면 analyzeRefPhoto() 결과로 바꾼다
            colorPalette(DEMO_REF_COLORS, { step: "2.", title: "참고 사진의 색조 팔레트", note: "올려 주신 사진에서 읽은 색이에요" }),
            action(ctx as ScreenContext<unknown>, "다음 · 화장 가이드 보기", spec.next),
          );
        };
        renderUpload();
      } else if (spec.next === "feedback") {
        root.append(
          testMeta(spec.title, spec.owner, spec.todo),
          coach("화장을 다 했다면 같은 조건으로 한 번 더 찍어 주세요"),
          title("시도사진 촬영", "눈 뜬 사진과 감은 사진 2장을 자동으로 찍어요"),
          uploadCard(),
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
      ctx.root.append(root);
      return () => {
        if (loadingTimer !== null) window.clearTimeout(loadingTimer);
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
      root.append(
        coach("정답사진에서 이 부위만 크게 잘라서 보여드릴게요"),
        title(PART_NAME[part], "점과 선을 기준으로 거울 앞에서 천천히 따라 해 주세요"),
        guideMock(part),
        button(next ? `다음 — ${PART_NAME[next]}` : "다음 · 시도사진 찍기", () => {
          ctx.log.log({ name: "button", button: `slot_next_part:${next ?? "attempt"}` });
          if (next) ctx.goPart(next);
          else ctx.go("attempt");
        }),
      );
      ctx.root.append(root);
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
      root.append(button("끝내기", () => {
        if (busy) return;
        busy = true;
        ctx.log.log({ name: "button", button: "finish" });
        void deps.clearAll().finally(() => ctx.go("done"));
      }));
      ctx.root.append(root);
    },
  };
}
