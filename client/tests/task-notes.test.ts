// 작업의 답에서 사용 기록에 남길 것 읽기 (모듈 ⑥) — 숫자와 짧은 이름만. 사진 · 문장은 남기지 않는다
import { describe, expect, it } from "vitest";
import type { MakeResult } from "@core/picture-maker";
import type { SaveKit } from "@screens/feedback-card";
import type { FeedbackLoad } from "@screens/feedback-source";
import type { GuideLoad } from "@screens/guide-source";
import type { RefAnalysis } from "@screens/ref-analyze";
import { noteOfFeedback, noteOfGuide, noteOfMake, noteOfRef, noteOfSave, noteOfShrink } from "@screens/task-notes";

const blob = (bytes: number): Blob => new Blob([new Uint8Array(bytes)]);

describe("작업 기록에 남길 것", () => {
  it("TN1 그림 만들기 — 됐으면 서버가 알려 준 시간 셋과 받은 크기, 못 했으면 까닭", () => {
    const ok: MakeResult = { ok: true, picture: blob(20480), ms: 21000, queueMs: 12000, fluxMs: 8600 };
    expect(noteOfMake(ok)).toEqual({ ok: true, gen_ms: 21000, queue_ms: 12000, flux_ms: 8600, kb: 20 });
    expect(noteOfMake({ ok: true, picture: blob(1024), ms: null })).toEqual({ ok: true, gen_ms: null, queue_ms: undefined, flux_ms: undefined, kb: 1 });
    // 서버가 한 말(message)은 남기지 않는다 — 까닭 이름만
    expect(noteOfMake({ ok: false, why: "rejected", message: "얼굴 사진에서 얼굴을 못 찾았어요." })).toEqual({ ok: false, why: "rejected" });
  });

  it("TN2 부위 가이드 — 테두리를 찾은 부위 수, 못 만들었으면 무엇이 없었나", () => {
    const ok = { ok: true, view: { found: ["liner", "lip", "cheek"] } } as unknown as GuideLoad;
    expect(noteOfGuide(ok)).toEqual({ ok: true, n: 3 });
    expect(noteOfGuide({ ok: false, missing: "answer_size" })).toEqual({ ok: false, why: "answer_size" });
  });

  it("TN3 피드백 — 본 시도사진 장 수. 다시 찍기로 끝났으면 blocked, 옮긴 그림을 못 썼으면 moved_failed", () => {
    const view = (over: object): FeedbackLoad => ({ ok: true, view: { frames: 5, movedFailed: false, feedback: { parts: [], ok: [], fix: [] }, ...over } } as unknown as FeedbackLoad);
    expect(noteOfFeedback(view({}))).toEqual({ ok: true, n: 5, why: null });
    expect(noteOfFeedback(view({ feedback: { blocked: "조명이 많이 달라요", parts: [], ok: [], fix: [] } }))).toEqual({ ok: true, n: 5, why: "blocked" });
    expect(noteOfFeedback(view({ movedFailed: true }))).toEqual({ ok: true, n: 5, why: "moved_failed" });
    expect(noteOfFeedback({ ok: false, missing: "attempt" })).toEqual({ ok: false, why: "attempt" });
  });

  it("TN4 결과 한 장 — 만든 그림 크기. 그림을 못 만들었으면 no_card", () => {
    expect(noteOfSave({ card: blob(159744), usesShareSheet: true, save: async () => "shared" } as SaveKit)).toEqual({ ok: true, kb: 156 });
    expect(noteOfSave({ card: null, usesShareSheet: false, save: async () => "unavailable" } as SaveKit)).toEqual({ ok: false, why: "no_card" });
    expect(noteOfSave(null)).toEqual({ ok: false, why: "nothing" });
  });

  it("TN5 참고 사진 읽기 — 색을 읽은 부위 수, 못 읽었으면 까닭 이름", () => {
    const ok = { colors: { lip: {}, shadow: {} }, preview: "data:,", w: 1, h: 1 } as unknown as RefAnalysis;
    expect(noteOfRef(ok)).toEqual({ ok: true, n: 2 });
    expect(noteOfRef("noFace")).toEqual({ ok: false, why: "noFace" });
  });

  it("TN6 참고 사진 줄이기 — 줄인 뒤 크기", () => {
    expect(noteOfShrink(blob(33792))).toEqual({ ok: true, kb: 33 });
  });
});
