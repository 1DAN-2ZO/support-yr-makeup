/**
 * 아주 작은 CSV 한 줄 읽기·쓰기 (스파이크 skin-batch-probe).
 * Deep Armocromia 의 사진 이름에는 쉼표가 있다 ("Felicity Jones, 4.png") — 쉼표로 그냥 나누면 열이 밀린다.
 * 따옴표 칸(안의 쉼표 · 큰따옴표 두 개 = 따옴표 하나)만 지원한다. 칸 안 줄바꿈은 지원하지 않는다.
 */

export function csvSplit(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 쉼표 · 따옴표가 든 칸만 따옴표로 감싼다 */
export const csvCell = (s: string): string => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
