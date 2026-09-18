// 화면 3 진행 칩 — 세션 상태 (순수 함수). 브라우저·Node 공용 ESM.
//
// 부위 목록·상태 이름·`upsertPart`는 **화면 6이 이미 정의해 두었다.**
// 여기서 다시 만들지 않고 그대로 가져다 쓴다. 두 벌이 되면 반드시 어긋난다.
//
// 이 파일이 맡는 것은 화면 6에 없는 것뿐이다.
//   - 지금 보고 있는 부위(currentPart)와 진행 칩 뷰
//   - 앞 단계를 건너뛰고 뒤로 갔을 때의 안내 문구 (F-04)
//   - 세션 임시 저장·복원 (F-07)

import {
  PART_IDS, PART_NAME, STATUS_LABEL, CONTOUR_ID, upsertPart,
} from '../screen6/core.js';

export { PART_IDS, PART_NAME, STATUS_LABEL, CONTOUR_ID };

/** 진행 칩용 짧은 이름. 세로 화면(393px)에 6개가 다 들어가야 한다. */
export const PART_SHORT = { ...PART_NAME, liner: '라이너', contour: '쉐딩' };

/** 결과가 나온 상태. 다시 방문해도 "진행 중"으로 되돌리지 않는다. */
const SETTLED = new Set(['passed', 'check_only', 'skipped']);

const nowIso = () => new Date().toISOString();

// ---------------- 세션 ----------------

/**
 * 새 세션. `partOrder`는 룩 5부위 + 쉐딩·하이라이트(항상 마지막)다 (F-04).
 * 화면 2에서 룩을 고르면 `LookTemplate.requiredParts + ['contour']`로 만들어진다.
 */
export function createSession({ partOrder = PART_IDS, lookId = null, id = null } = {}) {
  return {
    id: id || `s_${Date.now().toString(36)}`,
    startedAt: nowIso(),
    lookId,
    partOrder: [...partOrder],
    parts: partOrder.map((partId) => ({ partId, status: 'not_started', score: null })),
    currentPart: partOrder[0] ?? null,
  };
}

export const findPart = (session, partId) =>
  session.parts.find((p) => p.partId === partId) || null;

/**
 * 진행 칩을 눌러 그 단계로 간다 (F-04: 어느 단계로든 이동).
 *
 * 상태 규칙 — 여기가 이 파일에서 제일 중요한 부분이다.
 *   - 아직 결과가 없는 부위로 가면 `in_progress`가 된다
 *   - **이미 결과가 있는 부위로 돌아가도 상태를 되돌리지 않는다.**
 *     되돌리면 칩에서 점수가 사라진다. 다시 확인받으면 그때 새 점수로 덮어쓴다
 *   - 보던 부위를 결과 없이 떠나면 `not_started`로 되돌린다. 아무 일도 안 일어났으므로
 */
export function goTo(session, partId) {
  if (!session.partOrder.includes(partId)) throw new Error(`세션에 없는 부위: ${partId}`);
  const parts = session.parts.map((p) => {
    if (p.partId === session.currentPart && p.status === 'in_progress') {
      return { ...p, status: 'not_started' };
    }
    return p;
  }).map((p) => (p.partId === partId && !SETTLED.has(p.status)
    ? { ...p, status: 'in_progress' } : p));
  return { ...session, parts, currentPart: partId };
}

/**
 * 확인받기 결과를 기록한다 (화면 5에서 돌아올 때).
 * 쉐딩·하이라이트는 `upsertPart`가 알아서 `check_only`로 바꾸고 점수를 지운다.
 */
export function recordResult(session, partId, result = {}) {
  if (!session.partOrder.includes(partId)) throw new Error(`세션에 없는 부위: ${partId}`);
  const next = {
    ...findPart(session, partId),
    partId,
    status: result.status || 'passed',
    score: typeof result.score === 'number' ? result.score : null,
    ...result,
    measuredAt: nowIso(),
  };
  return { ...session, parts: upsertPart(session.parts, next) };
}

/** 건너뛰기 (화면 5에만 있는 버튼). 합산에서 빠진다. */
export function skipPart(session, partId) {
  return recordResult(session, partId, { status: 'skipped', score: null });
}

// ---------------- 진행 칩 ----------------

/** 칩 하나하나를 그리는 데 필요한 것만 담아 돌려준다. */
export function chips(session) {
  return session.partOrder.map((partId) => {
    const p = findPart(session, partId) || { status: 'not_started', score: null };
    return {
      partId,
      name: PART_NAME[partId] || partId,
      short: PART_SHORT[partId] || partId,
      status: p.status,
      label: STATUS_LABEL[p.status] || p.status,
      score: typeof p.score === 'number' ? p.score : null,
      active: partId === session.currentPart,
      settled: SETTLED.has(p.status),
    };
  });
}

/** 이 부위보다 앞에 있는데 아직 아무것도 안 한 부위들. */
export function pendingBefore(session, partId) {
  const i = session.partOrder.indexOf(partId);
  if (i <= 0) return [];
  return session.partOrder.slice(0, i)
    .filter((id) => {
      const p = findPart(session, id);
      return !p || p.status === 'not_started' || p.status === 'in_progress';
    });
}

/**
 * 받침에 맞는 조사를 붙인다. "눈썹을(를)" 같은 표기를 쓰지 않기 위해서다.
 * 한글 음절의 종성 = (코드 - 0xAC00) % 28. 0이면 받침이 없다.
 */
export function withParticle(word, withJong = '을', withoutJong = '를') {
  const last = word[word.length - 1];
  const code = last ? last.charCodeAt(0) : 0;
  if (code < 0xac00 || code > 0xd7a3) return `${word}${withoutJong}`;   // 한글이 아니면 기본형
  return `${word}${(code - 0xac00) % 28 === 0 ? withoutJong : withJong}`;
}

/**
 * "눈썹을 아직 안 했어요" 한 줄 (F-04).
 * 앞 단계를 건너뛰고 뒤로 가는 것은 **막지 않는다.** 알려 주기만 한다.
 */
export function hintFor(session, partId) {
  const pend = pendingBefore(session, partId);
  if (!pend.length) return null;
  return `${withParticle(PART_NAME[pend[0]] || pend[0])} 아직 안 했어요`;
}

/** 다음으로 갈 부위. 없으면 null (= 화면 6 전체 리뷰로). */
export function nextPart(session, partId = session.currentPart) {
  const i = session.partOrder.indexOf(partId);
  return i >= 0 && i + 1 < session.partOrder.length ? session.partOrder[i + 1] : null;
}

/** 다 끝났는지. 결과가 난 부위만 센다. */
export function isComplete(session) {
  return session.parts.every((p) => SETTLED.has(p.status));
}

// ---------------- 저장·복원 (F-07) ----------------

export const SESSION_KEY = 'danghaeung.screen3.session';

/** localStorage가 없는 환경(Node 검증)에서도 돌도록 어댑터를 받는다. */
export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

export function saveSession(session, storage) {
  try { storage.setItem(SESSION_KEY, JSON.stringify(session)); return true; }
  catch { return false; }          // 사생활 보호 모드 등에서 실패할 수 있다
}

export function loadSession(storage) {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.parts) || !Array.isArray(s.partOrder)) return null;
    return s;
  } catch { return null; }
}

/** 끝내기. 세션 데이터를 지운다 (F-11). */
export function clearSession(storage) {
  try { storage.removeItem(SESSION_KEY); return true; } catch { return false; }
}
