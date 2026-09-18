// 검증용 가짜 얼굴 랜드마크. 좌우가 완벽히 대칭인 정면 얼굴.
// tests.mjs와 parity.mjs가 같이 쓴다. fixture.py가 이것과 같은 값을 만들어야 한다.

import { IDX } from './core.js';

export function makeFixture() {
  const lm = Array.from({ length: 478 }, () => ({ x: 200, y: 250, z: 0 }));
  const set = (i, x, y) => { lm[i] = { x, y, z: 0 }; };
  const deg = (d) => (d * Math.PI) / 180;

  // 눈: 왼쪽 중심 (150,200), 오른쪽 중심 (250,200), rx 25 / ry 10
  const ring = (idxs, cx, startDeg, step) => {
    idxs.forEach((id, i) => {
      const a = deg(startDeg + step * i);
      set(id, cx + 25 * Math.cos(a), 200 + 10 * Math.sin(a));
    });
  };
  ring(IDX.eyeRingL, 150, 180, -22.5);
  ring(IDX.eyeRingR, 250, 0, 22.5);

  // 눈썹: 눈 위 아치
  const brow = (upper, lower, outerX, innerX, y) => {
    upper.forEach((id, i) => {
      const t = i / (upper.length - 1);
      set(id, outerX + (innerX - outerX) * t, y - 4 * Math.sin(Math.PI * t));
    });
    lower.forEach((id, i) => {
      const t = i / (lower.length - 1);           // 안쪽 → 바깥쪽 순서
      set(id, innerX + (outerX - innerX) * t, y + 12);
    });
  };
  brow(IDX.browUpperL, IDX.browLowerL, 122, 178, 172);
  brow(IDX.browUpperR, IDX.browLowerR, 278, 222, 172);

  // 입술: 중심 (200,340), rx 32 / ry 16. 인덱스 0(=61)이 왼쪽 입꼬리
  IDX.lipOuter.forEach((id, i) => {
    const a = deg(180 + i * (360 / IDX.lipOuter.length));
    set(id, 200 + 32 * Math.cos(a), 340 + 16 * Math.sin(a));
  });

  return lm;
}
