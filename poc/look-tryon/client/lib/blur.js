// 박스 블러 3연속 = 가우시안 근사(표준 기법, 훨씬 빠름). 알파 채널에만 적용 — RGB는 그대로 둬서
// 색은 안 번지고 경계만 부드러워지게 한다(페더링 목적에 맞음. RGB까지 블러하면 색이 새어나간다).

function boxBlur1D(src, dst, w, h, radius, horizontal) {
  const size = radius * 2 + 1;
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += src[(y * w + Math.min(w - 1, Math.max(0, x))) ];
      for (let x = 0; x < w; x++) {
        dst[y * w + x] = sum / size;
        const addX = Math.min(w - 1, x + radius + 1), subX = Math.max(0, x - radius);
        sum += src[y * w + addX] - src[y * w + subX];
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += src[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = sum / size;
        const addY = Math.min(h - 1, y + radius + 1), subY = Math.max(0, y - radius);
        sum += src[addY * w + x] - src[subY * w + x];
      }
    }
  }
}

/** canvas의 알파 채널에 반경 radius(px)로 가우시안 근사 블러를 제자리 적용한다. radius<=0이면 아무것도 안 함. */
export function featherAlpha(canvas, radius) {
  if (radius <= 0) return;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, w, h);
  let a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = img.data[i * 4 + 3];

  const tmp = new Float32Array(w * h);
  const r = Math.max(1, Math.round(radius));
  for (let pass = 0; pass < 3; pass++) { // 3연속 박스블러 = 가우시안 근사
    boxBlur1D(a, tmp, w, h, r, true);
    boxBlur1D(tmp, a, w, h, r, false);
  }
  for (let i = 0; i < w * h; i++) img.data[i * 4 + 3] = Math.round(a[i]);
  ctx.putImageData(img, 0, 0);
}
