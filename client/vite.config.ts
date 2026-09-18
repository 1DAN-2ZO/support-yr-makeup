import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// 카메라는 https 또는 localhost에서만 열린다. 폰 실기기 테스트는 mkcert 인증서를 server.https에 넣는다.
export default defineConfig({
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@screens": fileURLToPath(new URL("./src/screens", import.meta.url)),
    },
  },
  server: { host: true, port: 5173 },
  build: { target: "es2022", sourcemap: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
});
