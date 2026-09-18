// 화면 3 크롭 박스 자동 검증 (Node 전용). 실행: node tests.mjs
// 실측 랜드마크(fixture-landmarks.json)로 돈다. 브라우저·카메라·서버 없이 검증된다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  IDX, PART_IDS, PART_ORIENTATION, DEFAULT_ASPECT, DEFAULT_MARGIN,
  cropSpec, allCropSpecs, partBounds, padBox, fitAspect, clampToImage,
  faceWidth, eyeSpan, upscaleFactor, containsPart,
} from './crop.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(join(HERE, 'fixture-landmarks.json'), 'utf-8'));
const LM = FIX.landmarks;
const IMG = FIX.image;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('PASS ', name); pass++; }
  catch (e) { console.log('FAIL ', name, '\n       ', e.message); fail++; }
}
const ok = (c, m) => { if (!c) throw new Error(m || '조건 불충족'); };
const at = (i) => ({ x: LM[i][0], y: LM[i][1] });
const inBox = (p, b) => p.x >= b.x - 1e-6 && p.x <= b.x + b.w + 1e-6 &&
                        p.y >= b.y - 1e-6 && p.y <= b.y + b.h + 1e-6;

// ---------------- A. 기본 ----------------

t('A1 픽스처가 478점이고 이미지 크기가 있다', () => {
  ok(LM.length === 478, `점 ${LM.length}개`);
  ok(IMG.w > 0 && IMG.h > 0, '이미지 크기 없음');
});

t('A2 부위 6개 모두 유효한 박스가 나온다', () => {
  for (const p of PART_IDS) {
    const s = cropSpec(LM, p, { imageW: IMG.w, imageH: IMG.h });
    ok(s.box.w > 0 && s.box.h > 0, `${p} 크기 ${s.box.w}x${s.box.h}`);
    ok([s.box.x, s.box.y, s.box.w, s.box.h].every(Number.isFinite), `${p}에 NaN`);
  }
});

t('A3 방향이 브리프대로다 (눈 3부위 가로, 나머지 세로)', () => {
  ok(PART_ORIENTATION.brow === 'landscape' && PART_ORIENTATION.liner === 'landscape' &&
     PART_ORIENTATION.shadow === 'landscape', '눈 단계가 가로가 아님');
  ok(PART_ORIENTATION.lip === 'portrait' && PART_ORIENTATION.cheek === 'portrait' &&
     PART_ORIENTATION.contour === 'portrait', '세로 부위가 세로가 아님');
});

t('A4 알 수 없는 부위는 거부한다', () => {
  let threw = false;
  try { cropSpec(LM, 'nose'); } catch { threw = true; }
  ok(threw, '아무 부위나 받아들였다');
});

t('A5 같은 입력 → 같은 출력 (순수 함수)', () => {
  const a = JSON.stringify(allCropSpecs(LM, { imageW: IMG.w, imageH: IMG.h }));
  const b = JSON.stringify(allCropSpecs(LM, { imageW: IMG.w, imageH: IMG.h }));
  ok(a === b, '두 번 부르니 달라졌다');
});

// ---------------- B. 부위가 잘리지 않는다 (제일 중요) ----------------

t('B1 부위 랜드마크가 박스 안에 전부 들어간다', () => {
  for (const p of PART_IDS) {
    const s = cropSpec(LM, p, { imageW: IMG.w, imageH: IMG.h });
    ok(containsPart(s, LM), `${p}가 박스 밖으로 잘렸다`);
  }
});

t('B2 눈 단계는 양쪽 눈 바깥 끝이 반드시 들어간다', () => {
  for (const p of ['brow', 'liner', 'shadow']) {
    const s = cropSpec(LM, p, { imageW: IMG.w, imageH: IMG.h });
    ok(inBox(at(IDX.eyeOuterL), s.box), `${p}: 왼쪽 눈 바깥 끝이 밖에 있다`);
    ok(inBox(at(IDX.eyeOuterR), s.box), `${p}: 오른쪽 눈 바깥 끝이 밖에 있다`);
  }
});

t('B3 눈썹 박스는 눈썹 위 능선까지 포함한다', () => {
  const s = cropSpec(LM, 'brow', { imageW: IMG.w, imageH: IMG.h });
  for (const i of [...IDX.browL, ...IDX.browR]) {
    ok(inBox(at(i), s.box), `눈썹 랜드마크 ${i}가 밖에 있다`);
  }
});

t('B4 입술 박스는 입술 20점을 전부 포함한다', () => {
  const s = cropSpec(LM, 'lip', { imageW: IMG.w, imageH: IMG.h });
  for (const i of IDX.lipOuter) ok(inBox(at(i), s.box), `입술 랜드마크 ${i}가 밖에 있다`);
});

t('B5 쉐딩 박스는 턱 끝을 포함한다', () => {
  const s = cropSpec(LM, 'contour', { imageW: IMG.w, imageH: IMG.h });
  ok(inBox(at(IDX.chin), s.box), '턱 끝이 밖에 있다');
});

// ---------------- C. 종횡비 ----------------

t('C1 종횡비가 목표와 맞는다 (클램프 안 걸렸을 때)', () => {
  for (const p of PART_IDS) {
    const s = cropSpec(LM, p);       // 이미지 경계 없이
    const want = DEFAULT_ASPECT[PART_ORIENTATION[p]];
    const got = s.box.w / s.box.h;
    ok(Math.abs(got - want) / want < 0.001, `${p}: ${got.toFixed(4)} vs ${want.toFixed(4)}`);
  }
});

t('C2 종횡비를 직접 넘기면 그 값이 나온다', () => {
  const s = cropSpec(LM, 'lip', { aspect: 1 });
  ok(Math.abs(s.box.w / s.box.h - 1) < 0.001, `1:1을 요청했는데 ${s.box.w / s.box.h}`);
});

t('C3 fitAspect는 늘리기만 하고 줄이지 않는다', () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  for (const a of [0.5, 1, 2, 3]) {
    const f = fitAspect(box, a);
    ok(f.w >= box.w - 1e-9 && f.h >= box.h - 1e-9, `종횡비 ${a}에서 줄었다`);
  }
});

t('C4 잘못된 종횡비는 거부한다', () => {
  let threw = false;
  try { cropSpec(LM, 'lip', { aspect: 0 }); } catch { threw = true; }
  ok(threw, '종횡비 0을 받아들였다');
});

// ---------------- D. 여백·확대율 ----------------

t('D1 여백을 키우면 박스가 커진다 (단조)', () => {
  let prev = 0;
  for (const m of [0, 0.15, 0.4, 0.8]) {
    const s = cropSpec(LM, 'lip', { margin: m });
    ok(s.box.w > prev, `여백 ${m}에서 줄었다`);
    prev = s.box.w;
  }
});

t('D2 여백을 키우면 확대율이 떨어진다', () => {
  const a = cropSpec(LM, 'lip', { margin: 0.2 }).zoom;
  const b = cropSpec(LM, 'lip', { margin: 0.8 }).zoom;
  ok(a > b, `${a.toFixed(2)} → ${b.toFixed(2)}`);
});

t('D3 padBox가 중심을 유지한다', () => {
  const box = { x: 10, y: 20, w: 30, h: 40 };
  const p = padBox(box, 0.5);
  ok(Math.abs((p.x + p.w / 2) - (box.x + box.w / 2)) < 1e-9, '가로 중심 이동');
  ok(Math.abs((p.y + p.h / 2) - (box.y + box.h / 2)) < 1e-9, '세로 중심 이동');
});

t('D4 입술 확대율이 브리프의 2~3배 범위 안', () => {
  const s = cropSpec(LM, 'lip');
  ok(s.zoom >= 2 && s.zoom <= 3, `입술 확대율 ${s.zoom.toFixed(2)}배 (목표 2~3배)`);
});

t('D5 좌우를 같이 담는 부위는 얼굴 대비 1배를 크게 못 넘는다 (기하학적 상한)', () => {
  // 브리프의 "2~3배"가 입술에서만 가능한 이유. 스펙 검토용 근거다
  for (const p of ['brow', 'liner', 'shadow', 'cheek', 'contour']) {
    const s = cropSpec(LM, p);
    ok(s.zoom <= 1.2, `${p} 확대율 ${s.zoom.toFixed(2)}배 — 1.2배를 넘을 수 없어야 한다`);
  }
});

t('D6 얼굴 너비와 눈 사이 거리는 다른 값이다', () => {
  const fw = faceWidth(LM), es = eyeSpan(LM);
  ok(fw > es, `얼굴 너비 ${fw.toFixed(1)} <= 눈 사이 ${es.toFixed(1)}`);
  const r = es / fw;
  ok(r > 0.6 && r < 0.78, `눈 사이 / 얼굴 너비 = ${r.toFixed(3)} (실측 약 0.69)`);
});

t('D7 종횡비를 바꿔도 가로가 넓은 부위는 확대율이 그대로다', () => {
  // fitAspect가 높이만 늘리기 때문. 확대율은 여백이 정한다
  const z = [1, 4 / 3, 3 / 4, 9 / 16].map((a) => cropSpec(LM, 'lip', { aspect: a }).zoom);
  ok(z.every((v) => Math.abs(v - z[0]) < 1e-9), `종횡비마다 달라졌다: ${z.map((v) => v.toFixed(2))}`);
});

t('D8 upscaleFactor가 표시 폭 대비로 계산된다', () => {
  const s = cropSpec(LM, 'liner', { imageW: IMG.w, imageH: IMG.h });
  const u = upscaleFactor(s, 1840);
  ok(Math.abs(u - 1840 / s.box.w) < 1e-9, '계산이 다르다');
  ok(u > 1, `확대가 아니라 축소다 (${u})`);
});

// ---------------- E. 이미지 경계 ----------------

t('E1 박스가 이미지 안에 들어온다', () => {
  for (const p of PART_IDS) {
    const s = cropSpec(LM, p, { imageW: IMG.w, imageH: IMG.h });
    ok(s.box.x >= -1e-6 && s.box.y >= -1e-6, `${p}: 좌상단이 밖 (${s.box.x}, ${s.box.y})`);
    ok(s.box.x + s.box.w <= IMG.w + 1e-6, `${p}: 오른쪽이 밖`);
    ok(s.box.y + s.box.h <= IMG.h + 1e-6, `${p}: 아래가 밖`);
  }
});

t('E2 이미지보다 큰 박스는 줄여서 넣고 clamped 표시가 뜬다', () => {
  const r = clampToImage({ x: -50, y: -50, w: 1000, h: 1000 }, 200, 300);
  ok(r.clamped === true, 'clamped 표시가 없다');
  ok(r.w <= 200 + 1e-6 && r.h <= 300 + 1e-6, `안 들어감 ${r.w}x${r.h}`);
  ok(r.x >= -1e-6 && r.y >= -1e-6, '여전히 밖');
});

t('E3 클램프해도 종횡비는 유지된다', () => {
  const before = { x: -50, y: -50, w: 1000, h: 500 };
  const r = clampToImage(before, 200, 300);
  ok(Math.abs(r.w / r.h - before.w / before.h) < 1e-6, `종횡비 깨짐 ${r.w / r.h}`);
});

t('E4 이미지 크기를 안 주면 클램프하지 않는다', () => {
  const s = cropSpec(LM, 'contour');
  ok(s.clamped === false, 'clamped가 켜졌다');
});

// ---------------- F. 좌우 대칭 ----------------

t('F1 눈 단계 박스가 양 눈 중심에 놓인다', () => {
  const eyeCx = (at(IDX.eyeOuterL).x + at(IDX.eyeOuterR).x) / 2;
  for (const p of ['liner', 'shadow']) {
    const s = cropSpec(LM, p);
    const boxCx = s.box.x + s.box.w / 2;
    const off = Math.abs(boxCx - eyeCx) / s.box.w;
    ok(off < 0.05, `${p}: 중심이 ${(off * 100).toFixed(1)}% 치우침`);
  }
});

t('F3 부위가 박스 한가운데 온다 (경계 클램프 오차 허용)', () => {
  for (const p of PART_IDS) {
    const s = cropSpec(LM, p, { imageW: IMG.w, imageH: IMG.h });
    const c = s.content, b = s.box;
    const cx = (c.x + c.w / 2 - b.x) / b.w;
    const cy = (c.y + c.h / 2 - b.y) / b.h;
    ok(Math.abs(cx - 0.5) < 0.06, `${p}: 가로 중심 ${cx.toFixed(3)}`);
    ok(Math.abs(cy - 0.5) < 0.06, `${p}: 세로 중심 ${cy.toFixed(3)}`);
  }
});

t('F2 볼터치 박스가 좌우 볼을 다 담는다', () => {
  const s = cropSpec(LM, 'cheek', { imageW: IMG.w, imageH: IMG.h });
  ok(inBox(at(IDX.eyeBottomL), s.box) || inBox(at(IDX.mouthCornerL), s.box), '왼쪽 볼 기준점 없음');
  ok(inBox(at(IDX.eyeBottomR), s.box) || inBox(at(IDX.mouthCornerR), s.box), '오른쪽 볼 기준점 없음');
  ok(s.content.w > faceWidth(LM) * 0.5, `볼 범위가 너무 좁다 (${s.content.w.toFixed(1)}px)`);
});

// ---------------- 결과 ----------------

console.log('\n실측값 (기본 여백·기본 종횡비)');
console.log('  부위        방향        박스         얼굴대비   부위가 박스에서 차지하는 비율');
for (const p of PART_IDS) {
  const s = cropSpec(LM, p, { imageW: IMG.w, imageH: IMG.h });
  const fw = (s.content.w / s.box.w * 100).toFixed(0);
  const fh = (s.content.h / s.box.h * 100).toFixed(0);
  console.log(`  ${p.padEnd(10)} ${s.orientation.padEnd(11)} ` +
              `${(s.box.w.toFixed(0) + 'x' + s.box.h.toFixed(0)).padEnd(12)} ` +
              `${(s.zoom.toFixed(2) + '배').padEnd(9)} 가로 ${fw}% · 세로 ${fh}%` +
              (s.clamped ? '  (클램프됨)' : ''));
}
console.log('\n  세로 비율이 낮은 것은 종횡비를 맞추느라 위아래로 늘어났기 때문이다.');
console.log('  실제 레이아웃의 종횡비를 opts.aspect로 넘기면 이 값이 달라진다.');

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
