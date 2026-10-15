/**
 * 부위별 제품 추천 — 뽑은 색의 **계열 이름**으로 고른다 (2026-10-07).
 *
 * 색상값(hex)으로 제품을 고르지 않는다. 제품마다 정확한 색상값을 구할 길이 없기
 * 때문이다. 공개된 색조 제품 색상 데이터는 해외 브랜드 중심이고, 국내 쇼핑몰은
 * robots.txt 로 제품 정보 긁기를 막아 두었다. 그래서 color-name.ts 가 지은
 * **계열 이름**("브릭" · "MLBB" · "라이트브라운")에 그 계열 제품을 이어 붙인다.
 *
 * `checked: true` 는 **전지원이 올리브영에서 직접 보고 확인한 것**이다. 없는 것은
 * 2026-10-07 검색으로 제품이 실제로 있다는 것만 확인했고 호수는 확인하지 못했다.
 *
 * 호수(shade)는 **색이 하나뿐인 제품에만** 적는다. 여러 호수로 나오는 제품에 하나를
 * 적으면 다른 호수를 쓰려는 사람에게 틀린 안내가 된다. 비어 있으면 화면에
 * "○○ 계열 호수로" 라고만 나간다 — 틀린 호수를 말하는 것보다 안 말하는 것이 낫다.
 *
 * 사진은 client/public/products/ 에 둔다 (320px, 15KB 안팎).
 *
 * **제품 목록은 이 파일에 없다** (2026-10-15). `product-picks.data.ts` 에 있고,
 * 그 파일은 nudy-db 가 만든다 (`nudy-db/export.py`). 손으로 적던 제품 19개가 디비의
 * 제품 62개로 바뀌었다 — 호수마다 색을 담을 자리가 코드 파일에는 없었기 때문이다
 * (까닭은 nudy-db/schema.sql 머리글). 제품을 더하거나 고치려면 디비 쪽을 고친다.
 * 위에 적은 규칙(계열 이름으로 고른다 · checked · 호수가 하나뿐일 때만 hex)은 그대로이고,
 * export.py 가 그 규칙대로 뽑는다.
 */

import { COLOR_FAMILY, PALETTE, hexToRgb } from "./color-family";
import type { PalettePart } from "./color-family";
import { deltaE, rgbToLab } from "./color";
import type { Lab } from "./color";
import { FAMILY_REF, PRODUCT_PICKS } from "./product-picks.data";

export { PRODUCT_PICKS };

export interface ProductPick {
  /** 이 제품을 권할 색 계열. color-name.ts 의 base 이름과 같은 말을 쓴다 */
  families: readonly string[];
  brand: string;
  name: string;
  /** 제형·도구. "왜 이것인지" 를 한눈에 — 펜슬인지 팔레트인지 틴트인지 */
  kind: string;
  /** 호수(색상 이름). 확인되면 채운다. 비어 있으면 계열 이름만 안내한다 */
  /**
   * 한 제품을 통(팟·호수 묶음)마다 쪼개 넣었을 때, 그 묶음의 이름. 안 쪼갠 제품은 없다.
   *
   * 화면은 **한 묶음에서 하나만** 보여 준다 — 팔레트는 사람이 사는 단위가 통이라 통마다
   * 한 줄로 두는데, 그러면 같은 팔레트가 여러 번 떠서 "왜 같은 게 두 개지" 가 된다.
   * 어느 통인지는 `name` 으로 그대로 보여 준다 (통까지 알려 주는 편이 쓸모 있다).
   */
  group?: string;
  shade?: string;
  /**
   * 이 호수의 색 (소문자 #rrggbb, sRGB). **호수 하나당 한 줄**로 적는다 — 나중에 피부색·참고 사진 색과
   * 이어 보려고 모으는 값이다. 화면에는 나가지 않는다 (위의 "계열 이름만 말한다" 는 그대로).
   * 쓰려면 `shade` 도 같이 적는다 (`validateHex` 가 시험에서 확인). 칩 색인지 발색 사진인지 같은 출처는 줄 위 코멘트로 적는다.
   * 색이 여럿 든 제품(팔레트 · 듀얼 · 겸용)은 칸을 한 줄로 못 적으니 hex 를 적지 않는다.
   */
  hex?: string;
  /**
   * 제품 사진. 파일로 넣으면 작게 줄인 data URL, 주소로 넣으면 그 주소 그대로.
   * 주소로 넣은 것은 그쪽이 지우거나 막으면 안 보일 수 있다. 없으면 색 네모만 나간다.
   */
  photo?: string;
  /** 전지원이 실물·판매 페이지로 확인한 것 */
  checked?: true;
}

const HEX_RE = /^#[0-9a-f]{6}$/;

/**
 * 호수 색(hex) 줄의 규칙을 검사해 문제를 글로 돌려준다. 비어 있으면 통과.
 * - hex 는 소문자 #rrggbb, shade 가 같이 있어야 한다
 * - 같은 (부위 · 브랜드 · 제품 · 호수) 에 hex 줄이 둘이면 안 된다
 * 제품 줄을 더한 사람이 오타를 시험에서 바로 보게 하려는 것 (tests/product-picks-hex.test.ts)
 */
export function validateHex(picks: Readonly<Record<PalettePart, readonly ProductPick[]>> = PRODUCT_PICKS): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const [part, list] of Object.entries(picks) as [PalettePart, readonly ProductPick[]][]) {
    list.forEach((p, i) => {
      const at = `${part} ${i + 1}번째 (${p.brand} ${p.name}${p.shade ? ` ${p.shade}` : ""})`;
      if (p.hex === undefined) return;
      if (!HEX_RE.test(p.hex)) problems.push(`${at}: hex 가 소문자 #rrggbb 가 아님 (${JSON.stringify(p.hex)})`);
      if (!p.shade?.trim()) problems.push(`${at}: hex 가 있으면 shade(호수 이름)도 적어야 함`);
      const key = `${part}|${p.brand}|${p.name}|${p.shade ?? ""}`;
      const first = seen.get(key);
      if (first !== undefined) problems.push(`${at}: ${first}번째와 같은 호수에 hex 가 또 있음`);
      else seen.set(key, i + 1);
    });
  }
  return problems;
}

/**
 * 그 색 계열에 맞는 제품.
 *
 * 맞는 것이 없으면 **색이 가장 가까운 계열**의 제품을 준다. 계열을 잘게 쪼갤수록
 * 제품이 없는 계열이 생기는데, 그때 그냥 첫 번째 제품을 주면 엉뚱한 색을 권하게 된다.
 * (`뮤트 모브` 를 찾는데 오렌지 틴트를 주는 식)
 */
export function pickProduct(part: PalettePart, family: string): ProductPick | null {
  return pickProducts(part, [family], 1)[0]?.pick ?? null;
}

export interface Picked {
  pick: ProductPick;
  /** 이 제품이 걸린 계열. 화면에 "○○ 계열 호수로" 로 쓴다 */
  family: string;
}

/**
 * 제품을 **여러 개** 고른다.
 *
 * 하나만 주면 "이것뿐인가" 싶고, 계열 경계에 걸린 색은 한 끗 차이로 엉뚱한 것이 뽑힌다.
 * 둘을 주면 고를 여지가 생기고, 보이는 색과 보정한 색이 다를 때 양쪽을 같이 보여 줄 수 있다.
 *
 * `families` 에는 찾고 싶은 계열을 우선순위대로 넣는다 (보통 보이는 색·보정한 색 둘).
 * 그 계열에 딱 맞는 제품을 먼저 담고, 모자라면 색이 가까운 계열에서 채운다.
 */
export function pickProducts(part: PalettePart, families: readonly string[], max = 2): Picked[] {
  const list = PRODUCT_PICKS[part];
  if (!list.length) return [];
  const out: Picked[] = [];
  const seen = new Set<ProductPick>();
  // 같은 제품은 한 번만. 호수 묶음별로 나눠 넣은 제품(투에이엔·모렛)은 여러 줄이지만
  // 화면에는 같은 이름으로 보이므로, 두 번 뜨면 "왜 같은 게 두 개지" 가 된다.
  //
  // 2026-10-15: 이름이 아니라 **묶음 이름(group)** 으로 거른다. 제품 목록을 디비에서
  // 뽑게 되면서 팔레트가 통마다 다른 이름을 갖게 됐고(「2 로즈 커넥트」·「4 핑크 페어링」),
  // 이름으로 걸러서는 같은 팔레트가 나란히 떴다 — 전지원이 폰에서 보고 알렸다
  const shown = new Set<string>();

  const add = (pick: ProductPick, family: string): void => {
    const key = `${pick.brand} ${pick.group ?? pick.name}`;
    if (seen.has(pick) || shown.has(key) || out.length >= max) return;
    seen.add(pick);
    shown.add(key);
    out.push({ pick, family });
  };

  // ① 찾는 계열에 딱 맞는 것부터
  for (const f of families) {
    for (const p of list) if (p.families.includes(f)) add(p, f);
  }
  if (out.length >= max) return out;

  // ② 모자라면 색이 **가까운** 계열에서만. 기준 색은 첫 번째 계열.
  //
  // 전에는 거리에 한계가 없어서 아무리 먼 색이라도 끌어왔다. 그래서 카키 · 플럼을 뽑아도
  // 검정 라이너가 따라붙었고, 제품을 더 넣어도 추천이 달라지지 않았다 (2026-10-12).
  // 억지로 두 개를 채우느니 **하나만 보여 주는 편**이 낫다 — 안 맞는 추천은 추천이 아니다.
  const want = families.map((f) => familyLab(part, f)).find((l) => l);
  const rest = list.filter((p) => !seen.has(p));
  if (!want) return out;
  const scored = rest.map((p) => {
    let bd = Infinity, bf = p.families[0] ?? "";
    for (const f of p.families) {
      const l = familyLab(part, f);
      if (!l) continue;
      const d = deltaE(want, l);
      if (d < bd) { bd = d; bf = f; }
    }
    return { p, bd, bf };
  }).sort((a, b) => a.bd - b.bd);
  for (const { p, bd, bf } of scored) {
    if (bd > NEAR_MAX) break;   // 여기서부터는 눈에 다른 색이다 — 채우지 않는다
    add(p, bf);
  }
  return out;
}

/**
 * "가까운 색" 으로 볼 거리(ΔE). 이보다 멀면 다른 색으로 본다.
 *
 * 18 은 48색 팔레트에서 이웃 색까지의 거리(7~12, docs/research/color-match-lighting-2026-10-07.md)보다
 * 조금 넉넉한 값이다 — 한 칸 옆 계열까지는 쓸 만하지만 두 칸 넘게 떨어지면 다른 색이다.
 */
const NEAR_MAX = 18;

/**
 * 그 계열의 기준색(Lab). **디비 기준색을 먼저 보고, 없으면 48색 팔레트**를 본다 (2026-10-15).
 *
 * 디비를 먼저 보는 까닭 둘.
 *   ① **범위가 다르다.** 48색 팔레트는 통 안(팬) 색이고, 앱이 사진에서 읽는 것은
 *      피부 위에 올라간 색이다. 볼터치로 재 보니 통 안 밝기 60~75 vs 피부 위 74~86 으로
 *      거의 안 겹쳤다. 통 안 색을 기준으로 거리를 재면 "가까운 색 채우기" 가 엉뚱하게 돈다.
 *      디비 기준색은 호수가 모인 계열이면 그 호수들의 **피부 위 발색**에서 뽑은 값이라
 *      조건이 같다 (nudy-db/seed/ZZ1 · ZZ2).
 *   ② **팔레트에 없는 계열 이름이 많다.** color-name.ts 가 짓는 이름 70개 중 팔레트에
 *      기준색이 있는 것은 일부여서, 나머지는 여기서 null 이 되어 채우기에 아예 안 걸렸다.
 *      디비 계열 이름은 그 함수가 짓는 이름으로 맞춰 두었다.
 *
 * 디비에도 없으면 전처럼 팔레트 평균을 쓴다. 둘 다 없으면 null — 그 계열은 채우기에서 빠진다.
 *
 * **아직 두 자리가 섞여 있다** (2026-10-15 측정). 디비 기준색이 없는 계열 14개는 팔레트로
 * 떨어지는데, 그 계열을 기준으로 거리를 재면 상대는 디비 기준색이라 자리가 달라 ΔE 가 커진다.
 * 그래서 섀도우 올리브(2→0) · 섀도우 오렌지(2→1) · 입술 버건디(2→1) · 볼터치 레드(2→1) 는
 * 채우기가 전보다 덜 걸린다. 그 14개 계열의 호수 색을 디비에 모으면 사라지는 문제다 —
 * 여기서 억지로 맞추지 않는다 (맞추려면 "같은 자리끼리만 비교" 를 넣어야 하고, 그것은
 * 가까운 색 채우기의 규칙을 바꾸는 일이라 전지원이 정할 몫이다).
 */
function familyLab(part: PalettePart, family: string): Lab | null {
  const ref = FAMILY_REF[part][family];
  if (ref) {
    const [r, g, b] = hexToRgb(ref);
    return rgbToLab(r, g, b);
  }
  const hits = PALETTE[part].filter((hex) => COLOR_FAMILY[hex] === family);
  if (!hits.length) return null;
  const labs = hits.map((hex) => { const [r, g, b] = hexToRgb(hex); return rgbToLab(r, g, b); });
  const n = labs.length;
  return {
    L: labs.reduce((s, l) => s + l.L, 0) / n,
    a: labs.reduce((s, l) => s + l.a, 0) / n,
    b: labs.reduce((s, l) => s + l.b, 0) / n,
  };
}

/**
 * 화면에 쓸 한 줄 — **계열 이름만** 말한다 (2026-10-07 전지원).
 *
 * 호수를 집어 주지 않는다. 사진에서 뽑은 색은 피부 위에 올라간 색이라 "얼마나 진한
 * 제품인가" 를 알 수 없고(얼마나 두껍게 발랐는지를 모른다), 그 상태로 호수를 말하면
 * 틀린 호수를 자신 있게 말하게 된다. 계열까지만 말하면 틀릴 일이 없다.
 */
export function pickShadeText(_pick: ProductPick, family: string): string {
  return `${family} 계열`;
}
