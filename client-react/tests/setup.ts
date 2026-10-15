// 시험마다 깨끗한 상태로 — 폰 저장소(localStorage)와 가짜 fetch 를 비운다
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

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
