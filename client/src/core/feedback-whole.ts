/**
 * 새 흐름 화면 6 — 잰 값을 부위별 문장으로 바꾼다 (실험, 앱에 연결하지 않음). 점수는 없다.
 *
 * 정한 것 (2026-10-06, 사용자):
 *  - 부위마다 가장 중요한 말 하나 + 덧붙임 최대 하나. 순서 = 통째로 없음 > 한쪽 없음 > 자리 · 모양 > 진하기 > "정답과 비슷해요"
 *  - "잘 됐어요" · "확인만" · "안 발랐어요" 는 쓰지 않는다 — 못 잡은 것일 수 있어 단정하지 않는다.
 *    변화를 못 찾은 것은 어디에서인지만 붙인다: "정답 화장에서 …"(고칠 것 없음) / "내 화장에서 …"(고칠 것)
 *  - 고치는 방법(fix)은 방향만 말한다. 얼마나(몇 mm)는 말하지 않는다 — 그만큼 재지 못한다
 *  - 비슷한 색을 가리는 것은 하지 않는다. 볼은 했나 안 했나만. 라이너 꼬리는 눈 폭의 10% 미만이면 보지 않는다
 *  - 화면은 전체 얼굴 사진(정답 · 시도) + 이 문장들. 숫자는 보여 주지 않는다
 *
 * 기준값은 임시값이 아니라 잰 흔들림 폭에서 왔다 (eval/samples/shape/README.md 실험 19~36, 한 사람 · 얹은 화장 · 조건마다 3~4장):
 *  아무것도 안 한 맨얼굴의 양 -0.24~0.26(섀도우 눈 하나가 가장 넓다) / 한 것 0.42 위 · 입술 눈썹 흔들림 ±0.05 · 섀도우 눈 하나 ±0.25 · 라이너 꼬리 ±2~4%p
 * 양(amount) = 정답 그림의 변화 방향으로 바뀐 크기 ÷ 정답 변화의 크기 (0 = 맨얼굴 그대로 · 1 = 정답만큼)
 */

import { LM, at } from "./landmarks";
import { sampleForehead, type SampleFrame } from "./sampling";

/**
 * 사진 조건 (실험 37, eval/samples/shape/shot_condition.py): 판정이 맞았던 쌍은 이마 밝기 차 0.7 · 색 차 1.6 · 크기 비 0.93~1.00 · 기울기 차 1도,
 * 틀렸던 쌍은 크기 비 0.82 이하 · 1.44 이상(가짜 라이너 꼬리 · 눈썹 치우침), 색 차 6.8 · 밝기 차 3.1 · 기울기 6도(다른 날 · 다른 곳)
 * 밝기 · 색은 느슨하게 둔다 (실험 41): 실제 화장 시험에서 30분 사이 이마가 +5~6.6 밝아졌는데(장면 전체 — 조명이나 폰의 노출) 판정은 맞았다.
 * 주변 피부를 기준으로 재서 이 정도는 견딘다. 처음 값(2.5 · 4.5)은 8단계 중 6단계를 막았고, 판정이 틀렸던 쌍은 밝기를 안 봐도 크기 · 고개 각도에서 다 걸렸다
 */
export const CONDITION = { light: 10, color: 8, sizeLo: 0.87, sizeHi: 1.15, roll: 5, turn: 0.08 } as const;

export type ShotCondition = "light" | "size" | "pose";

/**
 * 맨얼굴과 시도사진이 견줄 만한 조건으로 찍혔나 — 안 맞으면 무엇이 다른지, 맞으면 null. 판정 앞에 두고, 걸리면 다시 찍게 한다.
 * 밝기 · 색 = 이마(화장을 안 하는 자리)의 Lab 차 · 크기 = 눈 폭 ÷ 사진 가로의 비 · 고개 = 두 눈을 잇는 선의 기울기와, 코끝이 두 눈 가운데에서 벗어난 정도(두 눈 사이 대비)
 * 이마가 머리카락에 가려 못 재면 밝기는 건너뛴다 (모르는 것이지 다른 것이 아니다)
 */
export function shotCondition(bare: SampleFrame, cur: SampleFrame): ShotCondition | null {
  const C = CONDITION, size = (f: SampleFrame): number => f.unit.eye / f.im.w, ratio = size(cur) / size(bare);
  if (ratio < C.sizeLo || ratio > C.sizeHi) return "size";
  const pose = (f: SampleFrame): { roll: number; x: number; y: number } => {
    const r = at(f.lm, LM.eyeA.outer), l = at(f.lm, LM.eyeB.outer), n = at(f.lm, 4), gap = Math.hypot(l.x - r.x, l.y - r.y) || 1;
    return { roll: (Math.atan2(l.y - r.y, l.x - r.x) * 180) / Math.PI, x: (n.x - (r.x + l.x) / 2) / gap, y: (n.y - (r.y + l.y) / 2) / gap };
  };
  const pb = pose(bare), pc = pose(cur);
  if (Math.abs(pc.roll - pb.roll) > C.roll || Math.abs(pc.x - pb.x) > C.turn || Math.abs(pc.y - pb.y) > C.turn) return "pose";
  const fb = sampleForehead(bare), fc = sampleForehead(cur);
  if (fb && fc && (Math.abs(fc.L - fb.L) > C.light || Math.hypot(fc.a - fb.a, fc.b - fb.b) > C.color)) return "light";
  return null;
}

export const FEEDBACK = {
  /**
   * 정답 그림의 변화가 이보다 작으면(Lab 거리) 그 부위는 견줄 것이 없다. 부위마다 다르다 — 다시 찍었을 때 그 부위가 흔들리는 크기의 3배쯤:
   * 실제 화장 시험(실험 38 · 40)의 맨얼굴끼리 흔들림은 입술 1~2 · 섀도우 약 1 · 눈썹 2.3. 모델이 만든 정답사진의 변화는 입술 7.3 · 섀도우 4.6 · 눈썹 4.2 였다
   * (전에는 전 부위 8 — 얹어 본 진한 화장에 맞춘 값이라 실제 정답사진이 전부 막혔다)
   */
  minTarget: { lip: 5, shadow: 3.5, brow: 6, cheek: 6 },
  /** 양이 이 아래면 변화를 못 찾은 것 */
  none: 0.3,
  /** 양이 이 아래면 옅다 — 정답의 절반. 그 위의 차이는 흔들림과 구분되지 않는다 */
  weak: 0.5,
  /** 볼은 맨얼굴도 0.3 쯤으로 읽힌다 (한 것 1.1) */
  cheekNone: 0.6,
  /** 입술선 바깥 띠: 평소 ±0.07, 넘치면 0.5 */
  lipOut: 0.25,
  /** 입꼬리 바깥 네모(좌우 따로): 실제 화장 시험에서 안 번진 단계 −0.35~0.16, 옆으로 번지게 한 쪽 0.38~0.60 (정답사진 0.01 · 0.02). 한 사람 · 한 번의 번짐으로 잡은 값 (실험 42) */
  lipSide: 0.3,
  /** 섀도우 눈꼬리 바깥: 정답대로 0.72~0.94 (정답 1.00), 더 빼면 1.18~1.32 */
  shadowOuter: 0.12,
  /** 눈썹 바로 아래 띠: 안 넓힌 것 0.10~0.15, 넓힌 것 0.76 */
  browBelow: 0.35,
  /** 눈썹 꼬리(눈썹 길이 비율): 흔들림 ±2%p. 정답과 이만큼 넘게 다르면 짧다 · 길다 */
  browTail: 0.1,
  /** 라이너 꼬리(눈 폭 비율): 이보다 짧으면 보지 않는다 · 정답과 이만큼 넘게 다르면 짧다 · 길다 */
  linerMin: 0.1,
  linerTol: 0.08,
} as const;

export type FeedbackPartId = "brow" | "shadow" | "liner" | "cheek" | "lip";
/** ok = 정답과 비슷 · fix = 고칠 것 · info = 견줄 것이 없거나 볼 수 없었다 */
export type FeedbackTone = "ok" | "fix" | "info";

export interface WholeMeasures {
  /** 사진 조건이 맨얼굴과 달라 판정하지 않는다 (shotCondition): 밝기 · 얼굴 크기 · 고개 각도 */
  condition?: ShotCondition;
  /** out = 입술선 바깥 띠의 양 · upper / lower = 윗입술 · 아랫입술의 양 · side = 입꼬리 바깥 네모의 양 (시도 · 정답) */
  lip?: {
    target: number; amount: number; out: number; outTarget: number; upper: number; lower: number;
    sideR?: number; sideL?: number; sideTargetR?: number; sideTargetL?: number;
  };
  /** higher = 정답이 안 칠한 위쪽 구역까지 칠했다 · outer = 눈꼬리 바깥 구역의 양 */
  shadow?: { target: number; amountR: number; amountL: number; higher: boolean; outer: number; outerTarget: number };
  /** below = 눈썹 바로 아래 띠의 양 */
  brow?: {
    target: number; amountR: number; amountL: number; below: number; belowTarget: number;
    /** 눈썹 꼬리를 맨얼굴보다 늘린 양 (눈썹 길이 비율) — 정답 · 시도. 머리카락 분할이 없으면 없다 */
    tailTargetR?: number; tailTargetL?: number; tailR?: number; tailL?: number;
  };
  cheek?: { target: number; amount: number };
  /** 꼬리 길이 (눈 폭 비율, 옮긴 그림에서 잰 것). null = 꼬리 없음 */
  liner?: { targetR: number | null; targetL: number | null; R: number | null; L: number | null };
}

export interface FeedbackLine {
  part: FeedbackPartId;
  name: string;
  tone: FeedbackTone;
  line: string;
  /** 덧붙이는 말 (있을 때만) */
  more?: string;
  /** 고치는 방법 — 방향만 (tone 이 fix 일 때만) */
  fix?: string;
}

export interface WholeFeedback {
  /** 사진 조건 때문에 판정하지 않았으면 그 안내 (이때 parts 는 비어 있다) */
  blocked?: string;
  parts: FeedbackLine[];
  /** 요약 묶음 — 부위 이름 */
  ok: string[];
  fix: string[];
}

const NAME: Record<FeedbackPartId, string> = { brow: "눈썹", shadow: "섀도우", liner: "라이너", cheek: "볼", lip: "입술" };
const ORDER: readonly FeedbackPartId[] = ["brow", "shadow", "liner", "cheek", "lip"];
const SAME = "정답과 비슷해요", NO_TARGET = "정답 화장에서 변화를 찾지 못했어요", NO_MINE = "내 화장에서 변화를 찾지 못했어요", UNSEEN = "이번에는 볼 수 없었어요";
const BLOCK = {
  light: "처음 찍은 사진과 밝기가 많이 달라요. 같은 자리에서 다시 찍어 주세요",
  size: "처음 찍은 사진과 얼굴 크기가 많이 달라요. 같은 거리에서 다시 찍어 주세요",
  pose: "처음 찍은 사진과 고개 각도가 많이 달라요. 정면을 보고 다시 찍어 주세요",
};
/** [문장, 고치는 방법] */
type Say = readonly [string, string];
const side = (k: "R" | "L"): string => (k === "R" ? "오른쪽" : "왼쪽");

function pick(part: FeedbackPartId, target: number | null, says: readonly Say[], missing?: Say): FeedbackLine {
  const base = { part, name: NAME[part] };
  if (target !== null && part !== "liner" && target < FEEDBACK.minTarget[part]) return { ...base, tone: "info", line: NO_TARGET };
  if (missing) return { ...base, tone: "fix", line: missing[0], fix: missing[1] };
  if (!says.length) return { ...base, tone: "ok", line: SAME };
  return { ...base, tone: "fix", line: says[0]![0], fix: says[0]![1], ...(says[1] ? { more: says[1][0] } : {}) };
}

/** 양쪽 값에서 한쪽만 빠졌으면 그쪽 */
const lost = (r: number, l: number): "R" | "L" | null => (r < FEEDBACK.none && l >= FEEDBACK.weak ? "R" : l < FEEDBACK.none && r >= FEEDBACK.weak ? "L" : null);

export function composeFeedback(m: WholeMeasures): WholeFeedback {
  if (m.condition) return { blocked: BLOCK[m.condition], parts: [], ok: [], fix: [] };
  const F = FEEDBACK, parts: FeedbackLine[] = [];
  for (const part of ORDER) {
    const says: Say[] = [];
    if (part === "lip" && m.lip) {
      const p = m.lip, none = p.amount < F.none;
      if (!none && p.upper < F.none && p.lower >= F.weak) says.push(["윗입술이 비었어요", "윗입술에도 발라 보세요"]);
      if (!none && p.lower < F.none && p.upper >= F.weak) says.push(["아랫입술이 비었어요", "아랫입술에도 발라 보세요"]);
      const smear = (["R", "L"] as const).filter((k) => (p[`side${k}`] ?? 0) - (p[`sideTarget${k}`] ?? 0) > F.lipSide);
      if (smear.length) says.push([`${smear.length === 1 ? `${side(smear[0]!)} ` : ""}입꼬리 옆으로 번졌어요`, "입꼬리 바깥을 닦아 정리해 보세요"]);
      if (p.out - p.outTarget > F.lipOut) says.push(["입술선 밖으로 나갔어요", "입술선 안쪽으로 정리해 보세요"]);
      if (!says.length && p.amount < F.weak) says.push(["정답보다 옅어요", "한 번 더 덧발라 보세요"]);
      parts.push(pick(part, p.target, says, none ? [NO_MINE, "입술을 발라 보세요"] : undefined));
    } else if (part === "shadow" && m.shadow) {
      const p = m.shadow, mean = (p.amountR + p.amountL) / 2, one = lost(p.amountR, p.amountL), none = Math.max(p.amountR, p.amountL) < F.none;
      if (one) says.push([`${side(one)} 눈이 비었어요`, `${side(one)} 눈에도 칠해 보세요`]);
      if (p.higher) says.push(["정답보다 높이 칠했어요", "눈두덩 위쪽을 덜어 내 보세요"]);
      if (p.outer - p.outerTarget > F.shadowOuter) says.push(["눈꼬리 바깥으로 더 뺐어요", "눈꼬리 바깥쪽을 덜어 내 보세요"]);
      // 눈 하나의 값은 ±0.25 흔들린다 — 옅다는 두 눈 평균으로만
      if (!says.length && mean < F.weak) says.push(["정답보다 옅어요", "한 번 더 덧발라 보세요"]);
      parts.push(pick(part, p.target, says, none ? [NO_MINE, "눈두덩에 섀도우를 칠해 보세요"] : undefined));
    } else if (part === "brow" && m.brow) {
      const p = m.brow, mean = (p.amountR + p.amountL) / 2, one = lost(p.amountR, p.amountL), none = Math.max(p.amountR, p.amountL) < F.none;
      if (one) says.push([`${side(one)} 눈썹이 비었어요`, `${side(one)} 눈썹도 그려 보세요`]);
      if (p.below - p.belowTarget > F.browBelow) says.push(["정답보다 아래로 두꺼워요", "눈썹 아래쪽을 정리해 보세요"]);
      if (p.belowTarget - p.below > F.browBelow) says.push(["정답보다 얇아요", "눈썹 아래쪽을 조금 더 채워 보세요"]);
      if (p.tailR !== undefined && p.tailL !== undefined && p.tailTargetR !== undefined && p.tailTargetL !== undefined) {
        // 꼬리 길이: 정답이 늘린 양과 견준다 (정답이 안 늘렸으면 0 과 견주는 셈 — 늘려 그렸으면 길다)
        const got = { R: p.tailR, L: p.tailL }, want = { R: p.tailTargetR, L: p.tailTargetL }, ks = ["R", "L"] as const;
        const short = ks.filter((k) => got[k] < want[k] - F.browTail), long = ks.filter((k) => got[k] > want[k] + F.browTail);
        const who = (list: readonly ("R" | "L")[]): string => (list.length === 2 ? "눈썹 꼬리가" : `${side(list[0]!)} 눈썹 꼬리가`);
        if (short.length) says.push([`${who(short)} 정답보다 짧아요`, "눈썹 꼬리를 조금 더 길게 빼 보세요"]);
        if (long.length) says.push([`${who(long)} 정답보다 길어요`, "눈썹 꼬리 끝을 조금 지워 보세요"]);
      }
      if (!says.length && mean < F.weak) says.push(["정답보다 옅어요", "조금 더 진하게 채워 보세요"]);
      parts.push(pick(part, p.target, says, none ? [NO_MINE, "눈썹을 그려 보세요"] : undefined));
    } else if (part === "cheek" && m.cheek) {
      parts.push(pick(part, m.cheek.target, [], m.cheek.amount < F.cheekNone ? [NO_MINE, "볼에 블러셔를 올려 보세요"] : undefined));
    } else if (part === "liner" && m.liner) {
      const p = m.liner, want = { R: p.targetR ?? 0, L: p.targetL ?? 0 }, got = { R: p.R ?? 0, L: p.L ?? 0 }, ks = (["R", "L"] as const).filter((k) => want[k] >= F.linerMin);
      if (!ks.length) { parts.push({ part, name: NAME[part], tone: "info", line: NO_TARGET }); continue; }
      const gone = ks.filter((k) => got[k] < F.linerMin);
      if (gone.length === ks.length) { parts.push(pick(part, null, [], ["내 화장에서 꼬리를 찾지 못했어요", "눈꼬리에서 바깥으로 꼬리를 빼 보세요"])); continue; }
      for (const k of gone) says.push([`${side(k)} 눈에 꼬리가 없어요`, `${side(k)} 눈에도 꼬리를 빼 보세요`]);
      const rest = ks.filter((k) => !gone.includes(k)), short = rest.filter((k) => got[k] < want[k] - F.linerTol), long = rest.filter((k) => got[k] > want[k] + F.linerTol);
      const who = (list: readonly ("R" | "L")[]): string => (list.length === ks.length ? "꼬리가" : `${side(list[0]!)} 꼬리가`);
      if (short.length) says.push([`${who(short)} 정답보다 짧아요`, "꼬리를 조금 더 길게 빼 보세요"]);
      if (long.length) says.push([`${who(long)} 정답보다 길어요`, "꼬리 끝을 조금 지워 보세요"]);
      parts.push(pick(part, null, says));
    } else if (part !== "cheek") parts.push({ part, name: NAME[part], tone: "info", line: UNSEEN });   // 볼은 잰 값이 있을 때만 줄을 낸다 (했나 안 했나만 보는 부위)
  }
  return { parts, ok: parts.filter((p) => p.tone === "ok").map((p) => p.name), fix: parts.filter((p) => p.tone === "fix").map((p) => p.name) };
}
