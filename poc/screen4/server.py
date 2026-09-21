"""교차 출처 격리(COOP/COEP) 헤더를 붙이는 정적 서버.

왜 필요한가
    WASM은 SharedArrayBuffer가 있어야 여러 스레드를 쓴다. 브라우저는 교차 출처 격리된
    페이지에서만 SharedArrayBuffer를 허용한다. `python -m http.server`는 이 헤더를 안 보내므로
    MediaPipe의 CPU(WASM) 경로가 단일 스레드로 돌고, 구형 기기에서 몇 배 느려질 수 있다.

    이 서버로 띄우면 HUD의 "WASM 스레드"가 "가능"으로 바뀐다. 같은 측정을 반복해
    숫자가 달라지는지 보면 스레드가 병목인지 알 수 있다.

    python server.py 8001    → http://localhost:8001

주의
    COEP를 켜면 외부 CDN 자원이 막힐 수 있다. MediaPipe 로딩이 실패하면
    아래 COEP 값을 'require-corp'로 바꿔 보고, 그래도 안 되면 이 서버를 쓰지 않는다.
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

COEP = "credentialless"   # 막히면 "require-corp"로 바꿔 볼 것


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", COEP)
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    print(f"http://localhost:{port}  (COOP/COEP {COEP})")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
