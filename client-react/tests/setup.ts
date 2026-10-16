// 시험마다 깨끗한 상태로 — 폰 저장소(localStorage)와 가짜 fetch 를 비운다
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// 시험은 한국어 글로 견준다 — LangProvider 가 처음 말을 폰 설정(navigator.languages)에서 읽으므로 ko 로 고정한다 (i18n/index.ts detectLang)
Object.defineProperty(window.navigator, "languages", { value: ["ko-KR"], configurable: true });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear();
  } catch {
    /* 없으면 없는 대로 */
  }
});
