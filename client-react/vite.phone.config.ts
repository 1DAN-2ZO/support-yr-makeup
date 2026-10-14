/**
 * 폰에서 열어 보려는 설정.  npm run dev -- --config vite.phone.config.ts
 *
 * 평소 설정(vite.config.ts)과 따로 둔 까닭:
 *   ① **카메라는 https 가 아니면 안 열린다.** 폰에서 http://192.168.x.x 로 들어가면
 *      브라우저가 getUserMedia 를 막아서 촬영·시도사진·실시간 가이드를 못 본다.
 *      localhost 는 예외라 맥에서는 http 로도 됐던 것이다
 *   ② `--host` 로 집 안 네트워크에 열어야 폰이 닿는다
 *   ③ 평소 설정을 https 로 바꾸면 맥에서 쓰던 미리보기가 다 같이 바뀐다 — 그래서 파일을 나눴다
 *
 * 인증서는 스스로 만든 것이라 폰에서 **"안전하지 않음" 경고**가 뜬다.
 * 집 안에서 내 맥에 직접 붙는 것이라 그대로 지나가면 된다.
 */
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), basicSsl()],
  // 평소(5174)와 겹치지 않게 — 맥에서 보던 미리보기를 끊지 않는다
  server: {
    host: true,
    port: 5180,
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
