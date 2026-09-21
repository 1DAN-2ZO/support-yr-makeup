import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** 앱 버전 = git 짧은 해시. 로그·결과 카드에 찍힌다 (ai-pipeline-v6.md 3절) */
function appVersion(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim() || "dev";
  } catch {
    return "dev";
  }
}

/**
 * 카메라는 https 또는 localhost 에서만 열린다. 폰은 LAN IP 로 들어오므로 https 가 있어야 한다.
 *
 *   bash scripts/certs.sh      → client/certs/ 에 인증서를 만든다 (docs/device-setup-v6.md)
 *
 * 인증서가 있으면 https 로, 없으면 그냥 http 로 뜬다 — localhost 개발은 지장 없다.
 * 인증서 파일은 저장소에 넣지 않는다(.gitignore). 각자 자기 것을 만든다.
 */
function devHttps(): { key: Buffer; cert: Buffer } | undefined {
  const dir = fileURLToPath(new URL("./certs", import.meta.url));
  const key = `${dir}/key.pem`;
  const cert = `${dir}/cert.pem`;
  if (!existsSync(key) || !existsSync(cert)) return undefined;
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

const certs = devHttps();

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@screens": fileURLToPath(new URL("./src/screens", import.meta.url)),
    },
  },
  // host: true 라야 폰에서 LAN IP 로 들어올 수 있다.
  // 인증서가 없을 때는 https 키 자체를 빼야 한다 (exactOptionalPropertyTypes)
  server: { host: true, port: 5173, ...(certs ? { https: certs } : {}) },
  build: { target: "es2022", sourcemap: true },
  test: {
    // 기본은 node. DOM 이 필요한 파일은 맨 위에 `// @vitest-environment jsdom` 한 줄
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
});
