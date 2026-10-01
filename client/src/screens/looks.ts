/**
 * 화면 2 — 룩 선택 (F-03, F-04). 모듈 ⑥.
 *
 * 화장 10개를 처음부터 전부 보여 준다 — 대표 이미지(없으면 색 견본)와 이름 (2026-09-29: Stable-Makeup 을 빼서
 * 기다릴 서버 그림이 없다). 누르면 "개인화 중입니다" → VLM 이 이 얼굴에 맞춘 계획 → 2-b(AR).
 *
 * 표시 규칙은 `core/look-view.ts` 에 순수 함수로 있다. 여기는 DOM 만 그린다.
 */

import { LOOKS } from "../core/looks";
import { catalogTiles, type CatalogTile } from "../core/look-view";
import { VlmFailure } from "../core/vlm-client";
import type { Screen, ScreenContext } from "./shell";

export interface LooksDeps {
  getLookId: () => string | null;
  setLookId: (lookId: string) => void;
  /**
   * 누른 룩을 이 얼굴에 맞게 개인화한다 (VLM 이 정하고 규칙 관문이 거름, 룩마다 한 번 — core/plan-queue.ts · vlm-flow.ts).
   * 끝나면 2-b(AR)로 간다. 안 주면 개인화 없이 바로 간다.
   */
  personalize?: (lookId: string) => Promise<void>;
  /** 이미 개인화한 화장인가 — 그러면 기다림 화면 없이 바로 2-b (화장마다 한 번) */
  isPersonalized?: (lookId: string) => boolean;
  /**
   * "개인화 중입니다" 를 최소 이만큼은 보여 준다(ms, 기본 0). 규칙 계획은 순식간이라 안 보이고 지나갔다 (2026-09-29 폰).
   * 사용자가 "내 얼굴에 맞추는 단계" 가 있다는 걸 알아야 2-b 의 근거 문장이 이어진다
   */
  minBusyMs?: number;
}

export function looksScreen<S>(deps: LooksDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const wrap = document.createElement("div");
      wrap.className = "looks";
      ctx.root.append(wrap);

      /** 개인화를 기다리는 룩 — 마지막에 누른 것만 2-b 로 넘어간다 */
      let wanted: string | null = null;
      /** 누를 때마다 새 번호 — 취소하고 같은 화장을 다시 눌러도 앞 요청이 넘어가지 않게 */
      let ticket = 0;
      /** 개인화 실패 안내 (없으면 null) */
      let failed: string | null = null;
      let alive = true;

      const ts = catalogTiles(LOOKS);

      function draw(): void {
        const picked = deps.getLookId();
        wrap.textContent = "";
        wrap.append(head());
        wrap.append(grid(ts, picked));
        if (failed) wrap.append(note(failed));
        if (wanted) wrap.append(busy());
      }

      function head(): HTMLElement {
        const el = document.createElement("div");
        el.className = "looks-head";
        el.innerHTML = `
          <div class="nudy-logo looks-logo" aria-label="nudy">
            <span>nudy</span>
            <i aria-hidden="true"></i>
          </div>
          <div class="looks-coach">
            <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
            <div><span>오늘 원하는 메이크업 무드를 골라주세요</span><i aria-hidden="true"></i></div>
          </div>
        `;
        const h = document.createElement("h1");
        h.textContent = "템플릿 선택";
        const p = document.createElement("p");
        p.textContent = "누르면 내 얼굴에 맞춰 자동으로 조정해요";
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
        btn.style.setProperty("--look-a", t.swatch[0] ?? "#ff9bac");
        btn.style.setProperty("--look-b", t.swatch[1] ?? "#ffd8df");
        btn.style.setProperty("--look-c", t.swatch[2] ?? "#f5d0b8");

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

        const meta = document.createElement("span");
        meta.className = "look-meta";
        meta.textContent = "mood look";

        btn.append(thumb, name, meta);
        btn.addEventListener("click", () => pick(t.lookId));
        li.append(btn);
        return li;
      }

      /** 룩을 누름 = 고름 → 개인화 → 2-b. 개인화 중에 다른 룩을 누르면 마지막 것만 넘어간다 */
      function pick(lookId: string): void {
        ctx.log.log({ name: "button", button: `look:${lookId}` });
        deps.setLookId(lookId);
        failed = null;
        if (!deps.personalize || deps.isPersonalized?.(lookId)) {
          ctx.go("fullrender");
          return;
        }
        wanted = lookId;
        const my = ++ticket;
        draw();
        const minWait = new Promise<void>((r) => setTimeout(r, deps.minBusyMs ?? 0));
        Promise.all([deps.personalize(lookId), minWait]).then(
          () => {
            if (!alive || ticket !== my) return;
            wanted = null;
            ctx.go("fullrender");
          },
          (e: unknown) => {
            if (!alive || ticket !== my) return;
            ctx.log.log({ name: "error", where: "personalize", msg: e instanceof Error ? e.message : String(e) });
            wanted = null;
            failed = e instanceof VlmFailure && e.reason === "busy"
              ? "지금 사람이 많아요. 잠시 후 다시 눌러 주세요"
              : "지금 개인화를 할 수 없어요. 잠시 후 다시 눌러 주세요";
            draw();
          },
        );
      }

      /** "개인화 중입니다" — 한 페이지로 덮는다. "다른 화장 고르기" 로 돌아가면 끝나도 넘어가지 않는다 (계획은 큐에 남아 다음엔 바로) */
      function busy(): HTMLElement {
        const box = document.createElement("div");
        box.className = "personalizing";
        box.setAttribute("role", "status");
        const t = document.createElement("strong");
        t.textContent = "개인화 중입니다…";
        const p = document.createElement("p");
        p.textContent = "이 얼굴에 맞게 화장을 조정하고 있어요";
        const bar = document.createElement("div");
        bar.className = "wait-bar";
        bar.append(document.createElement("span"));
        const back = document.createElement("button");
        back.type = "button";
        back.className = "ghost";
        back.textContent = "다른 화장 고르기";
        back.addEventListener("click", () => {
          ctx.log.log({ name: "button", button: "personalize_cancel" });
          wanted = null;
          ticket++;
          draw();
        });
        box.append(t, p, bar, back);
        return box;
      }

      function note(text: string): HTMLElement {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = text;
        return p;
      }

      draw();
      return () => {
        alive = false;
      };
    },
  };
}
