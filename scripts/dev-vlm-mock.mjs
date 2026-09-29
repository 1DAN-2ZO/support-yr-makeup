#!/usr/bin/env node
/**
 * 개발용 가짜 VLM 서버 — ④ 의 중간 서버(/plan)가 오기 전에 앱 흐름을 끝까지 돌려 보려고 (2026-09-29).
 * 계약은 client/src/core/vlm-client.ts 머리말 그대로:
 *   GET  /health → { ok: true, vlm: { ok: true, model: "mock" } }
 *   POST /plan   → 2초 뒤 { proposal: "{}", ms, model: "mock" }   빈 제안 = 관문이 전부 규칙값으로 채움
 *   ?busy 로 켜면 /plan 이 503 busy, ?down 이면 /health 가 vlm.ok false (실패 화면 확인용)
 *
 *   node scripts/dev-vlm-mock.mjs [포트=8095] [busy|down]
 *   앱:  VITE_DHE_API=http://localhost:8095 npm --prefix client run dev
 * 사진은 받기만 하고 버린다.
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 8095);
const mode = process.argv[3] ?? "ok";

const send = (res, code, body) => {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.url === "/health") return send(res, 200, { ok: true, vlm: { ok: mode !== "down", model: "mock" } });
  if (req.url === "/plan" && req.method === "POST") {
    let n = 0;
    req.on("data", (d) => (n += d.length));
    req.on("end", () => {
      if (mode === "busy") return send(res, 503, { reason: "busy" });
      const t0 = Date.now();
      setTimeout(() => {
        console.log(`/plan ${Math.round(n / 1024)}KB → 빈 제안`);
        send(res, 200, { proposal: "{}", ms: Date.now() - t0, model: "mock" });
      }, 2000);
    });
    return;
  }
  send(res, 404, {});
}).listen(port, () => console.log(`가짜 VLM 서버 http://localhost:${port} (${mode})`));
