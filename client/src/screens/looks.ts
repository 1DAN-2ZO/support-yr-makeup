/**
 * 화면 2 — 룩 선택 (F-03, F-04). 모듈 ⑥.
 *
 * 서버가 룩 10개를 각각 그려서 보내 준다. 다 올 때까지 기다리지 않고
 * **끝난 것부터 고를 수 있게** 한다. 못 그린 룩은 "준비 중"으로 두고 넘어간다.
 * 고르면 제품 목록을 접지 않고 전부 보여 준다 (F-04).
 *
 * 표시 규칙은 `core/look-view.ts` 에 순수 함수로 있다. 여기는 DOM 만 그린다.
 */

import { LOOKS } from "../core/looks";
import type { LookJobSource } from "../core/look-jobs";
import { allUnavailable, tiles, type LookTile } from "../core/look-view";
import type { LookJob } from "../core/types";
import type { Screen, ScreenContext } from "./shell";

export interface LooksDeps {
  jobs: LookJobSource;
  getLookId: () => string | null;
  setLookId: (lookId: string) => void;
  /**
   * 누른 룩을 이 얼굴에 맞게 개인화한다 (규칙 계획 + VLM, 룩마다 한 번 — core/plan-queue.ts).
   * 끝나면 2-b(AR)로 간다. 안 주면 개인화 없이 바로 간다.
   */
  personalize?: (lookId: string) => Promise<void>;
}

export function looksScreen<S>(deps: LooksDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const wrap = document.createElement("div");
      wrap.className = "looks";
      ctx.root.append(wrap);

      // 끝난 작업을 한 번씩만 로그로 남긴다 — 같은 작업이 폴링마다 다시 오기 때문
      const logged = new Set<string>();
      /** 개인화를 기다리는 룩 — 마지막에 누른 것만 2-b 로 넘어간다 */
      let wanted: string | null = null;
      let failed = false;
      let alive = true;

      function draw(): void {
        const jobs = deps.jobs.current();
        logTerminal(jobs);

        const ts = tiles(LOOKS, jobs);
        const picked = deps.getLookId();
        wrap.textContent = "";
        wrap.append(head(ts));
        wrap.append(grid(ts, picked));
        if (failed) wrap.append(note("개인화하지 못했어요. 룩을 다시 눌러 주세요"));
        if (wanted) wrap.append(busy());
      }

      function logTerminal(jobs: readonly LookJob[]): void {
        for (const j of jobs) {
          if (j.status !== "done" && j.status !== "fallback" && j.status !== "error") continue;
          if (logged.has(j.job_id)) continue;
          logged.add(j.job_id);
          ctx.log.log({
            name: "look_job",
            look_id: j.look_id,
            ms: j.ms,
            identity_cos: j.identity.cos,
            error: j.status === "done" ? null : (j.error ?? j.status),
          });
        }
      }

      function head(ts: readonly LookTile[]): HTMLElement {
        const el = document.createElement("div");
        const h = document.createElement("h1");
        h.textContent = "어떤 룩으로 할까요";
        const p = document.createElement("p");
        p.className = "muted";
        // 다 죽었을 때만 다른 말을 한다. 몇 개 남았는지 숫자로 재촉하지 않는다
        p.textContent = allUnavailable(ts)
          ? "지금은 미리보기를 만들 수 없어요. 잠시 후 다시 열어 주세요."
          : "준비된 것부터 골라 볼 수 있어요.";
        el.append(h, p);
        return el;
      }

      function grid(ts: readonly LookTile[], picked: string | null): HTMLElement {
        const ul = document.createElement("ul");
        ul.className = "look-grid";
        for (const t of ts) ul.append(card(t, picked));
        return ul;
      }

      function card(t: LookTile, picked: string | null): HTMLElement {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "look-card" + (t.lookId === picked ? " picked" : "");
        btn.disabled = !t.selectable;
        btn.setAttribute("aria-pressed", String(t.lookId === picked));

        const thumb = document.createElement("div");
        thumb.className = `look-thumb st-${t.state}`;
        if (t.imageUrl) {
          const img = document.createElement("img");
          img.src = t.imageUrl;
          img.alt = `${t.name} 미리보기`;
          thumb.append(img);
        } else {
          thumb.textContent = t.note;
        }

        const name = document.createElement("span");
        name.className = "look-name";
        name.textContent = t.name;

        btn.append(thumb, name);
        btn.addEventListener("click", () => pick(t.lookId));
        li.append(btn);
        return li;
      }

      /** 룩을 누름 = 고름 → 개인화 → 2-b. 개인화 중에 다른 룩을 누르면 마지막 것만 넘어간다 */
      function pick(lookId: string): void {
        ctx.log.log({ name: "button", button: `look:${lookId}` });
        deps.setLookId(lookId);
        failed = false;
        if (!deps.personalize) {
          ctx.go("fullrender");
          return;
        }
        wanted = lookId;
        draw();
        deps.personalize(lookId).then(
          () => {
            if (!alive || wanted !== lookId) return;
            wanted = null;
            ctx.go("fullrender");
          },
          (e: unknown) => {
            if (!alive || wanted !== lookId) return;
            ctx.log.log({ name: "error", where: "personalize", msg: e instanceof Error ? e.message : String(e) });
            wanted = null;
            failed = true;
            draw();
          },
        );
      }

      /** "개인화 중입니다" — 화면 위에 덮는다. 누르는 것은 막지 않는다 (다른 룩으로 바꿀 수 있게) */
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
        box.append(t, p, bar);
        return box;
      }

      function note(text: string): HTMLElement {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = text;
        return p;
      }

      const stop = deps.jobs.subscribe(draw);
      draw();
      return () => {
        alive = false;
        stop();
      };
    },
  };
}
