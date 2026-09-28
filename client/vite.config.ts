import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { Plugin } from "vite";

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

/**
 * [dev 전용] 폰 실측 프로브(capture-probe.html · probe-lock.html)가 보낸 측정 JSON 을
 * client/.probe/ 에 저장한다 (사진 없음, 숫자만). 모듈 ① 1-2·1-3·1-4 실측용. 빌드에는 안 들어간다.
 */
const probeSink: Plugin = {
  name: "probe-sink",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__probe", (req, res) => {
      if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
      let body = "";
      req.on("data", (c: Buffer) => { body += c.toString(); });
      req.on("end", () => {
        const dir = fileURLToPath(new URL("./.probe/", import.meta.url));
        mkdirSync(dir, { recursive: true });
        const name = `probe-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        writeFileSync(dir + name, body, "utf-8");
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(name);
      });
    });
  },
};

/**
 * [빌드 전용] MediaPipe wasm 을 dist/mediapipe/wasm/ 으로 복사한다.
 * dev 서버는 /node_modules/… 를 그대로 열어 주지만 빌드 결과물에는 없어서 얼굴 모델이 404 로 안 뜬다 (#162 ⑥ 리뷰).
 * 경로는 screens/landmarker.ts 의 WASM_BASE 와 맞춘다.
 */
const mediapipeWasm: Plugin = {
  name: "mediapipe-wasm",
  apply: "build",
  generateBundle() {
    const dir = fileURLToPath(new URL("./node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url));
    for (const f of readdirSync(dir)) {
      this.emitFile({ type: "asset", fileName: `mediapipe/wasm/${f}`, source: readFileSync(dir + f) });
    }
  },
};

export default defineConfig({
  plugins: [probeSink, mediapipeWasm],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@screens": fileURLToPath(new URL("./src/screens", import.meta.url)),
    },
  },
  // host: true 라야 폰에서 LAN IP 로 들어올 수 있다.
  // 인증서가 없을 때는 https 키 자체를 빼야 한다 (exactOptionalPropertyTypes)
  server: {
    host: true,
    port: 5173,
    // 터널로 들어오면 Host 가 낯설어서 vite 가 403 으로 막는다.
    // 앞의 점은 그 도메인의 모든 하위 주소를 뜻한다 — 터널 주소는 켤 때마다 바뀌므로 필요하다
    allowedHosts: [".trycloudflare.com"],
    ...(certs ? { https: certs } : {}),
  },
  build: { target: "es2022", sourcemap: true },
  test: {
    // 기본은 node. DOM 이 필요한 파일은 맨 위에 `// @vitest-environment jsdom` 한 줄
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
});
