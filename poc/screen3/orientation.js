// 화면 방향 판단 (순수 함수). 브라우저·Node 공용 ESM.
//
// 부위마다 필요한 방향이 다르다 (눈 3부위 가로 / 나머지 세로).
// **iOS 사파리는 화면 방향을 잠글 수 없다.** 그래서 잠그는 대신 안내하고,
// 계속 안 돌리면 그냥 보여주되 확대율이 낮다고 표시한다 (impl-screen1-5 3-2).
//
// DOM을 쓰지 않는다. 실제 방향을 재는 것은 app.js가 한다.

export const LANDSCAPE = 'landscape';
export const PORTRAIT = 'portrait';

/** 안 돌려도 이만큼 지나면 그냥 보여준다. 계속 막으면 쓸 수가 없다. */
export const DEFAULT_GRACE_MS = 6000;

export const ROTATE_TEXT = {
  [LANDSCAPE]: '폰을 가로로 돌리세요',
  [PORTRAIT]: '폰을 세로로 돌리세요',
};

/** 화면 크기로 방향을 정한다. 정사각형은 가로로 친다. */
export function orientationOf(w, h) {
  if (!(w > 0) || !(h > 0)) throw new Error(`화면 크기가 잘못됐습니다: ${w}x${h}`);
  return w >= h ? LANDSCAPE : PORTRAIT;
}

/**
 * 지금 무엇을 보여줄지 정한다.
 *
 * @param {object} o
 * @param {string} o.want    이 부위에 필요한 방향
 * @param {string} o.actual  기기의 실제 방향
 * @param {number} o.elapsedMs 방향이 안 맞은 채로 지난 시간
 * @param {number} [o.graceMs]
 * @returns {{match:boolean, show:'content'|'rotate', rotateText:string|null,
 *            lowZoom:boolean, lowZoomText:string|null}}
 */
export function guidanceState({ want, actual, elapsedMs = 0, graceMs = DEFAULT_GRACE_MS }) {
  for (const [k, v] of [['want', want], ['actual', actual]]) {
    if (v !== LANDSCAPE && v !== PORTRAIT) throw new Error(`${k}가 잘못됐습니다: ${v}`);
  }
  if (actual === want) {
    return { match: true, show: 'content', rotateText: null, lowZoom: false, lowZoomText: null };
  }
  if (elapsedMs < graceMs) {
    return { match: false, show: 'rotate', rotateText: ROTATE_TEXT[want], lowZoom: false, lowZoomText: null };
  }
  // 계속 안 돌린다. 막지 말고 보여주되 작게 보인다는 것만 알린다
  return {
    match: false, show: 'content', rotateText: ROTATE_TEXT[want],
    lowZoom: true,
    lowZoomText: want === LANDSCAPE ? '가로로 돌리면 더 크게 볼 수 있어요' : '세로로 돌리면 더 크게 볼 수 있어요',
  };
}

/**
 * 방향이 안 맞을 때 표시가 얼마나 작아지는지 (1이면 손해 없음).
 *
 * 스펙이 말하는 경우는 하나뿐이다 — **가로가 필요한데 세로로 들고 있을 때**
 * ("세로로 계속 들면 양쪽 눈을 세로 화면에 맞춰 작게 보여주되 확대율이 낮다는 표시").
 * 부위는 전부 가로로 넓어서, 세로 화면에서는 짧은 변에 맞춰 들어가기 때문이다.
 *
 * 반대(세로 부위를 가로로 들고 있음)는 오히려 더 넓게 보이므로 손해가 없다.
 */
export function zoomPenalty(want, actual, viewW, viewH) {
  if (want === actual) return 1;
  if (want === LANDSCAPE && actual === PORTRAIT) return Math.min(1, viewW / viewH);
  return 1;
}

/** 방향이 바뀌면 유예 시간을 다시 센다. */
export function makeTracker(now = () => Date.now()) {
  let last = null, since = now();
  return {
    /** 실제 방향을 알려 주고, 안 맞은 채로 지난 시간을 돌려받는다. */
    update(actual) {
      if (actual !== last) { last = actual; since = now(); }
      return now() - since;
    },
    reset() { since = now(); },
    get current() { return last; },
  };
}
