// 세션 번호 붙들기 · 설문에 채워 열기 (#385 — 지워 달라는 요청이 오면 세션 번호로 찾는다)
import { describe, expect, it } from "vitest";
import { createSidHolder, SID_KEY, surveyUrlFor } from "@core/session-id";

function store(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}
const TTL = 1000;
const counter = () => { let n = 0; return () => `sid-${++n}-aaaaaaaa`; };

describe("세션 번호 붙들기", () => {
  it("SI1 처음 켜면 새로 만들어 폰에 적어 둔다", () => {
    const s = store();
    const h = createSidHolder({ storage: s, now: () => 100, make: counter(), ttlMs: TTL });
    expect(h.sid()).toBe("sid-1-aaaaaaaa");
    expect(JSON.parse(s.m.get(SID_KEY)!)).toEqual({ sid: "sid-1-aaaaaaaa", t: 100 });
  });

  it("SI2 다시 켜도(새로고침) 같은 번호 — 한 사람의 사진이 번호 여러 개로 흩어지지 않게", () => {
    const s = store(), make = counter();
    createSidHolder({ storage: s, now: () => 100, make, ttlMs: TTL });
    const again = createSidHolder({ storage: s, now: () => 900, make, ttlMs: TTL });
    expect(again.sid()).toBe("sid-1-aaaaaaaa");
  });

  it("SI3 오래 지났으면 새 번호 (폰에 둔 세션이 지워지는 때와 같다) · 쓰는 동안에는 시각을 새로 적는다", () => {
    const s = store(), make = counter();
    const h = createSidHolder({ storage: s, now: () => 100, make, ttlMs: TTL });
    expect(createSidHolder({ storage: s, now: () => 1200, make, ttlMs: TTL }).sid()).toBe("sid-2-aaaaaaaa");
    // touch 하면 그때부터 다시 센다
    const s2 = store(), make2 = counter();
    let t = 100;
    const h2 = createSidHolder({ storage: s2, now: () => t, make: make2, ttlMs: TTL });
    t = 900; h2.touch();
    expect(createSidHolder({ storage: s2, now: () => 1800, make: make2, ttlMs: TTL }).sid()).toBe("sid-1-aaaaaaaa");
    expect(h.sid()).toBe("sid-1-aaaaaaaa");
  });

  it("SI4 끝내면 폰에서 지운다 (번호는 끝 화면이 쓸 수 있게 들고 있는다) · 다시 시작하면 새 번호", () => {
    const s = store(), h = createSidHolder({ storage: s, now: () => 100, make: counter(), ttlMs: TTL });
    h.drop();
    expect(s.m.has(SID_KEY)).toBe(false);
    expect(h.sid()).toBe("sid-1-aaaaaaaa");
    h.touch();   // 끝낸 뒤에는 다시 적지 않는다
    expect(s.m.has(SID_KEY)).toBe(false);
    expect(h.renew()).toBe("sid-2-aaaaaaaa");
    expect(h.sid()).toBe("sid-2-aaaaaaaa");
    expect(JSON.parse(s.m.get(SID_KEY)!).sid).toBe("sid-2-aaaaaaaa");
  });

  it("SI5 적어 둔 것이 깨졌거나 저장소를 못 써도 돈다 (그때는 켤 때마다 새 번호)", () => {
    expect(createSidHolder({ storage: store({ [SID_KEY]: "{깨짐" }), now: () => 1, make: counter(), ttlMs: TTL }).sid()).toBe("sid-1-aaaaaaaa");
    expect(createSidHolder({ storage: store({ [SID_KEY]: JSON.stringify({ sid: 3, t: "x" }) }), now: () => 1, make: counter(), ttlMs: TTL }).sid()).toBe("sid-1-aaaaaaaa");
    const broken = { getItem: () => { throw new Error("막힘"); }, setItem: () => { throw new Error("막힘"); }, removeItem: () => { throw new Error("막힘"); } };
    const h = createSidHolder({ storage: broken, now: () => 1, make: counter(), ttlMs: TTL });
    expect(h.sid()).toBe("sid-1-aaaaaaaa");
    expect(() => { h.touch(); h.drop(); h.renew(); }).not.toThrow();
    expect(createSidHolder({ storage: null, now: () => 1, make: counter(), ttlMs: TTL }).sid()).toBe("sid-1-aaaaaaaa");
  });
});

describe("설문에 세션 번호를 채워 열기", () => {
  const FORM = "https://docs.google.com/forms/d/e/abc/viewform";

  it("SU1 칸 번호가 있으면 세션 번호를 채운 주소", () => {
    expect(surveyUrlFor(FORM, "entry.123456", "sid-1")).toBe(`${FORM}?usp=pp_url&entry.123456=sid-1`);
  });

  it("SU2 칸 번호가 없으면 주소 그대로 — 설문에 칸이 생기기 전", () => {
    expect(surveyUrlFor(FORM, "", "sid-1")).toBe(FORM);
    expect(surveyUrlFor(FORM, null, "sid-1")).toBe(FORM);
  });

  it("SU3 칸 번호 모양이 아니면 붙이지 않는다 · 설문 주소가 없으면 null", () => {
    expect(surveyUrlFor(FORM, "entry.12&x=1", "sid-1")).toBe(FORM);
    expect(surveyUrlFor(null, "entry.1", "sid-1")).toBeNull();
    expect(surveyUrlFor("", "entry.1", "sid-1")).toBeNull();
  });

  it("SU4 이미 ? 가 있는 주소에는 & 로 잇는다", () => {
    expect(surveyUrlFor(`${FORM}?hl=ko`, "entry.9", "a b")).toBe(`${FORM}?hl=ko&usp=pp_url&entry.9=a%20b`);
  });
});
