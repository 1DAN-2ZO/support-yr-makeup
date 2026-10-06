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
  /** 잠금이 던진 오류 (항목 → 메시지). 기기별 원인 추적용 */
  errors?: Partial<Record<"whiteBalanceMode" | "exposureMode" | "focusMode", string>>;
}

/** 카메라가 지금 실제로 쓰는 값 (진단용). 없는 항목은 빠진다 */
export function camSnapshot(track: TrackLike): Record<string, unknown> {
  const s = track.getSettings ? track.getSettings() : {};
  const keep = ["exposureMode", "exposureTime", "iso", "exposureCompensation", "whiteBalanceMode", "colorTemperature", "focusMode", "focusDistance", "zoom", "width", "height", "frameRate"];
  return Object.fromEntries(keep.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]));
}

type LockKey = "whiteBalanceMode" | "exposureMode" | "focusMode";

/**
 * 기본으로 잠그는 항목 — **아무것도 잠그지 않는다** (2026-10-01 #267). 카메라는 자동 그대로, 조명 차이는 이마·흰자 기준과 촬영 조건이 막는다.
 * 기기가 알려 주는 "지금 값" 을 믿을 수 없는 경우가 계속 나왔다:
 *  - S26 Ultra: 자동일 때 늘 노출 33ms·ISO 250·색온도 0·초점 0 (가짜) → 노출 잠금이 오히려 흔들림 (9/30 A/B, 정면 L* 차 켬 +7.5·+4.8 / 끔 0.0·+0.3)
 *  - Windows 크롬 웹캠: 색온도를 실제와 다르게 알려 줘서 색 고정을 걸면 화면이 파래짐 (② 웹캠·팀원 웹캠, #267)
 * 잠그지 않아도 색 흔들림은 기준 안 (S26 B 회차 dAB ≤ 3.2, 정면 기준 6). iPhone 은 원래 잠금이 안 되는데도 잘 찍혔다. 정의서도 웹은 exposureLocked=false.
 * 비교용으로 ALL_LOCKS 나 항목을 직접 넘길 수 있다 (주소 ?lock=all|wb|wbfocus).
 */
export const DEFAULT_LOCKS: readonly LockKey[] = [];
/** 비교 시험용 — 전부 잠금 (?lock=all) */
export const ALL_LOCKS: readonly LockKey[] = ["whiteBalanceMode", "exposureMode", "focusMode"];

/**
 * 'manual' 로 바꿀 때 **지금 값을 같이 넘기는** 칸. 'manual' 만 보내면 Android Chrome 은 기본 노출 시간·색온도로 바꿔
 * 화면이 하얗게 날아간다 (2026-09-30 Android 실기기: 켜고 1.5초 뒤 확 밝아짐). 지금 값을 못 읽으면 잠그지 않는다
 */
const LOCK_VALUE: Record<"whiteBalanceMode" | "exposureMode" | "focusMode", readonly string[]> = {
  exposureMode: ["exposureTime", "iso", "exposureCompensation"],
  whiteBalanceMode: ["colorTemperature"],
  focusMode: ["focusDistance"],
};

/**
 * 기준 촬영 4장 동안 색이 안 흔들리게 WB·노출·초점을 'manual' 로 잠근다.
 * 순서: 1) 'continuous' 로 두고 안정될 시간을 준 뒤(호출 쪽) 2) 이 함수로 'manual' 전환 — **그 순간의 값(getSettings)을 그대로 고정**.
 * manual 이 지원 목록에 없거나, 지금 값을 못 읽으면(노출 시간·색온도) 건너뛴다. applyConstraints 가 throw 하면 failed.
 */
export async function applyCameraLocks(track: TrackLike, only: readonly LockKey[] = DEFAULT_LOCKS): Promise<LockReport> {
  const caps: CameraCaps = track.getCapabilities ? track.getCapabilities() : {};
  const capsSupported = !!track.getCapabilities;
  const errors: NonNullable<LockReport["errors"]> = {};
  const tryLock = async (key: "whiteBalanceMode" | "exposureMode" | "focusMode"): Promise<LockReport["whiteBalance"]> => {
    if (!only.includes(key)) return "unsupported";
    const modes = caps[key];
    if (!modes || !modes.includes("manual")) return "unsupported";
    const now = track.getSettings ? track.getSettings() : {};
    const values: Record<string, unknown> = {};
    // 0 은 "모름" — S26 Ultra 는 자동일 때 colorTemperature·focusDistance 를 0 으로 알려 주고, 0 을 넘기면 범위 밖으로 거절된다 (2026-09-30)
    for (const k of LOCK_VALUE[key]) { const v = now[k]; if (typeof v === "number" && Number.isFinite(v) && (v > 0 || k === "exposureCompensation")) values[k] = v; }
    // 노출은 노출 시간, WB 는 색온도를 꼭 알아야 한다 — 모르면 'manual' 이 기본값으로 튄다
    if (key === "exposureMode" && !("exposureTime" in values)) return "unsupported";
    if (key === "whiteBalanceMode" && !("colorTemperature" in values)) return "unsupported";
    if (key === "focusMode" && !("focusDistance" in values)) return "unsupported";
    try {
      await track.applyConstraints({ advanced: [{ [key]: "manual", ...values }] });
      return "locked";
    } catch (e) {
      errors[key] = String(e).slice(0, 120);
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
    ...(Object.keys(errors).length ? { errors } : {}),
  };
}

/**
 * 잠금을 다시 자동으로. **카메라를 켤 때(앞 세션·다른 화면이 남긴 잠금 풀기)와 끌 때 둘 다** 부른다 (#267).
 * PC 웹캠은 설정을 기기에 저장해서, 안 풀면 다음에 열어도 잠긴 채(하얗게·파랗게) 시작한다
 */
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
