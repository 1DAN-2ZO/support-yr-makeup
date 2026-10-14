/**
 * 옮긴 그림 작업 — 본 앱 `main.ts` 의 `movedJob` · `getMoved` 를 떼어 낸 것 (#454 B1 · B4).
 *
 * 시도사진을 찍으면 `start()` 로 뒤에서 만들기 시작하고, 피드백이 `get()` 으로 기다린다.
 * `MOVED_WAIT_MS` 를 넘기거나 실패하면 던진다 → `loadFeedback` 이 라이너만 「이번에는 볼 수 없었어요」로 두고
 * 나머지 부위는 그대로 보여 준다. 만드는 것 자체는 본 앱 `core/picture-maker` 가 한다 (같은 사진이면 한 번만, cancel 뒤 그림은 버림)
 */
import type { MakeResult, PictureMaker } from "@core/picture-maker";
import { within } from "@core/wait-limit";

/** 피드백이 옮긴 그림을 기다리는 한도 — 본 앱과 같다 (#415: 줄을 서면 60초까지 걸렸다) */
export const MOVED_WAIT_MS = 60_000;

export interface MovedJobDeps {
  maker: Pick<PictureMaker, "makeMoved" | "cancel">;
  /** 서버가 있을 때만 시작한다 — 없으면 시작하지 않고 `get()` 이 "not started" 로 던진다 */
  enabled: () => boolean;
  waitMs?: number;
}

export interface MovedJob {
  /** 시도사진을 찍었다 — 옛 것은 버리고 새로 만들기 시작 */
  start(): void;
  /** 맨얼굴이 바뀌었거나 다시 하기 — 만들던 것을 버린다 */
  cancel(): void;
  /** 피드백이 부른다. 없거나 늦거나 실패하면 던진다 */
  get(): Promise<Blob | null>;
}

export function createMovedJob(d: MovedJobDeps): MovedJob {
  let job: Promise<MakeResult> | null = null;
  return {
    start() {
      d.maker.cancel("moved");
      job = d.enabled() ? d.maker.makeMoved() : null;
      job?.catch(() => {}); // 실패는 get() 이 받는다 — 피드백 전에 끝난 실패가 경고로 새지 않게
    },
    cancel() {
      d.maker.cancel();
      job = null;
    },
    async get() {
      if (!job) throw new Error("moved: not started");
      const r = await within(job, d.waitMs ?? MOVED_WAIT_MS, null);
      if (!r?.ok) throw new Error(`moved: ${r ? r.why : "late"}`);
      return r.picture;
    },
  };
}
