// 화면 4 POC 자동 검증. 브라우저 없이 Node에서 돈다.
//   node tests.mjs

import {
  eyeGuide, resample, normalsAlong, matrixToEuler, resolveGate, GATE_MSG,
  Stability, OneEuroFilter, LandmarkSmoother, laplacianVariance, toGray,
  srgbToLab, percentile, FrameStats, bboxOf, boxesOverlap, DEFAULT_GUIDE,
  anglesFromLandmarks, POSE_IDX, earOf, EAR_IDX, EAR_CLOSED, blendScore,
  DiffStats, AgreeStats, PeakStats,
} from './core.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '  ' + extra : ''}`); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const group = (t) => console.log(`\n${t}`);

// 열 우선 4x4로 포장 (MediaPipe가 주는 형식)
const colMajor = (R) => {
  const d = new Array(16).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) d[c * 4 + r] = R[r][c];
  d[15] = 1;
  return d;
};
const rotX = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
const rotY = (t) => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
const rotZ = (t) => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
const D = Math.PI / 180;

// 검증용 가짜 눈: 아래로 볼록한 속눈썹 호 (바깥 → 안쪽)
function fakeEye(cx = 100, cy = 100, w = 40) {
  const lash = [];
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    lash.push({ x: cx - w / 2 + w * u, y: cy - Math.sin(Math.PI * u) * w * 0.18 });
  }
  return {
    lash,
    outer: lash[0],
    inner: lash[8],
    irisC: { x: cx, y: cy + w * 0.12 },   // 눈 안쪽(아래) — 법선은 이 반대편을 향해야 한다
  };
}

// ---------------- A. 가이드 기하 ----------------
group('A. 가이드 기하');
{
  const eye = fakeEye();
  const g = eyeGuide(eye);
  ok('A1 샘플 개수가 설정과 같다', g.center.length === DEFAULT_GUIDE.samples);
  ok('A2 위·아래 테두리 개수가 중심선과 같다', g.upper.length === g.center.length && g.lower.length === g.center.length);

  const thick = Math.hypot(g.upper[10].x - g.lower[10].x, g.upper[10].y - g.lower[10].y);
  ok('A3 두께가 눈 너비 비율과 일치', near(thick, g.eyeW * DEFAULT_GUIDE.thickness, 1e-6),
    `측정 ${thick.toFixed(3)} / 기대 ${(g.eyeW * DEFAULT_GUIDE.thickness).toFixed(3)}`);

  const thin = eyeGuide(eye, { thickness: 0.04 });
  const t2 = Math.hypot(thin.upper[10].x - thin.lower[10].x, thin.upper[10].y - thin.lower[10].y);
  ok('A4 두께 비율을 절반으로 하면 두께도 절반', near(t2, thick / 2, 1e-6));

  const small = eyeGuide(fakeEye(100, 100, 20));
  ok('A5 얼굴이 작게 잡히면 두께도 같은 비율로 작아진다', near(small.thicknessPx, g.thicknessPx / 2, 1e-6));

  const noWing = eyeGuide(eye, { wingLen: 0 });
  ok('A6 꼬리를 빼면 경로가 짧아진다', noWing.lengthPx < g.lengthPx);

  const longWing = eyeGuide(eye, { wingLen: 0.5 });
  ok('A7 꼬리 비율이 크면 경로가 길어진다 (단조)', longWing.lengthPx > g.lengthPx);
}

// ---------------- B. 재샘플·법선 ----------------
group('B. 재샘플·법선');
{
  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  const { pts, total } = resample(line, 11);
  ok('B1 길이를 정확히 계산', near(total, 10));
  ok('B2 균등 간격으로 나눈다', near(pts[5].x, 5, 1e-9) && near(pts[10].x, 10, 1e-9));

  const same = resample([{ x: 3, y: 3 }, { x: 3, y: 3 }], 5);
  ok('B3 길이 0인 경로에서 죽지 않는다', same.total === 0 && same.pts.length === 5);

  const ns = normalsAlong(pts, { x: 5, y: 10 });   // away가 아래 → 법선은 위(-y)를 향해야
  ok('B4 법선이 기준점 반대쪽을 향한다', ns[5].y < 0);
  ok('B5 법선은 단위벡터', near(Math.hypot(ns[5].x, ns[5].y), 1, 1e-9));
}

// ---------------- C. 고개 각도 ----------------
group('C. 고개 각도');
{
  const I = matrixToEuler(colMajor([[1, 0, 0], [0, 1, 0], [0, 0, 1]]));
  ok('C1 단위행렬이면 0도', near(I.yaw, 0, 1e-9) && near(I.pitch, 0, 1e-9) && near(I.roll, 0, 1e-9));

  const y30 = matrixToEuler(colMajor(rotY(30 * D)));
  ok('C2 yaw 30도를 복원', near(y30.yaw, 30, 1e-6) && near(y30.pitch, 0, 1e-6), `yaw=${y30.yaw.toFixed(3)}`);

  const x10 = matrixToEuler(colMajor(rotX(10 * D)));
  ok('C3 pitch 10도를 복원', near(x10.pitch, 10, 1e-6) && near(x10.yaw, 0, 1e-6), `pitch=${x10.pitch.toFixed(3)}`);

  const z20 = matrixToEuler(colMajor(rotZ(20 * D)));
  ok('C4 roll 20도를 복원', near(z20.roll, 20, 1e-6) && near(z20.yaw, 0, 1e-6), `roll=${z20.roll.toFixed(3)}`);

  const yNeg = matrixToEuler(colMajor(rotY(-25 * D)));
  ok('C5 부호가 뒤집힌다', near(yNeg.yaw, -25, 1e-6));
}

// ---------------- D. 품질 게이트 ----------------
group('D. 품질 게이트');
{
  const all = { front: true, eyes: true, hand: true, sharp: true, bright: true };
  ok('D1 전부 통과면 ok', resolveGate(all).ok === true);

  const dark = resolveGate({ ...all, bright: false });
  ok('D2 하나 걸리면 그 문구', dark.ok === false && dark.message === GATE_MSG.bright);

  const two = resolveGate({ ...all, front: false, bright: false });
  ok('D3 여러 개 걸려도 우선순위 앞의 것 하나만', two.firstFail === 'front');

  const handVsSharp = resolveGate({ ...all, hand: false, sharp: false });
  ok('D4 손이 선명도보다 앞선다', handVsSharp.firstFail === 'hand');

  const s = new Stability(5);
  [true, true, true, true].forEach((v) => s.push(v));
  ok('D5 4프레임으로는 통과 못 함', s.ok === false);
  s.push(true);
  ok('D6 5프레임 연속이면 통과', s.ok === true);
  s.push(false);
  ok('D7 한 번 실패하면 처음부터', s.ok === false && s.run === 0);
}

// ---------------- E. 1€ 필터 ----------------
group('E. 1€ 필터');
{
  const f = new OneEuroFilter({ minCutoff: 1, beta: 0 });
  let out = 0;
  for (let i = 0; i < 60; i++) out = f.filter(5, i / 30);
  ok('E1 값이 일정하면 그대로 수렴', near(out, 5, 1e-6));

  const g = new OneEuroFilter({ minCutoff: 1, beta: 0 });
  g.filter(0, 0);
  const step = g.filter(10, 1 / 30);
  ok('E2 갑자기 튀면 따라가되 덜 간다 (지터 억제)', step > 0 && step < 10, `출력 ${step.toFixed(3)}`);

  // 같은 점프에서 beta가 크면 더 많이 따라간다 (속도 기반 적응)
  const slow = new OneEuroFilter({ minCutoff: 1, beta: 0 });
  const fast = new OneEuroFilter({ minCutoff: 1, beta: 1 });
  slow.filter(0, 0); fast.filter(0, 0);
  const a = slow.filter(10, 1 / 30), b = fast.filter(10, 1 / 30);
  ok('E3 beta가 크면 빠른 움직임을 더 따라간다', b > a, `beta0 ${a.toFixed(3)} < beta1 ${b.toFixed(3)}`);

  const r = new OneEuroFilter();
  r.filter(100, 0); r.reset();
  ok('E4 reset 뒤 첫 값은 입력 그대로', r.filter(3, 1) === 3);

  const sm = new LandmarkSmoother({ minCutoff: 1, beta: 0 });
  const lm = [{ x: 0.5, y: 0.5, z: 0 }, { x: 0.2, y: 0.8, z: 0 }];
  const first = sm.apply(lm, 0);
  ok('E5 첫 프레임은 입력과 같다', near(first[0].x, 0.5) && near(first[1].y, 0.8));
  ok('E6 z는 건드리지 않는다', first[0].z === 0);

  // 슬라이더로 돌아가는 중에 바꿔도 이미 만들어진 필터에 먹어야 한다
  const sp = new LandmarkSmoother({ minCutoff: 1, beta: 0 });
  sp.apply([{ x: 0, y: 0, z: 0 }], 0);
  sp.setParams({ beta: 10 });
  ok('E7 setParams가 기존 필터에도 반영된다', sp.fx.get(0).x.beta === 10);

  const s1 = new LandmarkSmoother({ minCutoff: 1, beta: 0 });
  s1.apply([{ x: 0, y: 0, z: 0 }], 0);
  const b0 = s1.apply([{ x: 1, y: 0, z: 0 }], 1 / 30)[0].x;
  const s2 = new LandmarkSmoother({ minCutoff: 1, beta: 0 });
  s2.apply([{ x: 0, y: 0, z: 0 }], 0);
  s2.setParams({ beta: 10 });
  const b10 = s2.apply([{ x: 1, y: 0, z: 0 }], 1 / 30)[0].x;
  ok('E8 정규화 좌표에서 beta 10이면 훨씬 빨리 따라간다', b10 > b0 * 3,
    `beta0 ${b0.toFixed(3)} → beta10 ${b10.toFixed(3)}`);
}

// ---------------- F. 선명도·밝기 ----------------
group('F. 선명도·밝기');
{
  const w = 16, h = 16;
  const flat = new Float32Array(w * h).fill(128);
  ok('F1 평평한 이미지는 분산 0', near(laplacianVariance(flat, w, h), 0, 1e-9));

  const checker = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) checker[y * w + x] = (x + y) % 2 ? 255 : 0;
  ok('F2 체커보드는 분산이 크다', laplacianVariance(checker, w, h) > 1000);

  // 흐리게 만들면(이웃 평균) 분산이 줄어야 한다
  const blur = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    blur[i] = (checker[i] + checker[i - 1] + checker[i + 1] + checker[i - w] + checker[i + w]) / 5;
  }
  ok('F3 흐려지면 분산이 작아진다', laplacianVariance(blur, w, h) < laplacianVariance(checker, w, h));
  ok('F4 3px 미만이면 0을 준다', laplacianVariance(new Float32Array(4), 2, 2) === 0);

  const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  const g = toGray(rgba, 2, 1);
  ok('F5 흰색·검정 그레이 변환', near(g[0], 255, 0.5) && near(g[1], 0, 0.5));

  const white = srgbToLab(255, 255, 255), black = srgbToLab(0, 0, 0);
  ok('F6 흰색 L*≈100', near(white[0], 100, 0.5), `L=${white[0].toFixed(2)}`);
  ok('F7 검정 L*≈0', near(black[0], 0, 0.5));
  const mid = srgbToLab(128, 128, 128);
  ok('F8 회색은 사이값이고 무채색', mid[0] > 0 && mid[0] < 100 && Math.abs(mid[1]) < 1 && Math.abs(mid[2]) < 1);
}

// ---------------- G. 측정·박스 ----------------
group('G. 측정·박스');
{
  ok('G1 백분위 계산', percentile([1, 2, 3, 4, 5], 50) === 3 && percentile([1, 2, 3, 4, 5], 100) === 5);
  ok('G2 빈 배열은 0', percentile([], 95) === 0);

  const fs = new FrameStats(5);
  [10, 20, 30, 40, 50, 60].forEach((v) => fs.push(v));
  const s = fs.summary();
  ok('G3 최근 N개만 남긴다', s.n === 5 && s.max === 60);
  ok('G4 평균에서 fps를 낸다', near(s.fps, 1000 / s.avg, 1e-9));
  const fs2 = new FrameStats();
  [33.3, 33.3, 33.3].forEach((v) => fs2.push(v));
  ok('G5 33.3ms면 약 30fps', Math.abs(fs2.summary().fps - 30) < 0.1);

  const a = bboxOf([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
  const b = bboxOf([{ x: 5, y: 5 }, { x: 20, y: 20 }]);
  const c = bboxOf([{ x: 30, y: 30 }, { x: 40, y: 40 }]);
  ok('G6 겹치는 박스를 잡는다', boxesOverlap(a, b) === true);
  ok('G7 안 겹치면 false', boxesOverlap(a, c) === false);
}

// ---------------- H. 두 경로 비교 (A1 측정용) ----------------
group('H. 두 경로 비교');
{
  // 가짜 얼굴: 얼굴 폭 100, 이마~턱 100, 코끝을 옮겨 가며 각도를 확인
  const face = (noseX, noseY) => {
    const p = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
    p[POSE_IDX.faceL] = { x: 0, y: 50 }; p[POSE_IDX.faceR] = { x: 100, y: 50 };
    p[POSE_IDX.forehead] = { x: 50, y: 0 }; p[POSE_IDX.chin] = { x: 50, y: 100 };
    p[POSE_IDX.noseTip] = { x: noseX, y: noseY };
    return p;
  };
  const c = anglesFromLandmarks(face(50, 55));
  ok('H1 코가 한가운데면 yaw·pitch 0', near(c.yaw, 0, 1e-9) && near(c.pitch, 0, 1e-9));
  ok('H2 코가 오른쪽으로 가면 yaw 양수', anglesFromLandmarks(face(75, 55)).yaw > 20);
  ok('H3 코가 아래로 가면 pitch 양수', anglesFromLandmarks(face(50, 75)).pitch > 15);

  // 가짜 눈: 가로 10, 위아래 간격을 바꿔 EAR 확인
  const eye = (gap) => {
    const p = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
    const e = EAR_IDX.R;
    p[e.corner[0]] = { x: 0, y: 0 }; p[e.corner[1]] = { x: 10, y: 0 };
    for (const i of e.upper) p[i] = { x: 5, y: 0 };
    for (const i of e.lower) p[i] = { x: 5, y: gap };
    return p;
  };
  ok('H4 눈이 벌어지면 EAR 큼', near(earOf(eye(2), 'R'), 0.2, 1e-9));
  ok('H5 눈이 감기면 임계 아래', earOf(eye(1), 'R') < EAR_CLOSED);

  const cats = [{ categoryName: 'eyeBlinkLeft', score: 0.8 }, { categoryName: 'mouthSmileRight', score: 0.3 }];
  ok('H6 블렌드셰이프를 이름으로 찾는다', blendScore(cats, 'eyeBlinkLeft') === 0.8);
  ok('H7 없는 이름은 null', blendScore(cats, 'jawOpen') === null && blendScore(null, 'x') === null);

  const d = new DiffStats();
  d.push(10, 7).push(5, 5).push(0, 4);
  const ds = d.summary();
  ok('H8 차이의 평균', near(ds.mean, (3 + 0 + 4) / 3, 1e-9) && ds.n === 3);
  ok('H9 최대 차이', ds.max === 4);
  d.push(NaN, 1);
  ok('H10 숫자가 아니면 무시', d.summary().n === 3);

  const a = new AgreeStats();
  a.push(true, true).push(true, false).push(false, false).push(null, true);
  const as = a.summary();
  ok('H11 일치율과 한쪽만 참인 횟수', as.n === 3 && near(as.rate, 2 / 3, 1e-9) && as.aOnly === 1 && as.bOnly === 0);

  const pk = new PeakStats();
  pk.push(0.1).push(0.9).push(0.2);
  ok('H12 최대·평균', pk.summary().max === 0.9 && near(pk.summary().mean, 0.4, 1e-9));
}

console.log(`\n${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
