/**
 * 화면 6 — 전체 리뷰 · 결과 저장 · 끝내기 (F-10, F-11). 모듈 ⑥.
 *
 * 합산은 ③ 의 `review.ts` 가 한다. 여기는 그 결과를 그리고, 카드로 내보내고, 세션을 지운다.
 *
 * 화면에 **숫자는 합산 점수와 부위 점수뿐이다.** 기준 표기("5개 중 4개")도, 보정이 얼마나
 * 깎였는지도 보여 주지 않는다 (F-10). 대칭·조화 보정은 안에서만 돈다.
 */

import { computeSummary, reviewLine } from "../core/review";
import { PART_NAME } from "../core/score";
import type { SessionStore } from "../core/session-store";
import { versionStamp } from "../core/versions";
import type { PartId, PartResult, SessionSummary } from "../core/types";
import {
  anchorDownload,
  barRatio,
  partValueText,
  renderCard,
  saveCard,
  type CardInput,
  type SaveOutcome,
  type ShareEnv,
} from "./result-card";
import type { Screen, ScreenContext } from "./shell";

export interface ReviewDeps {
  /** 세션에서 부위 결과를 뽑는다 (①의 toReviewParts) */
  getParts: () => readonly PartResult[];
  getLookName: () => string;
  /** 맨얼굴 기준과 지금 조명. 둘 다 있어야 조명 차를 본다 */
  lightingNote: () => string | null;
  store: Pick<SessionStore, "clearAll" | "loadImage">;
  /** 공유·내려받기 환경. 안 주면 브라우저 것을 쓴다 */
  shareEnv?: ShareEnv;
  /** 카드를 만들 수 없을 때도 화면은 떠야 한다 */
  makeCard?: (input: CardInput) => Promise<Blob | null>;
}

const SAVE_TEXT: Record<SaveOutcome, string> = {
  shared: "공유 창에서 저장을 눌러 주세요",
  downloaded: "받은 파일에 저장했어요",
  cancelled: "저장을 취소했어요",
  unavailable: "이 브라우저에서는 저장할 수 없어요. 화면을 캡처해 주세요",
};

function browserShareEnv(): ShareEnv {
  const nav = navigator as Navigator & {
    canShare?: (d: unknown) => boolean;
    share?: (d: unknown) => Promise<void>;
  };
  const env: ShareEnv = { download: anchorDownload };
  if (typeof nav.canShare === "function") env.canShare = (d) => nav.canShare!(d);
  if (typeof nav.share === "function") env.share = (d) => nav.share!(d);
  return env;
}

export function reviewScreen<S>(deps: ReviewDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const parts = deps.getParts();
      const summary = computeSummary(parts);
      const note = deps.lightingNote();

      // 카드는 **지금** 만든다. 버튼을 누른 뒤에 만들면 iOS 에서 제스처가 끊겨 공유가 안 열린다
      let card: Blob | null = null;
      const make = deps.makeCard ?? renderCard;
      let alive = true;

      const wrap = document.createElement("div");
      wrap.className = "review";
      ctx.root.append(wrap);

      wrap.append(scoreBlock(summary));
      if (note) wrap.append(line("muted lighting-note", note));
      const photos = photoRow();
      wrap.append(photos);
      wrap.append(partList(parts, ctx));

      const msg = line("muted save-msg", "");
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "primary";
      saveBtn.textContent = "결과 저장";
      saveBtn.disabled = true;

      const endBtn = document.createElement("button");
      endBtn.type = "button";
      endBtn.textContent = "끝내기";

      const row = document.createElement("div");
      row.className = "row";
      row.append(endBtn, saveBtn);
      wrap.append(row, msg);

      saveBtn.addEventListener("click", () => {
        ctx.log.log({ name: "button", button: "save_result" });
        // await 하지 않는다 — 제스처 안에서 share 가 바로 열려야 한다
        void saveCard(card, "danghwaeung.jpg", deps.shareEnv ?? browserShareEnv()).then((out) => {
          if (alive) msg.textContent = SAVE_TEXT[out];
        });
      });

      endBtn.addEventListener("click", () => {
        ctx.log.log({ name: "button", button: "finish" });
        ctx.log.log({ name: "session_end", reason: "finish", last_screen: "review" });
        endBtn.disabled = true;
        saveBtn.disabled = true;
        // 세션과 로그가 같은 DB 라 clearAll 하나로 둘 다 지워진다 (F-11)
        void deps.store.clearAll().then(() => {
          if (alive) ctx.go("done");
        });
      });

      // 사진과 카드는 비동기다. 화면은 먼저 뜬다
      void (async () => {
        const [bare, after] = await Promise.all([
          loadImage(deps.store, "bare"),
          loadImage(deps.store, "lastframe"),
        ]);
        if (!alive) return;
        fillPhoto(photos, "bare", bare);
        fillPhoto(photos, "after", after);

        card = await make({
          summary,
          parts,
          lookName: deps.getLookName(),
          bare,
          after,
          stamp: versionStamp(),
          lightingNote: note,
        });
        if (!alive) return;
        saveBtn.disabled = false;
        if (!card) msg.textContent = SAVE_TEXT.unavailable;
      })();

      return () => {
        alive = false;
      };
    },
  };
}

function line(cls: string, text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = cls;
  p.textContent = text;
  return p;
}

/** 합산 — 숫자만. 잰 부위가 없으면 "—" 와 안내 한 줄 */
function scoreBlock(s: SessionSummary): HTMLElement {
  const box = document.createElement("div");
  box.className = "total";
  const n = document.createElement("strong");
  n.className = "total-num";
  n.textContent = s.total == null ? "—" : String(s.total);
  box.append(n);
  if (s.total == null) {
    box.append(line("muted", "잰 부위가 없어요. 부위를 눌러 다시 해 볼 수 있어요"));
  }
  return box;
}

function photoRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "photo-row";
  for (const [which, label] of [
    ["bare", "맨얼굴"],
    ["after", "지금"],
  ] as const) {
    const fig = document.createElement("figure");
    fig.className = "photo";
    fig.dataset.which = which;
    const slot = document.createElement("div");
    slot.className = "photo-slot";
    const cap = document.createElement("figcaption");
    cap.textContent = label;
    fig.append(slot, cap);
    row.append(fig);
  }
  return row;
}

function fillPhoto(row: HTMLElement, which: "bare" | "after", img: HTMLImageElement | null): void {
  const slot = row.querySelector<HTMLElement>(`.photo[data-which="${which}"] .photo-slot`);
  if (!slot) return;
  slot.textContent = "";
  if (img) slot.append(img);
  else slot.textContent = "없음";
}

/** 부위 6줄. 탭하면 그 부위 완성본으로 (F-10) */
function partList<S>(parts: readonly PartResult[], ctx: ScreenContext<S>): HTMLElement {
  const ul = document.createElement("ul");
  ul.className = "part-list";
  for (const p of parts) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "part-row";

    const name = document.createElement("span");
    name.className = "part-name";
    name.textContent = PART_NAME[p.partId as PartId];

    const val = document.createElement("span");
    val.className = "part-val";
    // 카드와 같은 함수를 쓴다 — 화면과 저장본에 다른 값이 뜨면 안 된다
    val.textContent = partValueText(p);

    const bar = document.createElement("span");
    bar.className = "part-bar";
    const fill = document.createElement("span");
    fill.className = "part-fill";
    fill.style.width = `${barRatio(p) * 100}%`;
    bar.append(fill);

    const say = document.createElement("span");
    say.className = "part-say muted";
    say.textContent = reviewLine(p);

    btn.append(name, bar, val, say);
    btn.addEventListener("click", () => {
      ctx.log.log({ name: "button", button: `review_part:${p.partId}` });
      ctx.goPart(p.partId);
    });
    li.append(btn);
    ul.append(li);
  }
  return ul;
}

async function loadImage(
  store: Pick<SessionStore, "loadImage">,
  key: "bare" | "lastframe",
): Promise<HTMLImageElement | null> {
  const data = await store.loadImage(key);
  if (!data) return null;
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  img.alt = key === "bare" ? "맨얼굴" : "지금";
  // 디코딩을 기다리지 않는다 — 화면이 먼저 뜨는 게 낫다. 카드는 그려질 때 다시 읽는다
  return img;
}
