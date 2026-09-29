/**
 * 버전 다섯 개 (ai-pipeline-v6.md 3절).
 * 로그 한 줄·서버 응답·결과 카드에 같이 찍혀서 "그때 뭐가 돌았나"를 알 수 있게 한다.
 *
 * 규칙: **버전은 코드가 아니라 설정에 있다.**
 *   look      `rules/looks.json` 의 version        ← 지금 여기서 읽는다
 *   score     `rules/score.json` 의 version        ← ③ 이 PARAMS 를 옮길 때 만든다. 그때까지 기본값
 *   faceshape 모델 파일 이름                        ← ⑤ 가 모델을 올릴 때 setVersions 로 알린다
 *   transfer  서버 `/health` 응답의 ver.transfer    ← ④ 호출 결과에서 setVersions 로 알린다
 *   app       빌드할 때 박는 git 짧은 해시           ← 배포 스크립트가 넣는다
 *
 * 각 모듈은 자기 버전만 `setVersions({ ... })` 로 알린다. 남의 칸은 건드리지 않는다.
 */

import { SCORE_VERSION } from "./score";
import { LOOKS_VERSION } from "./looks";
import type { Versions } from "./types";

/** 빌드 시 주입(`vite.config.ts` define). 없으면 dev */
declare const __APP_VERSION__: string | undefined;

function buildVersion(): string {
  try {
    return typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__ : "dev";
  } catch {
    return "dev";
  }
}

const DEFAULTS: Versions = {
  app: buildVersion(),
  score: SCORE_VERSION,   // rules/score.json (#44)
  look: LOOKS_VERSION,
  faceshape: "faceshape-rule-v1",
  transfer: "transfer-stub-v0",
};

let current: Versions = { ...DEFAULTS };

export function getVersions(): Versions {
  return { ...current };
}

/** 자기 모듈 버전만 알린다. 넘기지 않은 칸은 그대로 둔다 */
export function setVersions(patch: Partial<Versions>): Versions {
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string" && v) current[k as keyof Versions] = v;
  }
  return getVersions();
}

/** 테스트용 되돌리기 */
export function resetVersions(): Versions {
  current = { ...DEFAULTS };
  return getVersions();
}

/**
 * 결과 카드 구석에 찍는 한 줄 (F-11).
 * 사용자에게 뜻이 있는 글자는 아니지만, 사용자 실험 때 사진만 봐도 어느 판인지 안다.
 */
export function versionStamp(v: Versions = getVersions()): string {
  return `${v.app} · ${v.score} · ${v.look}`;
}
