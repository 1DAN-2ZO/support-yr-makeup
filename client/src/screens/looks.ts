/**
 * [옛 흐름 · 지금 안 씀] 화면 2 화장 고르기 (화장 10종) — 2026-10-06 에 흐름이 바뀌면서 이 화면으로 가는 길이 없어졌다.
 * 지우지 않고 둔다 — 등록(main.ts) · 테스트도 그대로다. 목록과 근거: client/OLD-FLOW.md
 */
/**
 * 화면 2 — 룩 선택 (F-03, F-04). 모듈 ⑥.
 *
 * 화장 10개를 처음부터 전부 보여 준다 — 대표 이미지(없으면 색 견본)와 이름 (2026-09-29: Stable-Makeup 을 빼서
 * 기다릴 서버 그림이 없다). 누르면 바로 2-b(AR).
 * (2026-10-05: "개인화 중입니다" 기다림 단계를 뺐다 — 얼굴을 재서 화장을 바꾸지 않는다, personalize.standardPlan)
 *
 * 표시 규칙은 `core/look-view.ts` 에 순수 함수로 있다. 여기는 DOM 만 그린다.
 */

import { LOOKS } from "../core/looks";
import { catalogTiles, type CatalogTile } from "../core/look-view";
import type { Screen, ScreenContext } from "./shell";

export interface LooksDeps {
  getLookId: () => string | null;
  setLookId: (lookId: string) => void;
}

export function looksScreen<S>(deps: LooksDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const wrap = document.createElement("div");
      wrap.className = "looks";
      ctx.root.append(wrap);

      const ts = catalogTiles(LOOKS);

      function draw(): void {
        const picked = deps.getLookId();
        wrap.textContent = "";
        wrap.append(head());
        wrap.append(grid(ts, picked));
      }

      function head(): HTMLElement {
        const el = document.createElement("div");
        const h = document.createElement("h1");
        h.textContent = "어떤 화장으로 할까요";
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = "누르면 내 얼굴에 입혀 볼 수 있어요.";
        el.append(h, p);
        return el;
      }

      function grid(ts: readonly CatalogTile[], picked: string | null): HTMLElement {
        const ul = document.createElement("ul");
        ul.className = "look-grid";
        for (const t of ts) ul.append(card(t, picked));
        return ul;
      }

      function card(t: CatalogTile, picked: string | null): HTMLElement {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "look-card" + (t.lookId === picked ? " picked" : "");
        btn.disabled = !t.selectable;
        btn.setAttribute("aria-pressed", String(t.lookId === picked));

        const thumb = document.createElement("div");
        thumb.className = "look-thumb";
        if (t.imageUrl) {
          const img = document.createElement("img");
          img.src = t.imageUrl;
          img.alt = `${t.name} 대표 이미지`;
          thumb.append(img);
        } else {
          // 대표 이미지가 오기 전 — 그 화장의 입술·볼·섀도 색
          const sw = document.createElement("span");
          sw.className = "swatch";
          for (const c of t.swatch) {
            const dot = document.createElement("i");
            dot.style.background = c;
            sw.append(dot);
          }
          thumb.append(sw);
        }

        const name = document.createElement("span");
        name.className = "look-name";
        name.textContent = t.name;

        btn.append(thumb, name);
        btn.addEventListener("click", () => pick(t.lookId));
        li.append(btn);
        return li;
      }

      /** 화장을 누름 = 고름 → 2-b */
      function pick(lookId: string): void {
        ctx.log.log({ name: "button", button: `look:${lookId}` });
        deps.setLookId(lookId);
        ctx.go("fullrender");
      }

      draw();
    },
  };
}
