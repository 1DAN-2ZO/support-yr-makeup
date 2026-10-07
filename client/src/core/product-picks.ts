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
 */

import { COLOR_FAMILY, PALETTE, hexToRgb } from "./color-family";
import type { PalettePart } from "./color-family";
import { deltaE, rgbToLab } from "./color";
import type { Lab } from "./color";

export interface ProductPick {
  /** 이 제품을 권할 색 계열. color-name.ts 의 base 이름과 같은 말을 쓴다 */
  families: readonly string[];
  brand: string;
  name: string;
  /** 제형·도구. "왜 이것인지" 를 한눈에 — 펜슬인지 팔레트인지 틴트인지 */
  kind: string;
  /** 호수(색상 이름). 확인되면 채운다. 비어 있으면 계열 이름만 안내한다 */
  shade?: string;
  /**
   * 제품 사진. 파일로 넣으면 작게 줄인 data URL, 주소로 넣으면 그 주소 그대로.
   * 주소로 넣은 것은 그쪽이 지우거나 막으면 안 보일 수 있다. 없으면 색 네모만 나간다.
   */
  photo?: string;
  /** 전지원이 실물·판매 페이지로 확인한 것 */
  checked?: true;
}

/**
 * 부위별 후보. 한 부위에 여러 계열이 섞여 있고, 화면에는 그 색 계열에 맞는 것만 고른다.
 * 계열이 안 맞으면 그 부위의 첫 번째 것을 보여 준다 (아무것도 없는 것보다 낫다).
 */
export const PRODUCT_PICKS: Record<PalettePart, readonly ProductPick[]> = {
  brow: [
    {
      // 8색. 호수에 그레이브라운·다크브라운·내추럴브라운·베이지애쉬·토프애쉬·밀키토프가 있어
      // 눈썹 계열 8개 중 6개가 이 하나로 덮인다. 호수가 여럿이라 shade 는 비운다
      families: ["그레이브라운", "다크브라운", "브라운", "애쉬브라운", "라이트브라운", "밀크브라운"],
      brand: "페리페라", name: "스피디 스키니 브로우",
      kind: "펜슬 — 가늘어서 한 올씩 그리기 좋아요",
      photo: "/products/peripera-speedy-skinny-brow.jpg",
      checked: true,
    },
    {
      // 7색. 로즈브라운·블랙이 있어 페리페라가 못 덮는 레드브라운·소프트블랙을 채운다.
      // 공식 페이지 색상: 로즈 브라운 · 블랙 · 그레이 · 애쉬 브라운 · 에스프레소 브라운 · 어반 브라운 · 허니 브라운
      families: ["레드브라운", "소프트블랙", "그레이브라운", "애쉬브라운", "다크브라운", "브라운", "라이트브라운", "밀크브라운"],
      // 포장에는 영문 AUTO EYEBROW PENCIL 로 적혀 있다. 같은 제품이라고 전지원이 확인했다
      brand: "이니스프리", name: "납작 아이브로우 펜슬",
      kind: "펜슬 — 납작해서 눕히면 넓게, 세우면 가늘게 그려져요",
      photo: "/products/innisfree-auto-eyebrow-pencil.jpg",
      checked: true,
    },
    { families: ["다크브라운", "브라운"], brand: "에뛰드", name: "드로잉 아이 브라우", kind: "펜슬 — 무르고 부드러워 넓게 채우기 좋아요" },
  ],
  liner: [
    {
      // 3색: 01 블랙 · 02 브라운 · 03 다크브라운
      families: ["블랙", "소프트블랙", "브라운", "다크브라운"],
      brand: "웨이크메이크", name: "철벽 펜 아이라이너",
      kind: "펜 — 선이 또렷하고 잘 안 번져요",
      photo: "/products/wakemake-pen-eyeliner.jpg",
      checked: true,
    },
    {
      // 13색. 001 블랙 · 002 브라운 · 003 블랙브라운 · 004 다크브라운 · 005 애쉬브라운
      // · 006 바닐라베이지 · 007 크리미아이보리 · 008 코랄 · 009 로즈 · 010 코코아브라운 · 011 뮤트그레이
      families: ["블랙", "소프트블랙", "그레이", "브라운", "다크브라운", "버건디"],
      brand: "클리오", name: "샤프 쏘 심플 워터프루프 펜슬 라이너",
      kind: "펜슬 — 부드럽게 그려지고 색이 13가지라 고르기 좋아요",
      photo: "/products/clio-sharp-so-simple-pencil-liner.jpg",
      checked: true,
    },
  ],
  shadow: [
    {
      // 팔레트 15종, 한 판에 12색. 호수 이름에 색이 들어 있다 —
      // 1 코랄 스튜디오 · 2 로즈 커넥트 · 3 뮤트 라이브러리 · 4 핑크 페어링 · 5 오키드 클라우드
      // · 7 라벤더 뉴커머 · 8 라떼 이즈 시니어 · 9 피치 프레스 · 10 플럼 플럼 인 시즌
      // · 11 쇼핑 치즈캣 · 12 크리스탈 발바닥 · 13 힙합 when 슬픔 · 15 탄브라운
      families: ["코랄", "로즈", "핑크", "퍼플", "베이지", "플럼", "브라운", "딥브라운"],
      brand: "클리오", name: "프로 아이 팔레트 에어",
      kind: "팔레트 — 한 판에 12색이라 한 통으로 눈 화장이 끝나요",
      photo: "/products/clio-pro-eye-palette-air.jpg",
      checked: true,
    },
    {
      // 낱개 섀도우 20색 + 젤테일·피스빔·피스밤. 호수 이름이 색을 안 알려 준다
      // (클린솝 · 이너프 · 베이비타로 · 타로튜튜 · 퍼플릿 · 돌체그레이프 …).
      // 아래 계열은 전지원이 보낸 사진에서 **눈으로 본 것**이다 — 사진 속 색을 자동으로
      // 뽑아 봤지만 케이스가 투명하고 알이 작아 분홍 배경에 묻혀 쓸 수 없었다
      families: ["로즈", "핑크", "코랄", "베이지"],
      brand: "홀리카홀리카", name: "마이페이브 피스 아이섀도우",
      kind: "낱개 — 필요한 색만 하나씩 골라 모을 수 있어요",
      photo: "/products/holika-my-fave-piece-shadow.jpg",
      checked: true,
    },
    { families: ["로즈", "핑크", "플럼", "퍼플"], brand: "페리페라", name: "올 테이크 무드 팔레트", kind: "팔레트 — 분홍·자주 계열" },
    {
      // 팔레트 5종(각 6색): 01 퍼퓸 클래스 · 02 와인 클래스 · 03 티 클래스 · 04 쿠킹 클래스 · 05 포엠 클래스.
      // 퍼스널컬러 전문가가 만든 브랜드라 뮤트한 중성 톤 위주.
      // 팔레트 5종(퍼퓸·와인·티·쿠킹·포엠)이 **클래스마다 색이 완전히 다르다.**
      // 전지원이 보낸 사진 두 장을 실제로 재 보았다.
      //   ① 분홍~모브 한 줄기 : 색상각 338~360°, 채도 10~16, 밝기 44~83  → 플럼·로즈
      //   ② 베이지~갈색 한 줄기: 색상각 15~48°,  채도 10~16, 밝기 40~82  → 로즈·브라운·딥브라운
      // 이름으로 짐작한 "와인 = 버건디" 는 둘 다 아니었다. 지금은 한 줄에 묶어 두었고,
      // 클래스별로 쪼개는 것은 호수마다 색을 넣는 작업과 함께 한다
      families: ["플럼", "로즈", "브라운", "딥브라운", "베이지"],
      brand: "모렛", name: "뷰파인더 섀도우 팔레트",
      kind: "팔레트 — 뮤트한 중성 톤이라 과하지 않게 발려요",
      photo: "/products/molette-viewfinder-palette.jpg",
      checked: true,
    },
    { families: ["코랄", "오렌지"], brand: "릴리바이레드", name: "무드 잇 팔레트", kind: "팔레트 — 따뜻한 계열" },
  ],
  cheek: [
    {
      // 15색 × 3제형(파우더칩·베이크드칩·크림칩). 전지원이 보낸 발색 사진의 4색을 실제로 쟀다
      // (팔에 바른 발색이라 피부가 섞인 값 — 우리가 참고 사진에서 뽑는 것과 같은 조건이다).
      //   #without     #cabcbb  L77.3 C5.4  h21.8  → 그레이베이지
      //   #vanilla     #d1bfbc  L78.8 C7.2  h33.7  → 그레이베이지
      //   #bunny       #d6b6af  L76.5 C12.8 h38.7  → 베이지핑크
      //   #buttercream #d5afa2  L74.5 C17.0 h45.0  → 베이지핑크
      // 나머지 11색은 아직 못 봤다
      families: ["그레이베이지", "베이지핑크", "코랄", "피치"],
      brand: "퓌", name: "치크칩",
      kind: "파우더·베이크드·크림 세 가지라 원하는 느낌으로 고를 수 있어요",
      photo: "/products/fwee-cheek-chip.jpg",
      checked: true,
    },
    // ── 투에이엔 듀얼 치크 (19색) ──
    // 호수마다 색이 완전히 달라서 **묶음별로 나눠 넣는다.** 그래야 추천된 계열에 맞는
    // 사진이 뜬다. 한 줄로 두면 라벤더를 권하면서 코랄 사진을 보여 주게 된다.
    // 전체 호수: 코튼캔디 바이올렛 · 러브 로지 · 코코 코랄 · 핫 리빙 코랄 · 무드 인 치크
    // · 핑크 페탈 · 피치 피즈 · 누드 헤이즈 · 하트 벌룬 · 러브 포션 · 쥬시 피치
    // · 오렌지 플레어 · 베리 큐피드 · 러브 큐피드 · 망고 베리 · 핑크 텐션 · 버블 하트
    // · 디어 로즈 · 크리미 로지
    {
      // 사진으로 확인: 오른쪽 칸 색상각 328.6° — 라벤더 구간에 들어온다
      families: ["라벤더"], brand: "투에이엔", name: "듀얼 치크",
      shade: "코튼캔디 바이올렛",
      kind: "한 통에 두 색 — 따로 써도, 섞어 써도 돼요",
      photo: "/products/2an-dual-cheek-violet.jpg",
      checked: true,
    },
    {
      // 사진으로 확인: 오른쪽 칸 #fda6a2 (L76.5 C35.3 h25.1)
      families: ["코랄", "피치"], brand: "투에이엔", name: "듀얼 치크",
      kind: "한 통에 두 색 — 코코 코랄 · 핫 리빙 코랄 · 피치 피즈 · 쥬시 피치 호수",
      photo: "/products/2an-dual-cheek.jpg",
      checked: true,
    },
    {
      families: ["로즈", "모브"], brand: "투에이엔", name: "듀얼 치크",
      kind: "한 통에 두 색 — 러브 로지 · 디어 로즈 · 크리미 로지 호수",
    },
    {
      families: ["핑크", "베이지핑크"], brand: "투에이엔", name: "듀얼 치크",
      kind: "한 통에 두 색 — 핑크 페탈 · 핑크 텐션 · 버블 하트 · 누드 헤이즈 호수",
    },
    {
      families: ["레드", "브릭"], brand: "투에이엔", name: "듀얼 치크",
      kind: "한 통에 두 색 — 베리 큐피드 · 망고 베리 · 러브 포션 호수",
    },
    { families: ["베이지핑크", "코랄", "피치"], brand: "페리페라", name: "퓨어 블러시드 선샤인 치크", kind: "파우더 — 얇게 올라가 뭉치지 않아요" },
  ],
  lip: [
    {
      // 12색. 확인된 호수: 901 트루 피치 · 902 비지 코랄 · 904 시티 핑크 · 905 로지 하이
      // · 906 솔티 피그(무화과) · 907 젠틀 로즈 · 908 인 카페인(커피빛) · 909 길티 모브 · 910 보스 체리
      families: ["피치", "코랄", "핑크", "로즈", "플럼", "브릭", "MLBB", "체리"],
      brand: "라카", name: "퍼펙트 트윈 립",
      kind: "틴트 + 글로스 — 매트로도, 광으로도 쓸 수 있어요",
      photo: "/products/laka-perfect-twin-lip.jpg",
      checked: true,
    },
    {
      // 색이 아주 많다(30색 가까이). 사진에 보이는 것만으로도 자주·분홍·코랄·오렌지·누드가 있다
      families: ["MLBB", "브릭", "누드베이지", "로즈", "핑크", "코랄", "오렌지", "플럼"],
      brand: "롬앤", name: "쥬시 래스팅 틴트",
      kind: "틴트 — 촉촉하고 오래가요",
      photo: "/products/romand-juicy-lasting-tint.jpg",
      checked: true,
    },
    { families: ["코랄", "피치", "오렌지"], brand: "에스쁘아", name: "꾸뛰르 립 틴트 글레이즈", kind: "틴트 — 광이 돌아요" },
    { families: ["로즈", "핑크", "플럼", "버건디", "레드", "딥레드", "체리"], brand: "3CE", name: "블러 워터 틴트", kind: "틴트 — 뿌옇게 번지는 느낌" },
  ],
};

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
  // 화면에는 같은 이름으로 보이므로, 두 번 뜨면 "왜 같은 게 두 개지" 가 된다
  const shown = new Set<string>();

  const add = (pick: ProductPick, family: string): void => {
    const key = `${pick.brand} ${pick.name}`;
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

  // ② 모자라면 색이 가까운 계열에서. 기준 색은 첫 번째 계열
  const want = families.map((f) => familyLab(part, f)).find((l) => l);
  const rest = list.filter((p) => !seen.has(p));
  if (!want) {
    for (const p of rest) add(p, p.families[0] ?? families[0] ?? "");
    return out;
  }
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
  for (const { p, bf } of scored) add(p, bf);
  return out;
}

/** 그 계열 이름을 가진 48색들의 평균. 팔레트에 없는 이름이면 null */
function familyLab(part: PalettePart, family: string): Lab | null {
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

/** 화면에 쓸 한 줄. 호수를 모르면 계열 이름으로 말한다 — 틀린 호수를 말하지 않는다 */
export function pickShadeText(pick: ProductPick, family: string): string {
  return pick.shade ? `${pick.shade} 호` : `${family} 계열 호수로`;
}
