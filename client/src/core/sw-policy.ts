/**
 * Service Worker 캐시 정책 — 무엇을 캐시하고 무엇을 **절대** 캐시하지 않는가. 모듈 ⑥ (#82).
 *
 * 순수 함수로 떼어 둔 이유: 이 규칙이 틀리면 **사용자 사진이 폰에 남는다.** 화면 F-11 은
 * "사진과 기록은 모두 지웠어요" 라고 말하는데, Service Worker 가 몰래 한 벌 갖고 있으면
 * 그 말이 거짓이 된다. 일반 PWA 플러그인을 안 쓰고 직접 쓰는 이유가 이것이다 —
 * 그쪽은 "같은 출처 GET 은 다 캐시" 가 기본이라, 우리 규칙과 정반대다.
 *
 * 캐시는 두 벌이다. **앱은 배포마다 갈아엎고, 모델은 남긴다.**
 * MediaPipe wasm + 모델이 10.6MB 라, 앱을 고칠 때마다 다시 받으면 발표장 와이파이에서 죽는다.
 */

export type CacheName = "app" | "model";
export type Strategy = "cache-first" | "network-first" | "network-only";

export interface Route {
  cache: CacheName | null;
  strategy: Strategy;
  /** 왜 이렇게 정했는지 — 검증과 디버깅이 읽는다 */
  reason: string;
}

export interface RouteInput {
  url: string;
  method: string;
  /** fetch 이벤트의 request.mode — 주소창 이동이면 "navigate" */
  mode?: string;
}

export interface RouteOptions {
  /** 이 앱이 떠 있는 출처. 다른 출처는 모델 CDN 만 허용한다 */
  origin: string;
  /** 빌드가 낸 앱 파일 경로들 (해시 붙은 이름). 빌드 때 주입된다 */
  precache: readonly string[];
}

const NEVER: Strategy = "network-only";

/** 모델·wasm 이 오는 곳. 크고 안 바뀌므로 따로 오래 둔다 */
const MODEL_HOSTS = ["storage.googleapis.com", "cdn.jsdelivr.net", "unpkg.com"];
const MODEL_PATHS = [/\/models\//, /\.task$/, /\.tflite$/, /\.wasm$/, /\/wasm\//];

/**
 * **절대 캐시하지 않는 것.** 하나라도 새면 F-11 이 거짓말이 된다.
 * 사진은 blob:·data: 로 다루고, 서버 왕복은 /sessions/·/jobs/ 다.
 */
const NEVER_PATHS = [/^\/sessions\//, /^\/jobs\//, /^\/__probe/];

export function routeFor(req: RouteInput, opts: RouteOptions): Route {
  // 1. GET 이 아니면 손대지 않는다 — 사진 올리기가 POST 다
  if (req.method.toUpperCase() !== "GET") {
    return { cache: null, strategy: NEVER, reason: "GET 이 아니다" };
  }

  let u: URL;
  try {
    u = new URL(req.url, opts.origin);
  } catch {
    return { cache: null, strategy: NEVER, reason: "주소를 못 읽었다" };
  }

  // 2. http(s) 가 아니면 손대지 않는다 — blob:·data: 는 사용자 사진이다
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { cache: null, strategy: NEVER, reason: `${u.protocol} 는 사진일 수 있다` };
  }

  const sameOrigin = u.origin === opts.origin;

  // 3. 서버 왕복은 절대 캐시하지 않는다 — 결과 사진·작업 상태가 남는다
  if (sameOrigin && NEVER_PATHS.some((re) => re.test(u.pathname))) {
    return { cache: null, strategy: NEVER, reason: "서버 왕복 — 캐시 금지" };
  }

  // 4. 모델·wasm — 크고 안 바뀐다. 앱을 새로 배포해도 남긴다
  const isModel =
    MODEL_PATHS.some((re) => re.test(u.pathname)) ||
    (!sameOrigin && MODEL_HOSTS.includes(u.hostname));
  if (isModel) {
    return { cache: "model", strategy: "cache-first", reason: "모델·wasm — 크고 안 바뀐다" };
  }

  // 5. 다른 출처는 여기까지. 남의 서버 응답을 우리 캐시에 담지 않는다
  if (!sameOrigin) {
    return { cache: null, strategy: NEVER, reason: "다른 출처" };
  }

  // 6. 주소창 이동 — 새 배포를 먼저 받아 보고, 안 되면 캐시된 껍데기로 연다.
  //    cache-first 로 하면 배포해도 낡은 앱이 계속 뜬다 (발표 당일에 제일 무서운 것)
  if (req.mode === "navigate") {
    return { cache: "app", strategy: "network-first", reason: "주소창 이동 — 새 배포 먼저" };
  }

  // 7. 빌드가 낸 앱 파일. 이름에 해시가 붙어 내용이 바뀌면 이름도 바뀐다 → 캐시 우선이 안전
  if (opts.precache.includes(u.pathname)) {
    return { cache: "app", strategy: "cache-first", reason: "앱 파일 — 이름에 해시" };
  }

  // 8. 나머지는 그냥 통과. 모르는 것을 캐시하지 않는다
  return { cache: null, strategy: NEVER, reason: "모르는 것은 캐시하지 않는다" };
}

/** 캐시 이름. 앱은 버전이 바뀌면 갈아엎고, 모델은 버전과 무관하게 남는다 */
export function cacheKey(name: CacheName, version: string): string {
  return name === "model" ? "dhe-model" : `dhe-app-${version}`;
}

/** activate 때 지울 캐시들 — 지금 쓰는 둘만 남기고 전부 */
export function stale(existing: readonly string[], version: string): string[] {
  const keep = new Set([cacheKey("app", version), cacheKey("model", version)]);
  return existing.filter((k) => k.startsWith("dhe-") && !keep.has(k));
}
