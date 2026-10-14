/**
 * 판 이름 묶음 — 사용 기록 한 줄마다 붙는다 (본 앱 `core/versions.ts` 와 같은 모양, #454 A4).
 *
 * 본 앱 것을 그대로 쓰지 않는 까닭: 본 앱 `versions.ts` 는 본 앱 `score` · `looks` 를 끌어와
 * 이 버전의 `core/score` · `core/looks` 와 **같은 코드가 두 벌** 묶이게 된다. 값은 어차피 같은
 * `rules/*.json` 의 version 이라 여기서 이 버전의 core 로 똑같이 만든다. 본 앱이 `transfer` 등을 바꾸면 여기도 맞춘다
 */
import { LOOKS_VERSION } from "../core/looks";
import { SCORE_VERSION } from "../core/score";
import type { Versions } from "../core/types";

/** 빌드할 때 vite.config.ts 가 넣는다 (git 짧은 해시). 개발 서버에서는 "dev" */
declare const __APP_VERSION__: string | undefined;

function buildVersion(): string {
  try {
    return typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__ : "dev";
  } catch {
    return "dev";
  }
}

const VERSIONS: Versions = {
  app: buildVersion(),
  score: SCORE_VERSION,
  look: LOOKS_VERSION,
  faceshape: "faceshape-rule-v1",
  transfer: "transfer-stub-v0",
};

export function getVersions(): Versions {
  return { ...VERSIONS };
}
