/**
 * 새 흐름 뼈대의 빈 자리 화면 (2026-10-06, 모듈 ⑥). 담당이 진짜 화면을 올리기 전까지 흐름이 끊기지 않게 —
 * 무엇이 들어올 자리인지 · 누가 만드는지 보여 주고 "다음" 으로 이어 간다. 진짜 화면이 오면 main.ts 에서 등록만 바꾼다.
 * 화면 순서는 core/screens.ts SCREEN_ORDER, 흐름은 docs/service-definition-v6.md.
 */

import type { ScreenId } from "@core/screens";
import { nextGuidePart } from "@core/screens";
import { PART_NAME } from "@core/score";
import type { PartId } from "@core/types";
import type { Screen, ScreenContext } from "./shell";

export interface SlotSpec {
  /** 이 자리에 올 화면 */
  title: string;
  /** 만드는 담당 (화면에 그대로 보인다) */
  owner: string;
  /** 이 자리에서 할 일 — 한 줄씩 */
  todo: readonly string[];
  /** "다음" 이 가는 화면 */
  next: ScreenId;
}

function frame(ctx: ScreenContext<unknown>, title: string, owner: string, todo: readonly string[]): HTMLElement {
  const box = document.createElement("div");
  box.className = "placeholder slot";
  const h = document.createElement("h1");
  h.textContent = title;
  const who = document.createElement("p");
  who.className = "muted";
  who.textContent = `아직 자리만 있어요 — ${owner} 가 만들어요`;
  const ul = document.createElement("ul");
  for (const t of todo) {
    const li = document.createElement("li");
    li.textContent = t;
    ul.append(li);
  }
  box.append(h, who, ul);
  ctx.root.append(box);
  return box;
}

function nextButton(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "primary";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

/** 할 일만 보여 주고 다음 화면으로 */
export function slotScreen<S>(spec: SlotSpec): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const box = frame(ctx as ScreenContext<unknown>, spec.title, spec.owner, spec.todo);
      box.append(nextButton("다음", () => {
        ctx.log.log({ name: "button", button: `slot_next:${spec.next}` });
        // 부위 가이드로 갈 때는 첫 부위부터 — 진행 칩과 같은 goPart 라 지금 부위가 정해진다
        const first = spec.next === "partguide" ? nextGuidePart(null) : null;
        if (first) ctx.goPart(first);
        else ctx.go(spec.next);
      }));
    },
  };
}

export interface PartGuideSlotDeps {
  /** 지금 부위. 없으면 첫 부위 */
  getPart: () => PartId | null;
}

/** 4 부위 가이드 자리 — 부위마다 반복. "다음" 은 다음 부위(진행 칩과 같은 goPart), 마지막 부위면 5 시도사진으로 */
export function partGuideSlot<S>(deps: PartGuideSlotDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const part = deps.getPart() ?? nextGuidePart(null);
      if (!part) return;
      const box = frame(ctx as ScreenContext<unknown>, `4 부위 가이드 — ${PART_NAME[part]}`, "②", [
        "정답사진을 이 부위로 자른 정지 사진",
        "그 위에 점 · 선 — 어디에, 얼마나 그릴지 (③ 의 부위별 떠내기)",
      ]);
      const next = nextGuidePart(part);
      box.append(nextButton(next ? `다음 — ${PART_NAME[next]}` : "다음 — 시도사진 찍기", () => {
        ctx.log.log({ name: "button", button: `slot_next_part:${next ?? "attempt"}` });
        if (next) ctx.goPart(next);
        else ctx.go("attempt");
      }));
    },
  };
}

export interface SaveSlotDeps {
  /** 폰에 남은 사진 · 기록을 지운다 (화면 6 리뷰의 끝내기와 같은 것) */
  clearAll: () => Promise<unknown>;
}

/** 7 저장 · 공유 자리 — 저장은 아직 없다. "끝내기" 는 폰에 남은 것을 다 지운 뒤 끝 화면으로 (끝 화면이 "지웠어요" 라고 말한다) */
export function saveSlot<S>(deps: SaveSlotDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const box = frame(ctx as ScreenContext<unknown>, "7 저장 · 공유", "⑥", [
        "최종 결과와 피드백을 내 폰에 저장 · 공유 (우리 서버에는 저장 안 함)",
      ]);
      let busy = false;
      box.append(nextButton("끝내기", () => {
        if (busy) return;
        busy = true;
        ctx.log.log({ name: "button", button: "finish" });
        void deps.clearAll().finally(() => ctx.go("done"));
      }));
    },
  };
}
