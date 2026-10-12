/**
 * 묶음의 가운데 장 (2026-10-12, 모듈 ③ → ⑥ 연결) — 서버로 보내 옮긴 그림을 만들 시도사진 한 장을 고른다. 순수 함수.
 * 첫 장은 셔터를 누른 순간이라 손이 움직일 수 있어서 가운데 장을 쓴다 (사용자 결정 2026-10-07).
 * 흔들림을 재서 고르는 것은 아니다 — 자리로만 고른다
 */
export function middleShot<T>(shots: readonly T[]): T | undefined {
  return shots[Math.floor(shots.length / 2)];
}
