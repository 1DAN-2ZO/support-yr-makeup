/**
 * 화면 6 부위별 한 줄 — LLM 에 채점 수치를 **전부** 넘기면 어떻게 나오나 (#287 4차, 2026-10-05).
 * VLM → 텍스트 LLM 전환이 정해져(사진 없음) 자리를 다시 본다: partline.ts 는 요약한 사실 + 진단만 넘겼다.
 *
 *   raw     채점 기준(임계) + 부위마다 채점기가 잰 수치 전부 + 진단 코드
 *   nocode  채점 기준 + 수치 전부, 진단 코드는 주지 않음 — LLM 이 수치를 읽어 문제를 스스로 찾는다
 *
 * 둘 다 완료 부위 전부(잘된 부위 포함)에 한 줄을 받는다 — 잘된 부위도 수치로 구체적으로 칭찬하거나 기준에 가까운 값을 짚을 수 있나.
 * 답에 issues(문제 코드 목록)를 같이 받아 **수치를 맞게 읽었는지** 자동으로 센다 (진짜 = 채점 진단).
 */

import type { PartId, PartResult } from "../../client/src/core/types";
import { LOOKS } from "../../client/src/core/looks";
import { PARAMS } from "../../client/src/core/score";
import { type Session, issueCodesOf, nameOf, styleProblems, STYLE_GUIDE, CONTOUR_PRODUCTS_LIST } from "./comment";
import { LINE_MAX, gateLine, type LinerEye, type BrowSide } from "./partline";

export const RAW_PROMPT_VER = "rawline-v1";
const T = PARAMS.tol;
const BAND: Record<"shadow" | "cheek", [number, number]> = { shadow: [20, 65], cheek: [25, 60] };
type LookPart = Exclude<PartId, "contour">;

/** 부위마다 나올 수 있는 문제 코드 — 채점 코드(score.ts)가 내는 것 그대로 */
export const PART_CODES: Record<LookPart, string[]> = {
  liner: ["LINER_WING_HIGH_R", "LINER_WING_HIGH_L", "LINER_WING_LOW_R", "LINER_WING_LOW_L", "LINER_WING_SHORT_R", "LINER_WING_SHORT_L", "LINER_THICK", "LINER_THIN", "LINER_GAP_R", "LINER_GAP_L", "LINER_OUT_R", "LINER_OUT_L", "LINER_LR_DIFF"],
  brow: ["BROW_TAIL_SHORT_R", "BROW_TAIL_SHORT_L", "BROW_OUT_R", "BROW_OUT_L", "BROW_SPARSE", "BROW_LR_DIFF"],
  lip: ["LIP_OUT_UPPER", "LIP_OUT_LOWER", "LIP_UNDER", "LIP_LR_DIFF"],
  shadow: ["TONE_OVER", "TONE_UNDER", "SHADOW_DIR", "SHADOW_LR_DIFF_R", "SHADOW_LR_DIFF_L"],
  cheek: ["TONE_OVER", "TONE_UNDER", "CHEEK_LR_DIFF_R", "CHEEK_LR_DIFF_L"],
};

/** 채점 기준 — 이 값을 넘으면 그 코드로 진단한다 (rules/score.json · score.ts 의 임계 그대로) */
export const THRESHOLDS = `## 채점 기준 (길이 · 두께는 눈 폭에 대한 비율, 비율 값은 0~1)
- 아이라이너 (눈마다 R 오른쪽 · L 왼쪽)
  - wingDev(꼬리 높이 편차) > +${T.wingDev} → LINER_WING_HIGH_(R|L) · < −${T.wingDev} → LINER_WING_LOW_(R|L)
  - wingDrawn(그린 꼬리 길이) < wingGuide(가이드 꼬리 길이) − ${T.wingShort} → LINER_WING_SHORT_(R|L)
  - gapRatio(끊긴 비율) > 0.25 → LINER_GAP_(R|L) · overflow(테두리 밖 비율) > 0.35 → LINER_OUT_(R|L)
  - 두 눈 평균 thickness(두께) > guideThick + ${T.thickOver} → LINER_THICK · < guideThick − ${T.thickUnder} → LINER_THIN
  - lrDiff(좌우 꼬리 높이 차) > ${T.lrDiff} → LINER_LR_DIFF
- 눈썹 (좌우마다): tailCoverage(꼬리 채운 비율) < 0.4 → BROW_TAIL_SHORT_(R|L) · overflow > 0.3 → BROW_OUT_(R|L) · 좌우 평균 coverage(채운 비율) < 0.45 → BROW_SPARSE · |lrDiff(좌우 높이 차, + 면 오른쪽이 높음)| > 0.045 → BROW_LR_DIFF
- 입술: overU(윗입술 선 밖 비율) > 0.3 → LIP_OUT_UPPER · overL > 0.3 → LIP_OUT_LOWER · coverage(안쪽 채운 비율) < 0.5 → LIP_UNDER · lrGap(좌우 입꼬리 채운 차) > 0.35 → LIP_LR_DIFF
- 섀도우 · 볼터치: 진하기 지수 0~100. 좌우 평균이 band(목표) 위 → TONE_OVER · 아래 → TONE_UNDER · |오른쪽 − 왼쪽| ≥ 12 → SHADOW_LR_DIFF_(R|L) / CHEEK_LR_DIFF_(R|L) (R = 오른쪽이 진함)
- 섀도우 방향: direction 이 inner_darker(속눈썹 · 눈앞머리 쪽이 더 진함)이면 SHADOW_DIR (눈꼬리 쪽이 더 진해야 맞음)`;

const r3 = (v: unknown): unknown => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
const round = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r3(v)]));

/** 채점기가 잰 수치 전부 (가짜 세션: partline.fillMetrics 가 진단과 맞게 넣은 값) */
export function rawMetrics(p: PartResult): Record<string, unknown> {
  const m = p.metrics as Record<string, unknown>;
  if (p.partId === "liner" && m.perEye) {
    const e = m.perEye as Record<string, LinerEye>;
    return { R: round({ ...e.R }), L: round({ ...e.L }), lrDiff: r3(m.lrDiff) };
  }
  if (p.partId === "brow" && m.per) {
    const b = m.per as Record<string, BrowSide>;
    return { R: round({ ...b.R }), L: round({ ...b.L }), lrDiff: r3(m.lrDiff) };
  }
  if (p.partId === "lip") return round({ coverage: m.coverage, overU: m.overU, overL: m.overL, lrGap: m.lrGap });
  if ((p.partId === "shadow" || p.partId === "cheek") && p.lrIndex) {
    const out: Record<string, unknown> = { index: { left: p.lrIndex.left, right: p.lrIndex.right }, band: BAND[p.partId] };
    if (p.partId === "shadow") out.direction = p.diagnosisCodes.includes("SHADOW_DIR") ? "inner_darker" : "outer_darker";
    return out;
  }
  return {};
}

export const lineParts = (s: Session): PartResult[] => s.parts.filter((p) => p.partId !== "contour" && p.status === "passed");

export function rawPrompt(s: Session, withCodes: boolean): string {
  const look = LOOKS.find((l) => l.id === s.lookId);
  const blocks = s.parts.filter((p) => p.partId !== "contour").map((p) => {
    if (p.status !== "passed") return `### ${p.partId} (${nameOf(p.partId)}) — ${p.status === "skipped" ? "건너뜀" : `확인만 (${p.checkReason})`} · 한 줄은 쓰지 않음`;
    const intent = look?.rationale[p.partId as LookPart];
    const codes = withCodes ? `\n- 진단: ${issueCodesOf(p).join(", ") || "없음"}` : "";
    return `### ${p.partId} (${nameOf(p.partId)}) — 점수 ${p.score}${codes}
- 수치: ${JSON.stringify(rawMetrics(p))}${intent ? `\n- 이 화장의 의도: ${intent}` : ""}`;
  });
  return `당신은 메이크업 코치입니다. 사용자가 "${s.lookName}" 화장을 따라 하고 받은 채점 결과입니다. 사진은 없고, 채점기가 잰 수치가 전부입니다.
완료한 부위마다 화면에 보일 **한 줄 평**을 씁니다 — 옆에서 봐 주는 선생님처럼.

${THRESHOLDS}

## 이 화장에 쓰는 제품
${[...(look?.products ?? []), ...CONTOUR_PRODUCTS_LIST].map((x) => `- ${x}`).join("\n")}

${STYLE_GUIDE}

## 부위
${blocks.join("\n\n")}

## 쓸 것 — 완료한 부위마다
- issues: ${withCodes ? "위 진단 코드 그대로" : "위 채점 기준으로 수치를 직접 보고, 기준을 넘은 문제 코드 (없으면 빈 목록)"}
- line: 한 줄 평 (${LINE_MAX}자 이내, 한두 문장)
  - 문제가 있으면: 가장 크게 어긋난 것부터 — 얼마나("조금" · "꽤" · "절반쯤" 같은 말)와 어떻게(위 제품으로). 왼쪽 · 오른쪽을 바꾸지 않습니다
  - 문제가 없으면: 수치로 본 잘된 점을 구체적으로 칭찬합니다. 기준에 가까운 값이 있으면 다음에 조심할 점을 한마디
  - 그 부위 이야기만 씁니다. 숫자와 퍼센트는 쓰지 않습니다. 목록에 없는 도구는 쓰지 않습니다

## 답
JSON 하나만 답합니다. 코드 블록 없이.`;
}

export function rawSchema(s: Session): object {
  const props = Object.fromEntries(
    lineParts(s).map((p) => [
      p.partId,
      {
        type: "object",
        properties: {
          issues: { type: "array", items: { enum: PART_CODES[p.partId as LookPart] }, maxItems: 4 },
          line: { type: "string", minLength: 8, maxLength: LINE_MAX },
        },
        required: ["issues", "line"],
        additionalProperties: false,
      },
    ]),
  );
  return { type: "object", properties: props, required: Object.keys(props), additionalProperties: false };
}

/** 잘된 부위인데 문제를 말함 — "없어요 · 않아요 · 맞아요" 같은 부정이 없으면 */
const PROBLEM = /짧아|짧게 끝|번졌|번져|나갔|두꺼워|가늘어|끊겼|끊어|비어 보|비었|처졌|올라갔|진해요|진한 편|옅어요|연해요|달라요|부족/;
function goodLineProblems(line: string): string[] {
  const out: string[] = [];
  for (const clause of line.split(/[,.!?]/)) if (PROBLEM.test(clause) && !/없|않|안 |맞|고르|딱/.test(clause)) { out.push("잘된 부위에 문제를 지어냄"); break; }
  return out;
}

/** 첫 JSON 덩어리 — 생각 모드 등으로 형식 강제를 끈 답도 읽는다 */
function parseLoose(raw: string): Record<string, { issues?: string[]; line?: string }> | null {
  try { return JSON.parse(raw); } catch { /* 아래 */ }
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
}

export interface RawPart { part: string; truth: string[]; said: string[]; tp: number; fp: number; fn: number; line: string; ok: boolean; reasons: string[]; good: boolean }

/** 답 채점 — 문제 코드 맞춤(정밀도 · 재현율) + 한 줄 검사 (문제 부위는 partline.gateLine, 잘된 부위는 지어냄 · 말투) */
export function scoreRaw(s: Session, raw: string): { parsed: boolean; parts: RawPart[] } {
  const j = parseLoose(raw);
  const parts = lineParts(s).map((p): RawPart => {
    const truth = issueCodesOf(p);
    const got = j?.[p.partId] ?? {};
    const said = [...new Set((got.issues ?? []).filter((c) => PART_CODES[p.partId as LookPart].includes(c)))];
    const tp = said.filter((c) => truth.includes(c)).length;
    const line = (got.line ?? "").trim();
    let reasons: string[];
    if (truth.length) reasons = gateLine(s, p, line).reasons;
    else {
      reasons = [];
      if (line.length < 8 || line.length > LINE_MAX) reasons.push("길이");
      if (/[0-9%]/.test(line)) reasons.push("숫자");
      if (/[A-Za-z]/.test(line)) reasons.push("영어 섞임");
      reasons.push(...styleProblems(p.partId, line), ...goodLineProblems(line));
    }
    return { part: p.partId, truth, said, tp, fp: said.length - tp, fn: truth.length - tp, line, ok: reasons.length === 0, reasons, good: !truth.length };
  });
  return { parsed: !!j, parts };
}
