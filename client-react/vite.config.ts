import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * 빌드 판 이름 — 사용 기록의 `ver.app` 에 붙는다 (본 앱 vite.config.ts 와 같은 방식, #454 A4).
 * 환경변수가 있으면 그것, 없으면 git 짧은 해시, 그것도 없으면 "dev"
 */
function appVersion(): string {
  const env = process.env.VITE_APP_VERSION?.trim();
  if (env) return env;
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim() || "dev";
  } catch {
    return "dev";
  }
}

/**
 * 본 앱의 `core/` 를 **그대로** 읽는다 (#454 D4) — 사본을 두지 않는다.
 * 사용 기록 보내기 · 사진 보관 · 세션 번호 · 테스트 마감은 본 앱과 한 벌이어야 서버 쪽 집계가 이어진다.
 * 경로는 이 폴더 기준 `../client/src/core` (도커에서는 FrontDockerfile 이 같은 자리에 복사해 둔다)
 */
const CORE = fileURLToPath(new URL("../client/src/core", import.meta.url));
const REPO = fileURLToPath(new URL("..", import.meta.url));
/** 본 앱 core 가 쓰는 외부 패키지 — ../client 에는 node_modules 가 없으니 이 폴더 것으로 묶는다 */
const MEDIAPIPE = fileURLToPath(new URL("./node_modules/@mediapipe/tasks-vision", import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  resolve: {
    alias: { "@core": CORE, "@mediapipe/tasks-vision": MEDIAPIPE },
  },
  // 5173 은 본 앱(support-yr-makeup/client) 이 쓰는 자리다 — 둘을 같이 띄워 비교해 볼 때
  // 포트가 겹치면 한쪽이 조용히 다른 포트로 밀려나서 어느 쪽을 보고 있는지 헷갈린다
  server: {
    port: 5174,
    strictPort: true,
    // 본 앱 core · 저장소 루트의 rules/ 를 읽으므로 개발 서버가 이 폴더 밖을 열 수 있어야 한다
    fs: { allow: [REPO] },

    /*
     * 백엔드로 넘겨주는 자리 (2026-10-14).
     *
     * 왜 필요한가: 백엔드가 **허용 목록에 있는 주소만** 받는다 (compose.yml 의 DHE_CORS_ORIGINS —
     * nudy.shelldocs.cloud 와 localhost:5173). 폰에서 `https://192.168.0.18:5180` 으로 열면
     * 그 목록에 없어서 CORS 로 막힌다. 실제로 OPTIONS 가 400 을 돌려줬다.
     *
     * 팀 서버의 허용 목록을 고치는 방법도 있지만 **배포를 건드려야 해서** 이쪽을 골랐다.
     * 브라우저는 자기 주소(/api/...)로만 부르고 Vite 가 대신 넘긴다 — 같은 주소라 CORS 가 안 생긴다.
     *
     * 그래서 `.env.local` 의 VITE_API_BASE 는 **빈 값이 아니라 `/api`** 다.
     */
    proxy: {
      "/api": {
        target: "https://nudy-back.shelldocs.cloud",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
