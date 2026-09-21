/**
 * 화면 2-b — 전체 완성 예상 (F-04). 모듈 ⑥.
 *
 * 고른 룩을 다 했을 때 어떤 얼굴이 되는지 한 장으로 보여 준다.
 * 이 그림은 세션 내내 남는다 — 부위별 완성본(화면 3)과 리뷰(화면 6)에서 다시 쓴다.
 *
 * 그림이 아직 없거나 실패해도 흐름은 막지 않는다. 가이드는 그림 없이도 돌아간다.
 */

import { lookById } from "../core/looks";
import type { LookJobSource } from "../core/look-jobs";
import { fullRenderUrl } from "../core/look-view";
import type { Screen, ScreenContext } from "./shell";

export interface FullRenderDeps {
  jobs: LookJobSource;
  getLookId: () => string | null;
}

export function fullRenderScreen<S>(deps: FullRenderDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const wrap = document.createElement("div");
      wrap.className = "fullrender";
      ctx.root.append(wrap);

      function draw(): void {
        const lookId = deps.getLookId();
        const url = fullRenderUrl(deps.jobs.current(), lookId);
        wrap.textContent = "";

        const h = document.createElement("h1");
        h.textContent = `${lookById(lookId).name} — 다 하면 이런 얼굴`;
        wrap.append(h);

        const figure = document.createElement("div");
        figure.className = "full-img" + (url ? "" : " empty");
        if (url) {
          const img = document.createElement("img");
          img.src = url;
          img.alt = "전체 완성 예상";
          figure.append(img);
        } else {
          figure.textContent = "준비 중";
        }
        wrap.append(figure);

        const note = document.createElement("p");
        note.className = "muted";
        // 완성 예상은 참고다. 실제 결과가 이것과 다르다고 점수가 깎이지 않는다
        note.textContent = url
          ? "참고용 그림이에요. 순서대로 하나씩 따라가 볼게요."
          : "그림은 아직이지만 그대로 시작할 수 있어요.";
        wrap.append(note);

        const row = document.createElement("div");
        row.className = "row";

        const back = document.createElement("button");
        back.type = "button";
        back.textContent = "다른 룩 보기";
        back.addEventListener("click", () => {
          ctx.log.log({ name: "button", button: "look_change" });
          ctx.go("looks");
        });

        const go = document.createElement("button");
        go.type = "button";
        go.className = "primary";
        go.textContent = "시작";
        go.addEventListener("click", () => {
          ctx.log.log({ name: "button", button: "guide_start" });
          ctx.go("guide");
        });

        row.append(back, go);
        wrap.append(row);
      }

      const stop = deps.jobs.subscribe(draw);
      draw();
      return stop;
    },
  };
}
