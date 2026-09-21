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
import { allUnavailable, anySelectable, lookDetail, tiles, type LookTile } from "../core/look-view";
import type { LookJob } from "../core/types";
import type { Screen, ScreenContext } from "./shell";

export interface LooksDeps {
  jobs: LookJobSource;
  getLookId: () => string | null;
  setLookId: (lookId: string) => void;
}

export function looksScreen<S>(deps: LooksDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const wrap = document.createElement("div");
      wrap.className = "looks";
      ctx.root.append(wrap);

      // 끝난 작업을 한 번씩만 로그로 남긴다 — 같은 작업이 폴링마다 다시 오기 때문
      const logged = new Set<string>();

      function draw(): void {
        const jobs = deps.jobs.current();
        logTerminal(jobs);

        const ts = tiles(LOOKS, jobs);
        const picked = deps.getLookId();
        wrap.textContent = "";
        wrap.append(head(ts));
        wrap.append(grid(ts, picked));
        if (picked) wrap.append(detail(picked));
        wrap.append(startRow(ts, picked));
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
        h.textContent = "어떤 느낌으로 할까요?";
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
        btn.addEventListener("click", () => {
          ctx.log.log({ name: "button", button: `look:${t.lookId}` });
          deps.setLookId(t.lookId);
          draw();
        });
        li.append(btn);
        return li;
      }

      /** 고른 룩의 제품 목록 — 접기 없이 전부 (F-04) */
      function detail(lookId: string): HTMLElement {
        const { look, products } = lookDetail(lookId);
        const box = document.createElement("section");
        box.className = "look-detail";
        const h = document.createElement("h2");
        h.textContent = `${look.name} — 쓰는 것`;
        const ul = document.createElement("ul");
        for (const p of products) {
          const li = document.createElement("li");
          li.textContent = p;
          ul.append(li);
        }
        box.append(h, ul);
        return box;
      }

      function startRow(ts: readonly LookTile[], picked: string | null): HTMLElement {
        const row = document.createElement("div");
        row.className = "row";
        const go = document.createElement("button");
        go.type = "button";
        go.className = "primary";
        go.textContent = "이 룩으로 시작";
        // 고르지 않았거나 아직 아무것도 안 왔으면 못 누른다
        go.disabled = !picked || !anySelectable(ts);
        go.addEventListener("click", () => {
          ctx.log.log({ name: "button", button: "look_start" });
          ctx.go("fullrender");
        });
        row.append(go);
        return row;
      }

      const stop = deps.jobs.subscribe(draw);
      draw();
      return stop;
    },
  };
}
