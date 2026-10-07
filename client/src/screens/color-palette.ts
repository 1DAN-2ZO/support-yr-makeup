/**
 * 색조 팔레트 — 참고 사진에서 읽은 부위별 색을 한 장에 모아 보여 준다 (2026-10-06).
 *
 * 형식은 세로 목록. 한 줄 = 질감 그림 + 색 이름 + 부위 이름.
 *
 * 질감은 **흑백 틀(public/swatch/*.png)에 색을 입히는 방식**이다. 틀은 코덱스가 만든
 * 발색 견본에서 "잉크가 얼마나 묻었나" 만 뽑아 알파로 바꾼 것이라 색이 들어 있지 않다.
 * CSS mask 로 그 틀 모양만 오려 내고 바탕을 currentColor 로 칠한다 —
 * **사진 같은 질감과 자유로운 색을 둘 다** 가져가는 유일한 방법이다.
 *
 * 전에는 SVG 필터(feTurbulence)로 질감을 흉내 냈는데, 가루가 오트밀처럼 보이고
 * 부위끼리 구분이 안 됐다. 두 번 고쳐 봐도 한계가 분명해서 이 방식으로 바꿨다.
 *
 * 동그라미(그림)에는 **사진에서 뽑은 색을 그대로** 쓰고, 이름만 규칙으로 짓는다
 * (2026-10-06 결정). 팔레트가 임시값이라 색까지 바꾸면 실제와 달라진다.
 */

import type { PalettePart } from "@core/color-family";
import type { RefColors } from "@core/ref-colors";
import { REF_PARTS } from "@core/ref-colors";

/** 화면에 쓰는 부위 이름 */
const PART_LABEL: Record<PalettePart, string> = {
  brow: "눈썹",
  shadow: "아이섀도우",
  liner: "아이라인",
  cheek: "블러셔",
  lip: "립",
};

/** 목록 순서 — 얼굴 위에서 아래로 */
const ORDER: readonly PalettePart[] = ["brow", "shadow", "liner", "cheek", "lip"];

/** 부위별 질감 틀. 알파만 있는 흑백 PNG — CSS mask 로 모양만 오려 쓴다 */
const SWATCH: Record<PalettePart, string> = {
  brow: "brow",      // 가는 털이 여러 갈래로 쓸린 결
  shadow: "shadow",  // 브러시로 쓸어 바른 파우더. 덩어리와 날린 가루
  liner: "liner",    // 펜으로 그은 가는 획 셋
  cheek: "cheek",    // 틀에 눌러 담은 압축 파우더
  lip: "lip",        // 눌러 쓸어 바른 크림
};

export interface PaletteOptions {
  /** 제목 앞 차례 — 소다처럼 "2." 같은 번호를 붙이고 싶을 때 */
  step?: string;
  title?: string;
  note?: string;
}

/**
 * 색조 팔레트 한 장. 못 읽은 부위는 "이 사진에서는 확인할 수 없어요" 로 남긴다 —
 * 앞머리에 덮인 눈썹처럼 사진에 안 보이는 부위가 있다.
 */
export function colorPalette(colors: RefColors, opt: PaletteOptions = {}): HTMLElement {
  const box = document.createElement("section");
  box.className = "color-palette";

  const head = document.createElement("div");
  head.className = "color-palette-head";
  head.innerHTML = `
    <h2>${opt.step ? `<em>${opt.step}</em> ` : ""}${opt.title ?? "참고 사진의 색조 팔레트"}</h2>
    <p>${opt.note ?? "올려 주신 사진에서 읽은 색이에요"}</p>
  `;

  const list = document.createElement("ul");
  list.className = "color-palette-list";
  for (const part of ORDER) {
    if (!REF_PARTS.includes(part)) continue;
    const c = colors[part];
    const li = document.createElement("li");
    li.className = c ? "" : "unread";
    if (c) li.style.color = c.hex;
    li.innerHTML = `
      <span class="palette-ink" aria-hidden="true">${c
        ? `<i style="--sw:url('${import.meta.env.BASE_URL}swatch/${SWATCH[part]}.png')"></i>`
        : `<b></b>`}</span>
      <span class="palette-text">
        <strong>${c ? c.name.text : "확인할 수 없어요"}</strong>
        <em>${PART_LABEL[part]}</em>
      </span>
    `;
    list.append(li);
  }

  box.append(head, list);
  return box;
}
