"""정답 매기기 화면 (#64) — 시험지 사진에 가이드를 겹쳐 보여 주고 맞음/조금/많이를 누르게 한다.

  python eval/golden/label_tool.py            # http://localhost:8765  (PORT 로 바꿀 수 있음)

- 사람마다 라벨러 칸(a 또는 b)을 골라 따로 매긴다. 서로의 답과 채점기 답은 보여 주지 않는다(따라가지 않게)
- 누를 때마다 DHE_DATA_DIR/golden/labels_<a|b>.json 에 바로 저장된다 (중간에 꺼도 이어서 매길 수 있음)
- 다 매긴 뒤 eval/golden/merge_labels.py 로 manifest.json 의 labels·label 에 넣는다
- 사진은 DHE_DATA_DIR/golden/ 아래 파일만 내보낸다. 이 컴퓨터(localhost)에서만 연다
"""

from __future__ import annotations

import json
import mimetypes
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "manifest.json"
BASE = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data")).resolve()
GOLDEN = (BASE / "golden").resolve()
LABELS = ("ok", "slight", "off", "invalid")  # invalid = 판단 불가(사진 오류) → 시험지에서 뺀다


def labels_path(rater: str) -> Path:
    return GOLDEN / f"labels_{rater}.json"


def load_labels(rater: str) -> dict:
    p = labels_path(rater)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def save_labels(rater: str, data: dict) -> None:
    p = labels_path(rater)
    fd, tmp = tempfile.mkstemp(dir=p.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, p)  # 중간에 꺼져도 파일이 깨지지 않게


def items() -> list[dict]:
    g = json.loads(MANIFEST.read_text(encoding="utf-8"))
    keep = ("id", "person_id", "part", "bare", "makeup", "bare_lm", "makeup_lm")
    # 맨얼굴 대조(…-bare)는 정답이 '화장 없음'으로 정해져 있어 매기지 않는다
    todo = [
        it
        for it in g["items"]
        if not str(it.get("source", "")).endswith("-bare")
        and it.get("part") in ("brow", "liner", "lip", "shadow", "cheek")
    ]
    # 검수 표본(review_set)이 있으면 그것만, 없으면 pick_natural.py 가 고른 것(label_set)만 보여 준다
    if any(it.get("review_set") for it in todo):
        todo = [it for it in todo if it.get("review_set")]
    elif any(it.get("label_set") for it in todo):
        todo = [it for it in todo if it.get("label_set")]
    return [{k: it[k] for k in keep} for it in todo]


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code: int = 200) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def log_message(self, fmt, *args):  # 조용히
        pass

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/":
            return self._send(200, (HERE / "label.html").read_bytes(), "text/html; charset=utf-8")
        if u.path == "/api/items":
            return self._json(items())
        if u.path == "/api/labels":
            rater = (q.get("rater") or [""])[0]
            if rater not in ("a", "b"):
                return self._json({"error": "rater 는 a 또는 b"}, 400)
            return self._json(load_labels(rater))
        if u.path.startswith("/data/"):
            p = (BASE / unquote(u.path[len("/data/") :])).resolve()
            if GOLDEN not in p.parents or not p.is_file():
                return self._json({"error": "없음"}, 404)
            return self._send(
                200, p.read_bytes(), mimetypes.guess_type(p.name)[0] or "application/octet-stream"
            )
        return self._json({"error": "없음"}, 404)

    def do_POST(self):
        if urlparse(self.path).path != "/api/label":
            return self._json({"error": "없음"}, 404)
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        rater, iid, label = body.get("rater"), body.get("id"), body.get("label")
        if rater not in ("a", "b") or not iid or label not in (*LABELS, None):
            return self._json({"error": "rater·id·label 확인"}, 400)
        data = load_labels(rater)
        if label is None:
            data.pop(iid, None)
        else:
            data[iid] = label
        save_labels(rater, data)
        return self._json({"ok": True, "count": len(data)})


def main() -> int:
    GOLDEN.mkdir(parents=True, exist_ok=True)
    port = int(os.environ.get("PORT", "8765"))
    print(
        f"정답 매기기 화면: http://localhost:{port}  (시험지 {len(items())}장, 저장 위치 {GOLDEN})",
        flush=True,
    )
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
