/**
 * 폰 카메라 제약 대응 (1-8·1-3): 화이트밸런스·노출 잠금, 화면 꺼짐 방지(Wake Lock), 탭 전환·WebGL 컨텍스트 복구.
 * 브라우저 객체는 전부 인자로 받아서 Node 검증에서 가짜로 돌린다.
 *
 * 되는 기기만 잠근다. 안 되면 조용히 건너뛰고 report 에 남긴다 → 1-3 "기기별 카메라 잠금 지원 표" 의 한 줄이 된다.
 */

/** getCapabilities() 에서 우리가 보는 것만. 표준에 없는 확장이라 any 없이 좁힌 타입으로 읽는다 */
export interface CameraCaps {
  whiteBalanceMode?: string[];
  exposureMode?: string[];
  focusMode?: string[];
  width?: { min?: number; max?: number };
  height?: { min?: number; max?: number };
  zoom?: { min?: number; max?: number; step?: number };
}

export interface TrackLike {
  getCapabilities?: () => CameraCaps;
  getSettings?: () => Record<string, unknown>;
  applyConstraints: (c: Record<string, unknown>) => Promise<void>;
  label?: string;
}

export interface LockReport {
  /** getCapabilities 자체가 없으면 false (iOS 사파리) */
  capsSupported: boolean;
  whiteBalance: "locked" | "unsupported" | "failed";
  exposure: "locked" | "unsupported" | "failed";
  focus: "locked" | "unsupported" | "failed";
  maxWidth: number | null;
  maxHeight: number | null;
  label: string;
}

/**
 * 기준 촬영 4장 동안 색이 안 흔들리게 WB·노출·초점을 'manual' 로 잠근다.
 * 순서: 1) 'continuous' 로 두고 안정될 시간을 준 뒤(호출 쪽) 2) 이 함수로 'manual' 전환.
 * manual 이 지원 목록에 없으면 건너뛴다. applyConstraints 가 throw 하면 failed.
 */
export async function applyCameraLocks(track: TrackLike): Promise<LockReport> {
  const caps: CameraCaps = track.getCapabilities ? track.getCapabilities() : {};
  const capsSupported = !!track.getCapabilities;
  const tryLock = async (key: "whiteBalanceMode" | "exposureMode" | "focusMode"): Promise<LockReport["whiteBalance"]> => {
    const modes = caps[key];
    if (!modes || !modes.includes("manual")) return "unsupported";
    try {
      await track.applyConstraints({ advanced: [{ [key]: "manual" }] });
      return "locked";
    } catch {
      return "failed";
    }
  };
  return {
    capsSupported,
    whiteBalance: await tryLock("whiteBalanceMode"),
    exposure: await tryLock("exposureMode"),
    focus: await tryLock("focusMode"),
    maxWidth: caps.width?.max ?? null,
    maxHeight: caps.height?.max ?? null,
    label: track.label ?? "",
  };
}

/** 잠금을 다시 자동으로 (촬영이 끝나면) */
export async function releaseCameraLocks(track: TrackLike): Promise<void> {
  const caps: CameraCaps = track.getCapabilities ? track.getCapabilities() : {};
  const adv: Record<string, string>[] = [];
  for (const key of ["whiteBalanceMode", "exposureMode", "focusMode"] as const) {
    if (caps[key]?.includes("continuous")) adv.push({ [key]: "continuous" });
  }
  if (adv.length) { try { await track.applyConstraints({ advanced: adv }); } catch { /* 무시 */ } }
}

/** 1-3 표 한 줄: 기기 이름 · 지원 여부. report 를 그대로 붙여 넣는다 */
export function lockReportRow(ua: string, r: LockReport): string {
  const mark = (v: LockReport["whiteBalance"]): string => (v === "locked" ? "O" : v === "failed" ? "실패" : "X");
  return `| ${ua} | ${r.label || "-"} | ${r.capsSupported ? "O" : "X"} | ${mark(r.whiteBalance)} | ${mark(r.exposure)} | ${mark(r.focus)} | ${r.maxWidth ?? "-"}×${r.maxHeight ?? "-"} |`;
}

// ---------- 초광각 전면 카메라 확대 ----------

/**
 * iPhone·iPad 전면은 초광각(센터 스테이지용) 하나뿐이고, 기본 카메라 앱은 가운데를 잘라 "1배" 로 보여 주지만
 * 웹(getUserMedia)은 넓은 원본을 준다 → 얼굴이 작아 "조금 더 가까이" 에 오래 막힌다.
 * 트랙 이름이 초광각이고 zoom 을 지원하면 ULTRA_WIDE_ZOOM 배로 확대한다.
 * 2026-09-23 iPad 실측(1.5배): 눈 폭 82 → 92~110px, "가까이" 1124 → 19 프레임, 선명도 984~1837(하한 150)
 */
export const ULTRA_WIDE_ZOOM = 1.5;
const ULTRA_WIDE_LABEL = /ultra\s*wide|울트라\s*와이드|초광각/i;

/** 확대할 배율. 초광각이 아니거나 zoom 이 없으면 null */
export function ultraWideZoom(track: TrackLike): number | null {
  if (!ULTRA_WIDE_LABEL.test(track.label ?? "")) return null;
  const z = track.getCapabilities?.().zoom;
  if (!z || typeof z.max !== "number" || z.max < ULTRA_WIDE_ZOOM) return null;
  return Math.max(z.min ?? 1, ULTRA_WIDE_ZOOM);
}

/** 초광각이면 확대를 건다. 건 배율, 안 걸었거나 실패하면 null */
export async function applyUltraWideZoom(track: TrackLike): Promise<number | null> {
  const z = ultraWideZoom(track);
  if (z === null) return null;
  try { await track.applyConstraints({ advanced: [{ zoom: z }] }); return z; } catch { return null; }
}

// ---------- 화면 꺼짐 방지 ----------

export interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener?: (type: "release", fn: () => void) => void;
}
export interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

/**
 * 촬영·실시간 화면에서 화면이 꺼지지 않게. 지원 안 하면(구형 iOS) null.
 * 탭이 숨었다 돌아오면 잠금이 풀리므로 visibilitychange 에서 다시 요청한다 (bindVisibility 참고).
 */
export async function requestWakeLock(wakeLock: WakeLockLike | undefined): Promise<WakeLockSentinelLike | null> {
  if (!wakeLock) return null;
  try {
    return await wakeLock.request("screen");
  } catch {
    return null;
  }
}

// ---------- 탭 전환·컨텍스트 복구 ----------

export interface DocLike {
  visibilityState: "visible" | "hidden";
  addEventListener(type: "visibilitychange", fn: () => void): void;
  removeEventListener(type: "visibilitychange", fn: () => void): void;
}

/**
 * 거울 보러 갔다 오는 흐름: 숨으면 onHidden (카메라 저속·세션 저장), 돌아오면 onVisible (Wake Lock 재요청·카메라 재개).
 * 돌려주는 함수로 해제한다.
 */
export function bindVisibility(doc: DocLike, h: { onHidden: () => void; onVisible: () => void }): () => void {
  const fn = (): void => (doc.visibilityState === "hidden" ? h.onHidden() : h.onVisible());
  doc.addEventListener("visibilitychange", fn);
  return () => doc.removeEventListener("visibilitychange", fn);
}

export interface CanvasEvtLike {
  addEventListener(type: "webglcontextlost" | "webglcontextrestored", fn: (e: { preventDefault(): void }) => void): void;
  removeEventListener(type: "webglcontextlost" | "webglcontextrestored", fn: (e: { preventDefault(): void }) => void): void;
}

/**
 * WebGL 컨텍스트가 날아가면(백그라운드·메모리 부족) 기본 동작(영구 손실)을 막고 복구 콜백으로 다시 만든다.
 * 화면 3·4 의 메시 워핑 캔버스에 건다.
 */
export function bindGlContext(canvas: CanvasEvtLike, h: { onLost: () => void; onRestored: () => void }): () => void {
  const lost = (e: { preventDefault(): void }): void => { e.preventDefault(); h.onLost(); };
  const restored = (): void => h.onRestored();
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  return () => {
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", restored);
  };
}
