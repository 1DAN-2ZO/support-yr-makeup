/**
 * 고른 화장 템플릿을 참고 사진 화면으로 넘기는 자리 (#420).
 *
 * 템플릿 화면에서 고르고 "적용하기" 를 누르면, 참고 사진 화면이 그 템플릿 사진을
 * **사용자가 올린 사진과 똑같이** 다룬다 — 분석하고 서버로 보내 예상 메이크업을 만든다.
 * 그래서 넘기는 것은 템플릿 하나뿐이고, 그 뒤 흐름은 기존 길 그대로다.
 *
 * ref-store 와 같이 **메모리에만** 둔다. 새로고침하면 사라지고, 그때는 참고 사진 화면이
 * 평소처럼 업로드 칸부터 보여 준다.
 *
 * **한 번 쓰면 비운다**(take). 안 비우면 참고 사진 화면에 들어올 때마다 템플릿이 다시
 * 적용돼, 사용자가 내 사진을 올리려 해도 템플릿으로 덮인다.
 */

import type { MakeupTemplate } from "@core/templates";

let picked: MakeupTemplate | null = null;

export function setPickedTemplate(t: MakeupTemplate | null): void {
  picked = t;
}

/** 고른 템플릿을 꺼내면서 비운다 — 한 번만 적용된다 */
export function takePickedTemplate(): MakeupTemplate | null {
  const t = picked;
  picked = null;
  return t;
}

/** 비우지 않고 보기만 (시험용) */
export function peekPickedTemplate(): MakeupTemplate | null {
  return picked;
}
