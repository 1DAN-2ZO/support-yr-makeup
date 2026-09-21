// node tools/extract-face-uv.js
// vendor/canonical_face_model.obj(UV) + vendor/tfjs_triangulation.js(삼각분할)를 합쳐
// assets/face-uv.json(468개 [u,v])과 assets/face-triangles.json(2640 인덱스)을 만든다.
// 출처·라이선스는 vendor/README.md 참고 (둘 다 Apache-2.0).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(__dirname, "vendor");
const ASSETS = path.join(__dirname, "..", "assets");

// ---------- 1) canonical_face_model.obj 파싱 → 랜드마크 인덱스 순서의 UV ----------
function extractUV() {
  const objText = fs.readFileSync(path.join(VENDOR, "canonical_face_model.obj"), "utf8");
  const uvs = []; // vt 목록 (obj 순서 그대로)
  const vToVt = new Map(); // v_index(0-based) -> vt_index(0-based)

  for (const line of objText.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "vt") {
      uvs.push([parseFloat(parts[1]), parseFloat(parts[2])]);
    } else if (parts[0] === "f") {
      for (const p of parts.slice(1, 4)) {
        const [viStr, vtiStr] = p.split("/");
        const vi = parseInt(viStr, 10) - 1; // obj는 1-based
        const vti = parseInt(vtiStr, 10) - 1;
        if (vToVt.has(vi) && vToVt.get(vi) !== vti) {
          throw new Error(`v${vi}가 서로 다른 vt(${vToVt.get(vi)} vs ${vti})에 매핑됨 — obj 가정이 깨짐`);
        }
        vToVt.set(vi, vti);
      }
    }
  }

  const n = vToVt.size;
  const uvByLandmark = new Array(n);
  for (const [vi, vti] of vToVt) {
    const [u, v] = uvs[vti];
    uvByLandmark[vi] = [u, 1 - v]; // v 좌표 뒤집기: obj와 WebGL 텍스처의 세로 방향이 반대
  }
  return uvByLandmark;
}

// ---------- 2) TFJS TRIANGULATION 파싱 ----------
function extractTriangulation() {
  const src = fs.readFileSync(path.join(VENDOR, "tfjs_triangulation.js"), "utf8");
  const m = src.match(/export const TRIANGULATION = (\[[\s\S]*?\]);/);
  if (!m) throw new Error("tfjs_triangulation.js에서 TRIANGULATION 배열을 못 찾음");
  // eslint 경고 무시: 신뢰된 벤더 파일을 빌드 타임에만 파싱(런타임 아님)
  const arr = JSON.parse(m[1].replace(/,\s*\]/g, "]"));
  return arr;
}

// ---------- 3) 눈 안쪽 삼각형 제거 ----------
// TFJS 삼각분할·MediaPipe 자체 삼각분할 둘 다 눈 부분에 실제 구멍이 없음(육안+경계간선 분석으로 확인됨,
// 둘 다 눈동자 위까지 삼각형으로 채워져 있음). C4 렌더러는 알파 블렌딩이라 각 부위 마스크가 눈동자를
// 안 덮으면 실제로는 문제 없을 가능성이 높지만, 안전하게 기하학적으로도 구멍을 만들어 둔다.
//
// 시행착오 기록 (다음에 또 건드릴 사람을 위해):
//   1) 원(circle), 반경=눈꺼풀선 최대반지름×1.1 → 눈썹 인덱스와는 안 겹쳤지만, 눈은 가로로 긴
//      아몬드형이라 원으로 감싸면 세로로 과하게 부풀어서 눈섀도우 밴드(눈꺼풀 선~눈썹 45% 지점,
//      app.js buildRegions와 동일 정의) 위쪽 경계 9점을 전부 삼켰다(사용자가 스크린샷으로 지적).
//   2) 반경을 눈섀도우 밴드에 안 닿을 때까지 줄임 → 안 겹치긴 하는데 구멍이 8점/눈으로 너무 작아짐.
//   3) 원 대신 "눈꺼풀선 + 그걸 세로로 대칭시킨 가짜 아래 경계"로 폴리곤 → 대칭 근사가 부정확해서
//      후보가 4점/눈밖에 안 잡히고 삼각형이 하나도 안 지워짐.
//   4) 원 + y축 하한선: 반경은 넉넉하게(아래·옆으로) 잡되, 눈썹 쪽(y가 눈꺼풀선 최소값보다 작은
//      방향)으로는 절대 못 넘어가게 클램프. 눈섀도우 밴드는 항상 눈꺼풀선보다 위(y가 더 작음)에서
//      시작하므로, 이 y 하한선 하나만으로 반경 크기와 무관하게 구조적으로 안 겹친다(실측: mult 1~2.0
//      전부 겹침 0). 근데 원이라 세로(눈꺼풀~다크서클 라인)로도 가로만큼 늘어나서, 다크서클 쪽까지
//      구멍이 파고들었다(사용자가 지적) — 눈은 가로로 길고 세로는 짧은 아몬드형인데 원은 그 비율을
//      못 담는다.
//   5) (채택) 타원 + y축 하한선: 가로 반지름은 눈 폭(양끝 눈꼬리 거리) 기준, 세로 반지름은 그보다
//      훨씬 작게(눈 폭의 35%) — 실제 눈 세로:가로 비율에 맞춤. 위쪽은 여전히 눈꺼풀선에서 클램프.
const EYES_R_UPPER = [133, 173, 157, 158, 159, 160, 161, 246, 33];
const EYES_L_UPPER = [362, 398, 384, 385, 386, 387, 388, 466, 263];
const BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const EYESHADOW_REACH = 0.45; // app.js와 반드시 동일하게 유지
const EYE_RX_FRAC = 0.65; // 가로 반지름 = 눈 폭 × 이 비율
const EYE_RY_FRAC = 0.35; // 세로 반지름 = 눈 폭 × 이 비율 (다크서클 라인 침범 방지 — 가로보다 훨씬 작게)

function centroid(pts) { return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]; }
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

function eyeInteriorSet(uv, upperIdx, browIdx, label) {
  const upperPts = upperIdx.map((i) => uv[i]);
  const c = centroid(upperPts);
  const browC = centroid(browIdx.map((i) => uv[i]));
  const shadowTop = upperPts.map((p) => lerp(p, browC, EYESHADOW_REACH));
  const lidTopY = Math.min(...upperPts.map((p) => p[1])); // 눈꺼풀선에서 눈썹에 가장 가까운(y 최소) 점 — 이 위로는 금지

  const eyeWidth = Math.max(...upperPts.map((p) => p[0])) - Math.min(...upperPts.map((p) => p[0]));
  const rx = eyeWidth * EYE_RX_FRAC, ry = eyeWidth * EYE_RY_FRAC;
  const inRegion = (p) => {
    if (p[1] < lidTopY) return false;
    const dx = (p[0] - c[0]) / rx, dy = (p[1] - c[1]) / ry;
    return dx * dx + dy * dy <= 1;
  };

  const set = new Set();
  uv.forEach((p, i) => { if (inRegion(p)) set.add(i); });

  const leakedBrow = browIdx.filter((i) => set.has(i));
  const leakedShadow = shadowTop.filter((p) => inRegion(p));
  if (leakedBrow.length) throw new Error(`${label}: 눈썹 인덱스가 눈 후보에 섞임 [${leakedBrow}]`);
  if (leakedShadow.length) throw new Error(`${label}: 눈섀도우 밴드 경계점이 눈 후보에 섞임 (${leakedShadow.length}개)`);

  console.log(`  ${label}: rx=${rx.toFixed(4)}, ry=${ry.toFixed(4)}, lidTopY=${lidTopY.toFixed(4)}, 후보점=${set.size}개`);
  return set;
}

function removeEyeInteriorTriangles(uv, tri) {
  const eyeR = eyeInteriorSet(uv, EYES_R_UPPER, BROW_R, "오른쪽눈");
  const eyeL = eyeInteriorSet(uv, EYES_L_UPPER, BROW_L, "왼쪽눈");
  const kept = [];
  let removed = 0;
  for (let i = 0; i < tri.length; i += 3) {
    const [a, b, c] = [tri[i], tri[i + 1], tri[i + 2]];
    const allInR = eyeR.has(a) && eyeR.has(b) && eyeR.has(c);
    const allInL = eyeL.has(a) && eyeL.has(b) && eyeL.has(c);
    if (allInR || allInL) { removed++; continue; }
    kept.push(a, b, c);
  }
  console.log(`눈 안쪽 삼각형 ${removed}개 제거 (오른쪽눈 후보점 ${eyeR.size}개, 왼쪽눈 후보점 ${eyeL.size}개)`);
  return kept;
}

// ---------- 4) 검증 ----------
function validate(uv, tri) {
  const errors = [];
  if (uv.length !== 468) errors.push(`UV 길이 ${uv.length} !== 468`);
  if (tri.length % 3 !== 0) errors.push(`삼각분할 길이 ${tri.length}가 3의 배수가 아님`);
  if (tri.length > 2640) errors.push(`삼각분할 길이 ${tri.length} > 2640(원본보다 늘어남 — 필터링 버그)`);
  uv.forEach(([u, v], i) => {
    if (u < 0 || u > 1 || v < 0 || v > 1) errors.push(`uv[${i}] = [${u},${v}] 범위 [0,1] 밖`);
  });
  tri.forEach((idx, i) => {
    if (idx < 0 || idx > 467 || !Number.isInteger(idx)) errors.push(`triangles[${i}] = ${idx} 범위 0..467 밖`);
  });
  return errors;
}

// ---------- 실행 ----------
const uv = extractUV();
const rawTri = extractTriangulation();
const tri = removeEyeInteriorTriangles(uv, rawTri);
const errors = validate(uv, tri);

if (errors.length) {
  console.error("검증 실패:");
  errors.forEach((e) => console.error("  - " + e));
  process.exit(1);
}

fs.mkdirSync(ASSETS, { recursive: true });
fs.writeFileSync(path.join(ASSETS, "face-uv.json"), JSON.stringify(uv));
fs.writeFileSync(path.join(ASSETS, "face-triangles.json"), JSON.stringify(tri));

console.log(`OK — face-uv.json (${uv.length}개 [u,v]), face-triangles.json (${tri.length}개 인덱스, ${tri.length / 3}개 삼각형)`);
console.log("숫자 검증만으로는 인덱스 꼬임을 못 잡을 수 있음 — tools/preview-uv.html로 눈·입이 구멍으로 보이는지 육안 확인 필요.");
