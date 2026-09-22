// 부위별 아핀 워핑 조립 — poc/look-tryon/client/app.js 의 warpPolygon 포팅 검증.
// Canvas2D는 jsdom에 없으니 warpPolygon이 호출하는 컨텍스트 메서드 시퀀스만 검증(POC와 같은 계약)
import { describe, expect, it } from "vitest";
import { warpPolygon } from "@core/tryon";

describe("warpPolygon", () => {
  it("삼각형 개수만큼 clip·setTransform·drawImage를 호출한다", () => {
    const calls: string[] = [];
    const ctx = {
      save: () => calls.push("save"),
      beginPath: () => calls.push("beginPath"),
      moveTo: () => calls.push("moveTo"),
      lineTo: () => calls.push("lineTo"),
      closePath: () => calls.push("closePath"),
      clip: () => calls.push("clip"),
      setTransform: () => calls.push("setTransform"),
      drawImage: () => calls.push("drawImage"),
      restore: () => calls.push("restore"),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    warpPolygon(ctx, square, square, {} as CanvasImageSource, 0.8);

    expect(calls.filter((c) => c === "drawImage")).toHaveLength(4); // 정점 4개 -> 팬 삼각분할 4번
    expect(calls.filter((c) => c === "clip")).toHaveLength(4);
    expect(calls.filter((c) => c === "setTransform")).toHaveLength(4);
    expect(calls.filter((c) => c === "save")).toHaveLength(4);
    expect(calls.filter((c) => c === "restore")).toHaveLength(4);
  });

  it("퇴화 삼각형(아핀 못 푸는 경우)은 건너뛴다", () => {
    const calls: string[] = [];
    const ctx = {
      save: () => calls.push("save"),
      beginPath: () => calls.push("beginPath"),
      moveTo: () => calls.push("moveTo"),
      lineTo: () => calls.push("lineTo"),
      closePath: () => calls.push("closePath"),
      clip: () => calls.push("clip"),
      setTransform: () => calls.push("setTransform"),
      drawImage: () => calls.push("drawImage"),
      restore: () => calls.push("restore"),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    // 모든 점이 한 직선 위 -> centroid까지 포함해도 모든 삼각형이 퇴화
    const line: [number, number][] = [[0, 0], [1, 0], [2, 0]];
    warpPolygon(ctx, line, line, {} as CanvasImageSource, 1);

    expect(calls.filter((c) => c === "drawImage")).toHaveLength(0);
  });
});
