import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // 5173 은 본 앱(support-yr-makeup/client) 이 쓰는 자리다 — 둘을 같이 띄워 비교해 볼 때
  // 포트가 겹치면 한쪽이 조용히 다른 포트로 밀려나서 어느 쪽을 보고 있는지 헷갈린다
  server: {
    port: 5174,
    strictPort: true,

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
