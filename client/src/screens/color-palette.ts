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
 * 질감 필터. 코덱스가 만든 견본(nudy-palette-swatch-icons.svg)을 옮겨 왔다.
 *   cream  — 크림처럼 두껍게 발린 것(립). 가장자리만 흐트러뜨린다
 *   powder — 파우더가 쓸린 것(섀도우). 흐트러뜨린 뒤 가루 입자를 뚫는다
 *   pan    — 틀에 눌러 담은 압축 파우더(블러셔). 테두리는 그대로 두고 입자만 얹는다
 * id 에 접두사를 붙여 한 페이지에 팔레트가 여러 장 떠도 안 겹치게 한다.
 *
 * **currentColor 를 쓰는 그라데이션은 여기 두면 안 된다.** 이 defs 는 따로 떨어진 <svg>
 * 안에 있어서 currentColor 가 그 svg 기준(검정)으로 풀린다. 색을 쓰는 것은 각 스와치
 * 안에 넣는다 (립 참고).
 */
function filters(id: string): string {
  return `
    <filter id="${id}-cream" x="-20%" y="-30%" width="140%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency=".042 .12" numOctaves="3" seed="11" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="4.2" xChannelSelector="R" yChannelSelector="G" />
    </filter>

    <filter id="${id}-powder" x="-20%" y="-25%" width="140%" height="150%">
      <feTurbulence type="fractalNoise" baseFrequency=".09 .2" numOctaves="3" seed="24" result="edgeNoise" />
      <feDisplacementMap in="SourceGraphic" in2="edgeNoise" scale="3.6" xChannelSelector="R" yChannelSelector="G" result="rough" />
      <feTurbulence type="fractalNoise" baseFrequency=".7 .9" numOctaves="2" seed="25" result="grain" />
      <feColorMatrix in="grain" type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 .18" result="grainAlpha" />
      <feComposite in="rough" in2="grainAlpha" operator="out" />
    </filter>

    <filter id="${id}-pan" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency=".52 .62" numOctaves="2" seed="37" result="grain" />
      <feColorMatrix in="grain" type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .46 .18" result="grainAlpha" />
      <feComposite in="SourceGraphic" in2="grainAlpha" operator="out" />
    </filter>


    <radialGradient id="${id}-pan-rise" cx="45%" cy="37%" r="62%">
      <stop offset="0" stop-color="#fff" stop-opacity=".28" />
      <stop offset=".36" stop-color="#fff" stop-opacity=".08" />
      <stop offset="1" stop-color="#000" stop-opacity=".12" />
    </radialGradient>`;
}

/** 부위별 질감 그림. viewBox 는 전부 0 0 96 64. 색은 currentColor */
function swatch(part: PalettePart, id: string): string {
  switch (part) {
    // 눈썹 — 펜슬로 그은 결. 획마다 굵기·휨이 다르고 위로 갈수록 가늘어진다
    case "brow": return `
      <g fill="none" stroke="currentColor" stroke-linecap="round">
        <path d="M16 42 C28 31 39 24 54 20" stroke-width="5.4" />
        <path d="M23 45 C33 34 45 27 61 22" stroke-width="4.5" />
        <path d="M31 47 C41 37 52 31 70 27" stroke-width="3.6" />
        <path d="M41 48 C52 39 63 35 78 31" stroke-width="2.8" />
        <path d="M20 38 C26 33 32 29 39 26" stroke-width="2.2" opacity=".62" />
        <path d="M50 22 C58 19 65 18 73 19" stroke-width="2.1" opacity=".55" />
      </g>
      <g fill="currentColor" opacity=".28">
        <ellipse cx="29" cy="39" rx="2.2" ry="1.1" transform="rotate(-30 29 39)" />
        <ellipse cx="56" cy="27" rx="1.8" ry=".9" transform="rotate(-15 56 27)" />
      </g>`;

    // 아이섀도우 — 브러시로 쓸어 바른 파우더. 아래로 옅게 끌린 자국과 흩날린 가루
    case "shadow": return `
      <g filter="url(#${id}-powder)">
        <path fill="currentColor" opacity=".92" d="M15 39 C25 22 49 15 75 21 C86 24 87 35 76 42 C57 53 25 53 15 39Z" />
        <path fill="currentColor" opacity=".36" d="M8 43 C21 34 39 32 61 35 C75 37 85 41 89 47 C72 52 36 56 8 43Z" />
      </g>
      <g fill="#fff" opacity=".32">
        <circle cx="25" cy="36" r="1.6" /><circle cx="35" cy="28" r=".9" /><circle cx="51" cy="25" r="1.2" />
        <circle cx="68" cy="31" r=".8" /><circle cx="77" cy="39" r="1.3" />
      </g>
      <g fill="currentColor" opacity=".32">
        <circle cx="14" cy="46" r="1.4" /><circle cx="24" cy="51" r=".9" />
        <circle cx="73" cy="48" r="1.1" /><circle cx="85" cy="44" r=".8" />
      </g>`;

    // 아이라인 — 펜으로 겹쳐 그은 획. 눈꼬리 쪽으로 갈수록 두꺼워진다
    case "liner": return `
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 40 C28 31 45 28 62 31 C72 33 80 37 88 42" stroke-width="3.1" />
        <path d="M16 35 C32 27 49 25 64 28 C75 30 82 34 89 39" stroke-width="4.6" opacity=".86" />
        <path d="M21 31 C39 24 56 24 69 28 C80 31 87 36 91 40" stroke-width="2.1" opacity=".55" />
        <path d="M71 28 C80 29 87 33 92 39" stroke-width="6.4" opacity=".28" />
      </g>
      <path fill="currentColor" opacity=".5" d="M84 34 C90 36 93 39 95 43 C90 42 86 40 82 37Z" />`;

    // 블러셔 — 틀에 눌러 담은 압축 파우더. 가운데가 솟고 브러시가 쓸고 간 자국이 남는다
    case "cheek": return `
      <g filter="url(#${id}-pan)">
        <ellipse cx="48" cy="33" rx="27" ry="22" fill="currentColor" />
      </g>
      <ellipse cx="48" cy="33" rx="27" ry="22" fill="url(#${id}-pan-rise)" opacity=".9" />
      <path d="M27 29 C38 23 58 22 70 30" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".26" />
      <path d="M25 36 C38 43 58 44 72 36" fill="none" stroke="#000" stroke-width="1.4" stroke-linecap="round" opacity=".07" />
      <g fill="#fff" opacity=".24">
        <circle cx="35" cy="25" r="1" /><circle cx="52" cy="20" r=".8" /><circle cx="63" cy="31" r="1.1" />
      </g>`;

    // 립 — 눌러 쓸어 바른 크림. 가운데가 두툼하고 광이 두 줄로 번진다
    case "lip": return `
      <defs>
        <linearGradient id="${id}-lip-rise" x1="16" y1="50" x2="82" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="currentColor" stop-opacity=".58" />
          <stop offset=".45" stop-color="currentColor" />
          <stop offset="1" stop-color="currentColor" stop-opacity=".7" />
        </linearGradient>
      </defs>
      <g filter="url(#${id}-cream)">
        <path fill="url(#${id}-lip-rise)" d="M13 43 C16 33 27 28 43 27 C55 26 69 20 80 25 C90 29 86 40 75 45 C59 52 33 53 13 43Z" />
        <path fill="currentColor" opacity=".42" d="M11 46 C28 51 55 51 78 44 C65 57 28 60 11 46Z" />
      </g>
      <path fill="#fff" opacity=".34" d="M31 33 C43 28 57 27 69 29 C58 31 43 34 30 39 C27 37 28 35 31 33Z" />
      <path fill="#fff" opacity=".22" d="M61 35 C69 33 76 33 81 36 C73 37 67 39 60 42 C57 40 58 37 61 35Z" />
      <path fill="currentColor" opacity=".22" d="M16 43 C23 41 30 42 39 46 C30 47 22 47 16 43Z" />`;
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
