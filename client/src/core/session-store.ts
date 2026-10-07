/**
 * 세션 저장소 (1-7·1-11): 상태 JSON + 사진 3장(쌩얼·전체 완성 예상·최종 프레임) 을 IndexedDB 에.
 *  - 메모리 → IndexedDB 순으로 읽고, 둘 다 쓴다. IndexedDB 가 없거나 막히면 메모리만 (사생활 보호 모드)
 *  - draft 는 savedAt 을 같이 저장하고 2시간 지나면 만료 (1-11). 만료된 draft 는 읽을 때 지운다
 *  - clearAll(): 메모리·IndexedDB·localStorage 를 동시에 지운다 (F-11 끝내기). 잔존 0 이 검증 대상
 * 브라우저 API 는 전부 주입받는다 (Node 검증에서 가짜로 바꿔 끼움).
 */

import type { SessionDraft } from "./flow";

export const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
export const IMAGE_KEYS = ["bare", "fullrender", "lastframe"] as const;
export type ImageKey = (typeof IMAGE_KEYS)[number];
export const DRAFT_KEY = "draft";
/** localStorage 에 남길 수 있는 옛 키들 (POC 호환). clearAll 이 같이 지운다 */
export const LEGACY_LOCAL_KEYS = ["danghaeung.session", "danghaeung.screen3.session", "dhe.session"] as const;

export interface DraftEnvelope {
  draft: SessionDraft;
  savedAt: number;
}

/** 키-값 백엔드. 값은 JSON 가능한 것 또는 Blob */
export interface KvBackend {
  readonly kind: "memory" | "indexeddb";
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export function memoryBackend(): KvBackend {
  const m = new Map<string, unknown>();
  return {
    kind: "memory",
    async get(k) { return m.get(k); },
    async set(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async keys() { return [...m.keys()]; },
  };
}

const DB_NAME = "danghaeung", STORE = "session";

/**
 * IndexedDB 백엔드. open 이 실패하면 null (throw 하지 않는다)
 *
 * timeoutMs — 개발 중 흰 화면 방지용 임시 장치다. onerror·onblocked 는 원래도 잡고 있어서,
 * 이 제한이 더 막아 주는 것은 아무 신호 없이 멈추는 경우뿐이다. 대신 느린 기기에서 1.5초가
 * 넘으면 조용히 메모리 저장으로 떨어져 하던 작업이 복구되지 않는다. 출시 전에 다시 볼 것.
 */
export async function indexedDbBackend(idb: IDBFactory | undefined = globalThis.indexedDB, timeoutMs = 1500): Promise<KvBackend | null> {
  if (!idb) return null;
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((res, rej) => {
      const timer = setTimeout(() => rej(new Error("timeout")), timeoutMs);
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        clearTimeout(timer);
        res(req.result);
      };
      req.onerror = () => {
        clearTimeout(timer);
        rej(req.error);
      };
      req.onblocked = () => {
        clearTimeout(timer);
        rej(new Error("blocked"));
      };
    });
  } catch {
    return null;
  }
  const tx = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | IDBRequest): Promise<T> =>
    new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => res(r.result as T);
      t.onerror = () => rej(t.error);
    });
  return {
    kind: "indexeddb",
    get: (k) => tx("readonly", (s) => s.get(k)),
    set: (k, v) => tx<void>("readwrite", (s) => s.put(v, k)),
    delete: (k) => tx<void>("readwrite", (s) => s.delete(k)),
    keys: () => tx<string[]>("readonly", (s) => s.getAllKeys() as IDBRequest<string[]>),
  };
}

/** localStorage 와 같은 모양. 없으면 undefined */
export interface LocalLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface SessionStoreOptions {
  idb?: IDBFactory | undefined;
  local?: LocalLike | undefined;
  now?: () => number;
  ttlMs?: number;
}

export interface SessionStore {
  layers: KvBackend["kind"][];
  saveDraft(draft: SessionDraft): Promise<void>;
  /** 만료됐으면 null 을 돌려주고 지운다. reason 으로 왜 없는지 알 수 있다 */
  loadDraft(): Promise<{ draft: SessionDraft; savedAt: number; ageMs: number } | { draft: null; reason: "none" | "expired" | "corrupt" }>;
  saveImage(key: ImageKey, blob: Blob | ArrayBuffer): Promise<void>;
  loadImage(key: ImageKey): Promise<Blob | ArrayBuffer | null>;
  hasImages(): Promise<boolean>;
  /** 끝내기: 메모리·IndexedDB·localStorage 전부. 남은 키 수를 돌려준다 (0 이어야 함) */
  clearAll(): Promise<{ remaining: number }>;
}

export async function createSessionStore(opts: SessionStoreOptions = {}): Promise<SessionStore> {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? DRAFT_TTL_MS;
  const mem = memoryBackend();
  const disk = await indexedDbBackend(opts.idb);
  const layers = disk ? [mem, disk] : [mem];
  const local = opts.local;

  async function setAll(k: string, v: unknown): Promise<void> {
    for (const b of layers) {
      try { await b.set(k, v); } catch { /* 한 층이 막혀도 다른 층은 쓴다 */ }
    }
  }
  async function getAny(k: string): Promise<unknown> {
    for (const b of layers) {
      try {
        const v = await b.get(k);
        if (v !== undefined && v !== null) return v;
      } catch { /* 다음 층 */ }
    }
    return undefined;
  }
  async function delAll(k: string): Promise<void> {
    for (const b of layers) {
      try { await b.delete(k); } catch { /* */ }
    }
  }

  async function clearAll(): Promise<{ remaining: number }> {
    for (const b of layers) {
      try { for (const k of await b.keys()) await b.delete(k); } catch { /* */ }
    }
    if (local) for (const k of LEGACY_LOCAL_KEYS) { try { local.removeItem(k); } catch { /* */ } }
    let remaining = 0;
    for (const b of layers) { try { remaining += (await b.keys()).length; } catch { /* */ } }
    if (local) for (const k of LEGACY_LOCAL_KEYS) { try { if (local.getItem(k) !== null) remaining++; } catch { /* */ } }
    return { remaining };
  }

  return {
    layers: layers.map((b) => b.kind),
    async saveDraft(draft) {
      const env: DraftEnvelope = { draft, savedAt: now() };
      await setAll(DRAFT_KEY, env);
    },
    async loadDraft() {
      const raw = await getAny(DRAFT_KEY);
      if (!raw) return { draft: null, reason: "none" };
      const env = raw as Partial<DraftEnvelope>;
      if (!env.draft || typeof env.savedAt !== "number") { await delAll(DRAFT_KEY); return { draft: null, reason: "corrupt" }; }
      const ageMs = now() - env.savedAt;
      if (ageMs > ttl) { await clearAll(); return { draft: null, reason: "expired" }; }
      return { draft: env.draft, savedAt: env.savedAt, ageMs };
    },
    async saveImage(key, blob) { await setAll(`img:${key}`, blob); },
    async loadImage(key) { return ((await getAny(`img:${key}`)) as Blob | ArrayBuffer | undefined) ?? null; },
    async hasImages() {
      for (const k of IMAGE_KEYS) if (await getAny(`img:${k}`)) return true;
      return false;
    },
    clearAll,
  };
}
