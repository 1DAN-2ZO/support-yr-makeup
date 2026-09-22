// 평가 CLI 검증 (이슈 #33, 3-2) — eval/score/score_cli.mjs 를 실제로 띄워서 stdin → stdout 계약을 본다.
// 합성 얼굴을 PNG + 랜드마크 JSON 으로 써 두고, run.py 가 넘기는 모양 그대로 넣는다.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import type { RgbaImage } from "@core/color";
import { scorePart } from "@core/score-part";
import { BARE, LMS, guide, image, linerPaint, lipPaint, made } from "./helpers/synth-face";

const CLI = fileURLToPath(new URL("../../eval/score/score_cli.mjs", import.meta.url));

interface Row {
  id: string | null;
  part: string | null;
  label: string | null;
  pred: string | null;
  score: number | null;
  status: string | null;
  check_reason: string | null;
  codes: string[];
  ms: number;
  error: string | null;
}

function runCli(payload: unknown): { rows: Row[]; stderr: string; status: number | null } {
  const r = spawnSync(process.execPath, [CLI], { input: JSON.stringify(payload), encoding: "utf8", timeout: 60_000 });
  if (r.status !== 0) throw new Error(`exit ${r.status}\n${r.stderr}`);
  return { rows: JSON.parse(r.stdout) as Row[], stderr: r.stderr, status: r.status };
}

function savePng(path: string, im: RgbaImage): void {
  const png = new PNG({ width: im.w, height: im.h });
  png.data = Buffer.from(im.data as Uint8ClampedArray);
  writeFileSync(path, PNG.sync.write(png));
}

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "dhe-score-cli-"));
  savePng(join(dir, "bare.png"), image());
  savePng(join(dir, "liner.png"), image(linerPaint()));
  savePng(join(dir, "lip.png"), image(lipPaint));
  writeFileSync(join(dir, "lm.json"), JSON.stringify(LMS.map((p) => ({ x: p.x, y: p.y }))));
  writeFileSync(join(dir, "lm-norm.json"), JSON.stringify(LMS.map((p) => [p.x / 600, p.y / 600])));   // 0~1 정규화 + [x,y] 꼴
  writeFileSync(join(dir, "lm-short.json"), JSON.stringify(LMS.slice(0, 100)));
});

const item = (id: string, part: string, makeup: string, extra: Record<string, unknown> = {}) => ({
  id, person_id: "synth", part, bare: "bare.png", makeup, bare_lm: "lm.json", makeup_lm: "lm.json", label: "ok", ...extra,
});

describe("score_cli.mjs", () => {
  it("빈 items → [] 만 내고 끝난다 (골든이 비어 있을 때 run.py 가 넘기는 모양)", () => {
    expect(runCli({ items: [], data_dir: dir }).rows).toEqual([]);
  });

  it("가이드대로 그린 라이너 → scored · pred ok · 앱의 scorePart 와 같은 점수", () => {
    const { rows } = runCli({ items: [item("a", "liner", "liner.png")], data_dir: dir });
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r).toMatchObject({ id: "a", part: "liner", label: "ok", status: "scored", pred: "ok", check_reason: null, codes: [], error: null });
    expect(r.score).toBeGreaterThanOrEqual(90);
    // 평가가 앱과 같은 것을 재는가: TS 쪽 scorePart(시험용 가이드) 와 CLI(guide-poc.mjs) 점수가 같다
    const app = scorePart("liner", BARE, made(linerPaint()), guide).result;
    expect(r.score).toBe(app.score);
    expect(r.ms).toBeGreaterThan(0);
  });

  it("맨얼굴을 화장 사진으로 → check_only(faint) · pred null · 점수 없음", () => {
    const { rows } = runCli({ items: [item("b", "lip", "bare.png")], data_dir: dir });
    expect(rows[0]).toMatchObject({ status: "check_only", check_reason: "faint", pred: null, score: null, error: null });
  });

  it("쉐딩은 항상 check_only(contour); 정규화 [x,y] 랜드마크도 같은 결과", () => {
    const { rows } = runCli({
      items: [
        item("c", "contour", "lip.png"),
        item("d", "lip", "lip.png"),
        item("e", "lip", "lip.png", { bare_lm: "lm-norm.json", makeup_lm: "lm-norm.json" }),
      ],
      data_dir: dir,
    });
    expect(rows[0]).toMatchObject({ status: "check_only", check_reason: "contour", pred: null });
    expect(rows[1]?.status).toBe("scored");
    expect(rows[2]?.score).toBe(rows[1]?.score);
  });

  it("한 항목이 깨져도(파일 없음·점 부족·필드 누락) 나머지는 채점되고 오류는 행에 남는다", () => {
    const { rows, stderr } = runCli({
      items: [
        item("ok", "liner", "liner.png"),
        item("nofile", "liner", "missing.png"),
        item("short", "liner", "liner.png", { makeup_lm: "lm-short.json" }),
        { id: "nopart", bare: "bare.png", makeup: "liner.png", bare_lm: "lm.json", makeup_lm: "lm.json" },
      ],
      data_dir: dir,
    });
    expect(rows.map((r) => r.id)).toEqual(["ok", "nofile", "short", "nopart"]);
    expect(rows[0]?.status).toBe("scored");
    expect(rows[1]?.error).toMatch(/파일 없음/);
    expect(rows[2]?.error).toMatch(/478/);
    expect(rows[3]?.error).toMatch(/'part'/);
    expect(rows.slice(1).every((r) => r.pred === null && r.score === null)).toBe(true);
    expect(stderr).toMatch(/오류 3/);
  });
});
