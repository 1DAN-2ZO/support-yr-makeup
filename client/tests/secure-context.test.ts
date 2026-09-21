import { describe, expect, it } from "vitest";
import { checkSecureContext, type SecureEnv } from "@core/secure-context";

function env(over: Partial<SecureEnv> = {}): SecureEnv {
  return {
    isSecureContext: true,
    hasMediaDevices: true,
    protocol: "https:",
    host: "192.168.0.7:5173",
    ...over,
  };
}

describe("카메라를 열 수 있는 곳인가", () => {
  it("https 면 통과", () => {
    expect(checkSecureContext(env())).toMatchObject({ ok: true, reason: "ok" });
  });

  it("localhost 도 통과 — 브라우저가 보안 컨텍스트로 쳐 준다", () => {
    const c = checkSecureContext(env({ protocol: "http:", host: "localhost:5173" }));
    expect(c.ok).toBe(true);
  });

  it("폰이 LAN IP 로 http 접속하면 막고, 주소를 그대로 보여 준다", () => {
    const c = checkSecureContext(env({ isSecureContext: false, protocol: "http:" }));
    expect(c.reason).toBe("insecure");
    expect(c.message).toContain("https");
    expect(c.hint).toContain("http://192.168.0.7:5173");
    expect(c.hint).toContain("scripts/certs.sh");
  });

  it("https 인데 카메라 API 가 없으면 인앱 브라우저로 본다", () => {
    const c = checkSecureContext(env({ hasMediaDevices: false }));
    expect(c.reason).toBe("unsupported");
    expect(c.hint).toContain("인앱 브라우저");
  });

  it("보안 컨텍스트가 아닌 게 먼저다 — 둘 다 걸려도 고칠 것은 https", () => {
    const c = checkSecureContext(env({ isSecureContext: false, hasMediaDevices: false }));
    expect(c.reason).toBe("insecure");
  });

  it("통과했으면 띄울 말이 없다", () => {
    const c = checkSecureContext(env());
    expect(c.message).toBe("");
    expect(c.hint).toBe("");
  });
});
