// 룩 옮기기 실험 화면(look-transfer-probe.html) 전용 dev 설정.
// 팀 설정(vite.config.ts)은 그대로 두고, 생성 모델 서버(poc/look-transfer-gen/server.py, 127.0.0.1:8189)로 가는 길(/__gen)만 더한다.
//   npx vite --config vite.lt.config.ts
// 사진이 생성 서버로 넘어가는 길이라 127.0.0.1 로만 연다 (LAN 에 열지 않는다). 폰에서 볼 때는 터널을 쓴다.
import { mergeConfig } from "vite";
import base from "./vite.config";

export default mergeConfig(base, {
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/__gen": { target: "http://127.0.0.1:8189", rewrite: (p: string) => p.replace(/^\/__gen/, "") } },
  },
});
