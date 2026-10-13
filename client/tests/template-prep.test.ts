// 화장 템플릿 (#420): 미리 만들어 둔 색 팔레트 목록을 읽고, 번호 하나를 "참고 사진을 올리고 분석한 결과" 와 같은 모양으로 돌려준다
import { describe, expect, it } from "vitest";
import { loadTemplateManifest, parseTemplateManifest, templateAnalysis, templateNumber } from "@core/template-prep";
import type { TemplateEntry } from "@core/template-prep";

const name = { text: "로즈", base: "로즈", tone: "" as const, lch: { L: 50, C: 30, h: 10 } };
const color = (hex: string) => ({ hex, rgb: [200, 100, 120] as [number, number, number], name, product: { hex, rgb: [200, 100, 120] as [number, number, number], name }, n: 500 });

const entry = (over: Partial<TemplateEntry> = {}): TemplateEntry => ({
  id: "01",
  colors: { lip: color("#a05060") } as TemplateEntry["colors"],
  ...over,
});

const manifest = (items: unknown[] = [entry()]) => ({ version: "tpl-v1", items });

describe("parseTemplateManifest", () => {
  it("T1 올바른 목록은 그대로 읽는다", () => {
    const m = parseTemplateManifest(manifest([entry(), entry({ id: "02" })]));
    expect(m.version).toBe("tpl-v1");
    expect(m.items.map((t) => t.id)).toEqual(["01", "02"]);
  });

  it("T2 목록이 비었거나 모양이 틀리면 던진다 — 빈 화면을 조용히 보여 주지 않는다", () => {
    expect(() => parseTemplateManifest(null)).toThrow();
    expect(() => parseTemplateManifest({ version: "tpl-v1" })).toThrow();
    expect(() => parseTemplateManifest(manifest([]))).toThrow();
  });

  it("T3 번호가 겹치면 던진다", () => {
    expect(() => parseTemplateManifest(manifest([entry(), entry()]))).toThrow(/01/);
  });

  it("T4 필수 칸이 빠지면 어느 템플릿인지 말하고 던진다", () => {
    const bad = { id: "05" };
    expect(() => parseTemplateManifest(manifest([entry(), bad]))).toThrow(/05/);
    expect(() => parseTemplateManifest(manifest([{ colors: {} }]))).toThrow(/#1/);
  });

  it("T4b 번호가 숫자가 아니면 던진다 — 서버로 보내는 번호라서", () => {
    expect(() => parseTemplateManifest(manifest([entry({ id: "t01" })]))).toThrow(/t01/);
  });

  it("T5 버전이 없으면 던진다 — 나중에 템플릿을 바꿀 때 로그로 구분하려고", () => {
    expect(() => parseTemplateManifest({ items: [entry()] })).toThrow(/version/);
  });
});

describe("loadTemplateManifest", () => {
  it("T6 base 아래 templates/prep/templates.json 을 읽는다", async () => {
    const asked: string[] = [];
    const fetchFn = async (url: RequestInfo | URL) => { asked.push(String(url)); return new Response(JSON.stringify(manifest())); };
    const m = await loadTemplateManifest("/app/", fetchFn);
    expect(asked).toEqual(["/app/templates/prep/templates.json"]);
    expect(m.items).toHaveLength(1);
  });

  it("T7 못 읽으면 던진다", async () => {
    const fetchFn = async () => new Response("nope", { status: 404 });
    await expect(loadTemplateManifest("/", fetchFn)).rejects.toThrow(/404/);
  });
});

describe("templateNumber · templateAnalysis", () => {
  it("T8 번호는 숫자로 — 서버가 받는 1~10", () => {
    expect(templateNumber("03")).toBe(3);
    expect(templateNumber("10")).toBe(10);
  });

  it("T9 번호의 색을 분석 결과 모양으로 돌려준다 — 미리보기는 받은 주소 그대로", () => {
    const m = parseTemplateManifest(manifest([entry({ id: "03" })]));
    const a = templateAnalysis(m, "03", "/templates/03-autumn-mute.webp");
    expect(a?.preview).toBe("/templates/03-autumn-mute.webp");
    expect(a?.colors.lip?.hex).toBe("#a05060");
  });

  it("T10 목록에 없는 번호는 null — 화면이 없는 템플릿으로 서버를 부르지 않게", () => {
    const m = parseTemplateManifest(manifest());
    expect(templateAnalysis(m, "09", "x")).toBeNull();
  });
});
