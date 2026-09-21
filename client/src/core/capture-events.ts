/**
 * 촬영 모듈의 이벤트 찍기 (1-5): consent · capture{shot, ok, retry, reason} · restore.
 * 전부 공통 log() 로만 나간다 (사진·좌표 금지). 장별 재촬영 횟수는 여기서 센다 → 1-2 표의 "장별 재촬영 횟수".
 */

import type { Logger } from "./log";
import type { GateFail } from "./types";
import type { ShotId } from "./flow";

export interface CaptureEvents {
  /** 동의 화면 결과 */
  consent(ok: boolean): void;
  /** 촬영 시도 하나. ok=false 면 reason 에 처음 걸린 조건. 같은 장을 다시 찍을 때마다 retry 가 오른다 */
  shot(shot: ShotId, ok: boolean, reason: GateFail | null): void;
  /** 틀린 장을 지우고 다시 찍기로 함 — 다음 shot 이벤트의 retry 에 반영 */
  retake(shot: ShotId): void;
  /** 앱이 돌아왔을 때 복원 결과 */
  restore(ok: boolean, hadImages: boolean): void;
  /** 장별 재촬영 횟수 (측정용 읽기) */
  retries(): Readonly<Record<ShotId, number>>;
}

const ZERO: Record<ShotId, number> = { front_open: 0, front_closed: 0, left_45: 0, right_45: 0 };

export function createCaptureEvents(logger: Logger): CaptureEvents {
  const retries: Record<ShotId, number> = { ...ZERO };
  return {
    consent(ok) {
      logger.log({ name: "consent", ok });
    },
    shot(shot, ok, reason) {
      logger.log({ name: "capture", shot, ok, retry: retries[shot], reason });
    },
    retake(shot) {
      retries[shot] += 1;
    },
    restore(ok, hadImages) {
      logger.log({ name: "restore", ok, had_images: hadImages });
    },
    retries() {
      return retries;
    },
  };
}
