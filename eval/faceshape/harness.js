// #60 얼굴형 규칙 정확도 기준선.
// 얼굴형 라벨이 붙은 공개 사진을 앱과 같은 랜드마크 모델로 읽고, 앱의 규칙 함수 estimateFaceShape 에 그대로 넣어
// 사람이 붙인 라벨과 몇 장 맞는지 센다. 규칙 함수는 옮기지 않고 poc/full/lib/looks.js 에서 불러온다.
import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { estimateFaceShape } from '../../poc/full/lib/looks.js';

const log = (s) => { document.getElementById('log').textContent += s + '\n'; };

async function loadImg(src) {
  const im = new Image(); im.src = src; await im.decode();
  const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  cv.getContext('2d').drawImage(im, 0, 0); return cv;
}

async function main() {
  log('모델 불러오는 중…');
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const delegate = new URLSearchParams(location.search).get('delegate') || 'GPU';   // 헤드리스 실행은 ?delegate=CPU
  const opts = (d) => ({ baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: d }, runningMode: 'IMAGE', numFaces: 1 });
  const face = await FaceLandmarker.createFromOptions(files, opts(delegate)).catch(() => FaceLandmarker.createFromOptions(files, opts('CPU')));

  const items = await (await fetch('data/list.json')).json();   // [{file, label}]
  const rows = [];
  for (let i = 0; i < items.length; i++) {
    const { file, label } = items[i];
    let cv; try { cv = await loadImg(`data/${file}`); } catch { rows.push({ file, label, pred: null, status: 'bad_image' }); continue; }
    const lm = face.detect(cv).faceLandmarks[0];
    if (!lm) { rows.push({ file, label, pred: null, status: 'no_face' }); continue; }
    const px = lm.map((p) => ({ x: p.x * cv.width, y: p.y * cv.height }));   // 앱과 같이 픽셀 좌표로
    const r = estimateFaceShape(px);
    rows.push({ file, label, pred: r.label, status: 'ok', ratio: +r.ratio.toFixed(4), jaw: +r.jaw.toFixed(4), fore: +r.fore.toFixed(4),
      lm: px.map((p) => [+p.x.toFixed(1), +p.y.toFixed(1)]) });   // 추가 기준(높이별 폭·턱 각도) 계산용
    if (i % 100 === 99) log(`${i + 1}/${items.length}`);
  }
  window.RESULTS = rows;
  log(`끝: ${rows.length}장`);
}
main().catch((e) => { log('오류: ' + e); window.RESULTS_ERROR = String(e); });
