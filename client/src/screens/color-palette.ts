/**
 * 색조 팔레트 — 참고 사진에서 읽은 부위별 색을 한 장에 모아 보여 준다 (2026-10-06).
 *
 * 형식은 세로 목록. 한 줄 = 질감 그림 + 색 이름 + 부위 이름.
 * 질감 그림은 부위마다 모양이 다르다 — 섀도우는 파우더 쓸림, 라이너는 펜 선, 입술은 립 쓸림.
 * 그림 자체가 "무슨 도구로 바르는지" 를 말해 준다.
 *
 * 매끈한 도형으로 그리면 화장품 느낌이 안 난다. 그래서 SVG 필터로
 *   ① 낮은 주파수 노이즈로 **가장자리를 울퉁불퉁하게** (일부러 바른 자국처럼)
 *   ② 높은 주파수 노이즈로 **가루 입자**를 얹는다 (파우더·블러셔)
 * 필터 id 는 한 페이지에 팔레트가 여러 장 떠도 안 겹치게 번호를 붙인다.
 *
 * 동그라미(그림)에는 **사진에서 뽑은 색을 그대로** 쓰고, 이름만 48색 팔레트에서 가장 가까운
 * 계열을 붙인다 (2026-10-06 결정). 팔레트가 임시값이라 색까지 바꾸면 실제와 달라진다.
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

let uid = 0;

/**
 * 질감 필터 두 종류.
 * rough — 가장자리만 흐트러뜨린다 (펜슬·립처럼 날이 살아 있는 것)
 * powder — 흐트러뜨린 뒤 가루 입자를 뚫어 준다 (섀도우·블러셔)
 */
function filters(id: string): string {
  return `
    <filter id="${id}-rough" x="-25%" y="-35%" width="150%" height="170%">
      <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="3" seed="11" result="t" />
      <feDisplacementMap in="SourceGraphic" in2="t" scale="6" xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <filter id="${id}-powder" x="-30%" y="-40%" width="160%" height="180%">
      <feTurbulence type="fractalNoise" baseFrequency="0.028 0.06" numOctaves="4" seed="5" result="t" />
      <feDisplacementMap in="SourceGraphic" in2="t" scale="13" xChannelSelector="R" yChannelSelector="G" result="d" />
      <!-- 가루 입자: 높은 주파수 노이즈를 알파로 바꿔 구멍을 뚫는다 -->
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="23" result="g" />
      <feColorMatrix in="g" type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.1 0 0 0 -0.42" result="ga" />
      <feComposite in="d" in2="ga" operator="out" result="speck" />
      <!-- 뚫린 것만 쓰면 너무 성기다. 원본을 옅게 깔고 그 위에 얹는다 -->
      <feComponentTransfer in="d" result="base">
        <feFuncA type="linear" slope="0.55" />
      </feComponentTransfer>
      <feMerge><feMergeNode in="base" /><feMergeNode in="speck" /></feMerge>
    </filter>
    <!-- 압축 파우더(블러셔) — 틀에 눌러 담은 것이라 테두리가 거의 동그랗다. 입자만 얹는다 -->
    <filter id="${id}-pan" x="-20%" y="-25%" width="140%" height="150%">
      <feTurbulence type="fractalNoise" baseFrequency="0.05 0.08" numOctaves="3" seed="9" result="t" />
      <feDisplacementMap in="SourceGraphic" in2="t" scale="4" xChannelSelector="R" yChannelSelector="G" result="d" />
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="17" result="g" />
      <feColorMatrix in="g" type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.1 0 0 0 -0.5" result="ga" />
      <feComposite in="d" in2="ga" operator="out" result="speck" />
      <feComponentTransfer in="d" result="base">
        <feFuncA type="linear" slope="0.68" />
      </feComponentTransfer>
      <feMerge><feMergeNode in="base" /><feMergeNode in="speck" /></feMerge>
    </filter>`;
}

/** 부위별 질감 그림. viewBox 는 전부 0 0 96 64. 색은 currentColor */
function swatch(part: PalettePart, id: string): string {
  switch (part) {
    // 눈썹 — 펜슬로 한 올씩 그은 결. 획마다 길이·굵기·휨이 다르고 끝이 가늘어진다
    case "brow": return `
      <g filter="url(#${id}-rough)" fill="currentColor">
        <path d="M11 47 Q19 35 28 29 Q30 28 30.6 29.4 Q31 30.6 29.6 31.6 Q21 37 14.2 48 Q13.2 49.4 12 49 Q10.6 48.5 11 47 Z" opacity=".72" />
        <path d="M22 50 Q31 33 42 26 Q44.4 24.6 45.2 26.4 Q45.8 28.2 43.8 29.6 Q34 36 25.4 51.2 Q24.3 53 22.8 52.3 Q21.3 51.6 22 50 Z" />
        <path d="M35 50 Q45 32 57 26 Q59.4 24.8 60 26.7 Q60.5 28.5 58.4 29.8 Q48 36 38.6 51.4 Q37.5 53.2 36 52.5 Q34.4 51.8 35 50 Z" />
        <path d="M49 48 Q59 32 71 29 Q73.2 28.5 73.6 30.2 Q73.9 31.9 71.9 32.6 Q62 35.6 52.5 49.4 Q51.4 51 50 50.4 Q48.5 49.7 49 48 Z" opacity=".86" />
        <path d="M63 45 Q72 34 83 33 Q85 32.9 85.1 34.4 Q85.2 35.9 83.3 36.2 Q74 37.4 66.2 46.4 Q65.1 47.7 63.9 47.2 Q62.6 46.6 63 45 Z" opacity=".55" />
      </g>`;

    // 아이섀도우 — 브러시로 한 번 쓸어 바른 파우더. 왼쪽이 진하고 오른쪽으로 날아간다
    case "shadow": return `
      <defs>
        <linearGradient id="${id}-sh" x1="0.08" y1="0.3" x2="1" y2="0.75">
          <stop offset="0" stop-color="currentColor" stop-opacity="1" />
          <stop offset=".45" stop-color="currentColor" stop-opacity=".88" />
          <stop offset=".8" stop-color="currentColor" stop-opacity=".45" />
          <stop offset="1" stop-color="currentColor" stop-opacity=".08" />
        </linearGradient>
      </defs>
      <g filter="url(#${id}-powder)">
        <path d="M6 37 Q12 24 32 21 Q56 17 76 23 Q90 27 93 33 Q89 42 68 46 Q40 51 19 46 Q8 43 6 37 Z"
              fill="url(#${id}-sh)" />
      </g>
      <!-- 쓸린 끝에 흩날린 가루 -->
      <g fill="currentColor" opacity=".32">
        <circle cx="86" cy="24" r="1.5" /><circle cx="91" cy="31" r="1.1" /><circle cx="88" cy="41" r="1.3" />
        <circle cx="79" cy="48" r="1" /><circle cx="94" cy="37" r=".9" /><circle cx="83" cy="17" r="1" />
      </g>`;

    // 아이라인 — 펜으로 그은 획. 눈머리 쪽은 얇고 눈꼬리로 갈수록 두꺼워진다(소다와 같은 결)
    case "liner": return `
      <g filter="url(#${id}-rough)" fill="currentColor">
        <path d="M8 44 Q34 27 88 21 Q89.6 20.9 89.7 22.3 Q89.8 23.7 88.3 24.1 Q36 31.5 10.6 46.6 Q9.1 47.5 8.2 46.4 Q7.4 45.2 8 44 Z" />
        <path d="M13 53 Q38 39 76 34 Q77.3 33.9 77.4 35 Q77.5 36 76.3 36.3 Q40 42.5 15.1 54.9 Q14 55.5 13.3 54.7 Q12.6 53.8 13 53 Z" opacity=".5" />
      </g>`;

    // 블러셔 — 압축 파우더 팬. 가운데가 눌려 진하고 가장자리에 브러시 자국이 남는다
    case "cheek": return `
      <defs>
        <radialGradient id="${id}-ck" cx="41%" cy="36%" r="70%">
          <stop offset="0" stop-color="currentColor" stop-opacity="1" />
          <stop offset=".58" stop-color="currentColor" stop-opacity=".92" />
          <stop offset=".88" stop-color="currentColor" stop-opacity=".66" />
          <stop offset="1" stop-color="currentColor" stop-opacity=".3" />
        </radialGradient>
      </defs>
      <g filter="url(#${id}-pan)">
        <circle cx="47" cy="32" r="26" fill="url(#${id}-ck)" />
      </g>
      <g fill="currentColor" opacity=".3">
        <circle cx="76" cy="18" r="1.2" /><circle cx="19" cy="46" r="1" /><circle cx="73" cy="48" r="1.1" />
        <circle cx="24" cy="15" r=".9" />
      </g>`;

    // 립 — 립스틱을 눌러 쓸어 바른 자국. 가운데가 두툼하고 광이 한 줄 올라온다
    case "lip": return `
      <defs>
        <linearGradient id="${id}-lp" x1="0.05" y1="0.1" x2="0.95" y2="0.95">
          <stop offset="0" stop-color="currentColor" stop-opacity=".66" />
          <stop offset=".38" stop-color="currentColor" stop-opacity="1" />
          <stop offset=".78" stop-color="currentColor" stop-opacity=".92" />
          <stop offset="1" stop-color="currentColor" stop-opacity=".42" />
        </linearGradient>
      </defs>
      <g filter="url(#${id}-rough)">
        <path d="M10 40 Q15 24 34 21 Q58 17 78 26 Q89 31 88 38 Q84 47 62 50 Q34 54 17 47 Q10 44 10 40 Z"
              fill="url(#${id}-lp)" />
        <!-- 크림 광 -->
        <path d="M26 30 Q40 25 58 27 Q66 28 70 31 Q58 29 43 30 Q32 31 26 30 Z" fill="#fff" opacity=".4" />
      </g>`;
  }
}

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
  const id = `pal${++uid}`;
  const box = document.createElement("section");
  box.className = "color-palette";

  const head = document.createElement("div");
  head.className = "color-palette-head";
  head.innerHTML = `
    <h2>${opt.step ? `<em>${opt.step}</em> ` : ""}${opt.title ?? "참고 사진의 색조 팔레트"}</h2>
    <p>${opt.note ?? "올려 주신 사진에서 읽은 색이에요"}</p>
  `;

  // 필터는 한 번만 — 목록 전체가 같은 것을 쓴다
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  defs.setAttribute("class", "palette-defs");
  defs.setAttribute("aria-hidden", "true");
  defs.innerHTML = `<defs>${filters(id)}</defs>`;

  const list = document.createElement("ul");
  list.className = "color-palette-list";
  for (const part of ORDER) {
    if (!REF_PARTS.includes(part)) continue;
    const c = colors[part];
    const li = document.createElement("li");
    li.className = c ? "" : "unread";
    if (c) li.style.color = c.hex;
    li.innerHTML = `
      <span class="palette-ink" aria-hidden="true">
        <svg viewBox="0 0 96 64">${c
          ? swatch(part, id)
          : `<path d="M22 32h52" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".35" fill="none"/>`}</svg>
      </span>
      <span class="palette-text">
        <strong>${c ? c.name.text : "확인할 수 없어요"}</strong>
        <em>${PART_LABEL[part]}</em>
      </span>
    `;
    list.append(li);
  }

  box.append(head, defs, list);
  return box;
}
