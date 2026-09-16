// 화면 3 부위 완성본 — 레이아웃 데모.
// 크롭 계산은 전부 crop.js(순수 함수). 여기서는 배치와 표시만 한다.

import { cropSpec, PART_IDS, PART_ORIENTATION, upscaleFactor } from './crop.js';
import {
  PART_NAME as NAME, createSession, goTo, recordResult, skipPart,
  chips as chipView, hintFor, nextPart, isComplete,
  saveSession, loadSession, clearSession,
} from './session.js';

const SAMPLES = Array.from({ length: 5 }, (_, i) => `person_${i + 1}_front_open.jpg`);
const PHOTO_DIR = '../samples/phone-portraits-20';

// 룩 템플릿 콘텐츠가 정해지기 전까지 쓰는 더미. 문장은 화면 브리프의 예시를 그대로 썼다.
// 실제로는 LookTemplate에 사람이 적어 둔 고정 문장이 온다 (docs/screen3-tech-v6.md 5장).
const DUMMY = {
  brow:    { why: '앞머리는 흐리게, 산은 눈동자 바깥에 두고 꼬리를 살짝 내려 그리세요.',
             need: '브라운 아이브로 펜슬 + 스크루 브러시' },
  liner:   { why: '눈꼬리를 살짝 올려 짧게 빼세요. 양쪽 꼬리 높이를 맞추세요.',
             need: '블랙 젤 라이너 + 각진 브러시' },
  shadow:  { why: '눈을 감고 눈꺼풀 가운데부터 바깥으로 펴 바르세요.',
             need: '다크 브라운 섀도우(매트) + 블렌딩 브러시' },
  lip:     { why: '입술 산을 또렷하게 잡고 아래 경계는 살짝 안쪽으로 그리세요.',
             need: 'MLBB 립 + 립 브러시' },
  cheek:   { why: '광대 위에서 관자놀이 쪽으로 옅게 쓸어 올리세요.',
             need: '핑크 파우더 블러셔 + 블러셔 브러시' },
  contour: { why: '둥근 얼굴형이라 턱선과 광대 아래에 쉐딩을, 광대 위에 하이라이트를 넣었어요.',
             need: '컨투어 파우더 + 하이라이터 + 브러시' },
};

const $ = (id) => document.getElementById(id);
const setStatus = (t, cls = '') => { $('status').textContent = t; $('status').className = `status ${cls}`; };

let landmarker = null;
let photo = null;      // { url, w, h, lm }
let flip = false;      // 방향을 일부러 뒤집어 안내 화면을 확인
let session = null;    // 진행 칩의 근거. session.js가 관리한다

const part = () => session.currentPart;

/** 세션이 바뀔 때마다 저장한다 (F-07: 앱이 꺼져도 복원). */
function update(next) {
  session = next;
  saveSession(session, window.localStorage);
  render();
}

// ---------------- 랜드마크 ----------------

async function initLandmarker() {
  const { FaceLandmarker, FilesetResolver } =
    await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  landmarker = await FaceLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'IMAGE', numFaces: 1,
  });
}

async function loadPhoto(file) {
  const url = `${PHOTO_DIR}/${file}`;
  setStatus('얼굴 찾는 중…');
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const cv = new OffscreenCanvas(bitmap.width, bitmap.height);
  cv.getContext('2d').drawImage(bitmap, 0, 0);
  const res = landmarker.detect(cv);
  if (!res.faceLandmarks?.length) { setStatus(`${file}: 얼굴을 찾지 못했습니다`, 'bad'); return; }
  photo = {
    url, w: bitmap.width, h: bitmap.height,
    lm: res.faceLandmarks[0].map((p) => [p.x * bitmap.width, p.y * bitmap.height]),
  };
  $('render').src = url;
  setStatus(`불러옴 · ${file} · ${bitmap.width}×${bitmap.height}`, 'ok');
  render();
}

// ---------------- 렌더 ----------------

function renderChips() {
  $('chips').innerHTML = chipView(session).map((c) => {
    const score = c.score !== null ? `<span class="score">${c.score}</span>` : '';
    return `<button class="chip ${c.active ? 'active' : ''}" data-part="${c.partId}" data-status="${c.status}"
              title="${c.name} · ${c.label}"><span class="dot"></span>${c.short}${score}</button>`;
  }).join('');
  for (const el of $('chips').querySelectorAll('.chip')) {
    el.onclick = () => update(goTo(session, el.dataset.part));   // F-04: 어느 단계로든 이동
  }
  // 칩이 넘치면 지금 부위가 안 보일 수 있다. 항상 보이게 끌어온다
  $('chips').querySelector('.chip.active')
    ?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

/** 표시 영역의 실제 종횡비를 crop.js에 넘기고, 받은 박스대로 이미지를 배치한다. */
function placeImage(partId = part()) {
  const vp = $('viewport');
  const vw = vp.clientWidth, vh = vp.clientHeight;
  if (!vw || !vh || !photo) return null;

  const spec = cropSpec(photo.lm, partId, {
    imageW: photo.w, imageH: photo.h,
    aspect: vw / vh,                    // ← 가정값이 아니라 실제 레이아웃 값
  });

  const scale = vw / spec.box.w;
  const img = $('render');
  img.style.width = `${photo.w * scale}px`;
  img.style.height = 'auto';
  img.style.left = `${-spec.box.x * scale}px`;
  img.style.top = `${-spec.box.y * scale}px`;

  const bl = $('boxline');
  bl.hidden = !$('showBox').checked;
  if (!bl.hidden) {
    bl.style.left = `${(spec.content.x - spec.box.x) * scale}px`;
    bl.style.top = `${(spec.content.y - spec.box.y) * scale}px`;
    bl.style.width = `${spec.content.w * scale}px`;
    bl.style.height = `${spec.content.h * scale}px`;
  }
  return { spec, vw, vh, scale };
}

function render() {
  if (!photo || !session) return;
  const cur = part();
  $('partSel').value = cur;
  const want = PART_ORIENTATION[cur];
  const shown = flip ? (want === 'landscape' ? 'portrait' : 'landscape') : want;
  $('phone').dataset.orientation = shown;

  renderChips();
  $('title').textContent = `${NAME[cur]} · 완성본`;
  $('rationale').textContent = DUMMY[cur].why;
  $('need').textContent = DUMMY[cur].need;

  // 방향이 안 맞으면 안내를 띄운다 (실제 앱에서는 기기 방향으로 판단)
  const bad = shown !== want;
  $('rotate').hidden = !bad;
  $('rotatetext').textContent = want === 'landscape' ? '폰을 가로로 돌리세요' : '폰을 세로로 돌리세요';

  // 앞 단계를 건너뛰고 왔으면 한 줄만 알려 준다. 이동을 막지는 않는다 (F-04)
  const hint = hintFor(session, cur);
  $('hint').hidden = !hint;
  if (hint) $('hint').textContent = hint;

  const r = placeImage(cur);
  if (!r) return;
  const { spec, vw } = r;
  const up = upscaleFactor(spec, vw * (window.devicePixelRatio || 1));
  $('info').innerHTML =
    `<b>${NAME[cur]}</b> · ${want === 'landscape' ? '가로' : '세로'} · ` +
    `표시 영역 ${vw}×${r.vh} (종횡비 ${(vw / r.vh).toFixed(2)}) · ` +
    `크롭 ${spec.box.w.toFixed(0)}×${spec.box.h.toFixed(0)}px · ` +
    `얼굴 대비 <b>${spec.zoom.toFixed(2)}배</b> · ` +
    `원본을 <b>${up.toFixed(1)}배</b>로 늘려 표시${spec.clamped ? ' · 이미지 경계로 축소됨' : ''}` +
    `<br>부위가 표시 영역의 가로 ${(spec.content.w / spec.box.w * 100).toFixed(0)}% · ` +
    `세로 ${(spec.content.h / spec.box.h * 100).toFixed(0)}%를 차지한다.`;
}

// ---------------- 시작 ----------------

async function main() {
  $('sampleSel').innerHTML = SAMPLES.map((f, i) => `<option value="${f}">${i + 1}번</option>`).join('');
  $('partSel').innerHTML = PART_IDS.map((p) => `<option value="${p}">${NAME[p]}</option>`).join('');

  // 저장된 세션이 있으면 이어서 (F-07). 없으면 새로 시작
  session = loadSession(window.localStorage) || createSession();

  try { await initLandmarker(); }
  catch (e) { setStatus(`모델을 불러오지 못했습니다: ${e.message}`, 'bad'); return; }

  await loadPhoto(SAMPLES[0]);

  $('sampleSel').onchange = (e) => loadPhoto(e.target.value);
  $('partSel').onchange = (e) => update(goTo(session, e.target.value));
  $('forceFlip').onchange = (e) => { flip = e.target.checked; render(); };
  $('showBox').onchange = render;
  $('go').onclick = () => setStatus('화면 4(실시간 테두리)로 이동 — 아직 미구현', 'ok');

  // 화면 4·5가 아직 없으므로 확인받기 결과를 여기서 흉내낸다
  $('doPass').onclick = () => {
    const score = 60 + Math.floor(Math.random() * 40);
    update(recordResult(session, part(), { score }));
    setStatus(`${NAME[part()]} 결과 기록 · ${score}점`, 'ok');
  };
  $('doSkip').onclick = () => {
    update(skipPart(session, part()));
    setStatus(`${NAME[part()]} 건너뜀`, 'ok');
  };
  $('doNext').onclick = () => {
    const n = nextPart(session);
    if (!n) { setStatus(isComplete(session) ? '모든 부위 완료 → 화면 6 전체 리뷰' : '마지막 부위입니다', 'ok'); return; }
    update(goTo(session, n));
  };
  $('doReset').onclick = () => {
    clearSession(window.localStorage);
    update(createSession());
    setStatus('세션을 새로 시작했습니다', 'ok');
  };
  new ResizeObserver(() => placeImage()).observe($('viewport'));

  const q = new URLSearchParams(location.search);
  const auto = q.get('part');
  if (auto && PART_IDS.includes(auto)) update(goTo(session, auto));
  if (q.get('bare')) document.body.classList.add('bare');   // 폰만 남긴다

}

main();
