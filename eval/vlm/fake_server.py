"""시험용 가짜 llama-server — GPU 없이 run.py·report.py 흐름을 확인한다 (test_vlm.py).

llama-server 와 같은 인자를 받고(--port 만 쓴다) /health 와 /v1/chat/completions 에 답한다.
답은 늘 같은 계획 JSON — 관문을 통과하는 값이다.
프롬프트에 "처진 눈" 이 있으면 라이너를 extend 로 (뒤집기 시험용).
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PLAN = {
    "liner": {"style": "winged"},
    "linerThick": {"scale": 1},
    "faceShape": {"label": "oval"},
    "shadow": {"range": 1},
    "lip": {"overline": 0},
    "blush": {"position": "standard", "size": 1},
    "highlight": {"tZone": True},
    "intensity": {"lip": 1},
    "rationale": {"liner": "눈꼬리가 올라가 있어서 꼬리를 살짝 올렸어요"},
}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"status": "ok"})

    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        text = req["messages"][0]["content"][1]["text"]
        plan = dict(
            PLAN,
            liner={"style": "extend" if "→ 처진 눈\n" in text or "눈꼬리: 처진 눈\n" in text else "winged"},
        )
        self._send(
            200,
            {
                "choices": [
                    {"message": {"content": json.dumps(plan, ensure_ascii=False)}, "finish_reason": "stop"}
                ],
                "usage": {"completion_tokens": 60},
                "timings": {"prompt_ms": 5.0, "predicted_ms": 10.0},
            },
        )


if __name__ == "__main__":
    port = int(sys.argv[sys.argv.index("--port") + 1])
    HTTPServer(("127.0.0.1", port), H).serve_forever()
