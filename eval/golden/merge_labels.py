"""정답 매기기 결과를 시험지(manifest.json)에 넣는다 (#64).

  python eval/golden/merge_labels.py

- DHE_DATA_DIR/golden/labels_a.json, labels_b.json → 각 항목의 labels.a, labels.b
- label(최종 정답): a·b 가 같으면 그 값. 한 명만 매겼으면 그 값(임시).
  둘이 다르면 null + 목록 출력 → 상의해 정한 뒤
  DHE_DATA_DIR/golden/labels_final.json 에 {"<id>": "<정답>"} 으로 적고 다시 돌리면 그 값을 쓴다
- 한 명이라도 invalid(판단 불가 — 사진 오류)를 고르면 label 은 null, excluded 에 이유를 적어 채점에서 뺀다
- labels_version 은 건드리지 않는다. 정답을 고친 뒤 결과를 비교하려면 버전을 올린다
"""

from __future__ import annotations

import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "manifest.json"
GOLDEN = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data")) / "golden"


def load(name: str) -> dict:
    p = GOLDEN / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def main() -> int:
    a, b, final = load("labels_a.json"), load("labels_b.json"), load("labels_final.json")
    g = json.loads(MANIFEST.read_text(encoding="utf-8"))
    both = agree = only_one = invalid = 0
    conflicts = []
    for it in g["items"]:
        la, lb = a.get(it["id"]), b.get(it["id"])
        it["labels"] = {"a": la, "b": lb}
        it.pop("excluded", None)
        if "invalid" in (la, lb) and it["id"] not in final:
            it["label"] = None
            it["excluded"] = "판단 불가(사진 오류): " + ", ".join(
                k for k, v in (("a", la), ("b", lb)) if v == "invalid"
            )
            invalid += 1
            continue
        if it["id"] in final:
            it["label"] = final[it["id"]]
        elif la and lb:
            it["label"] = la if la == lb else None
        else:
            it["label"] = la or lb
        if la and lb:
            both += 1
            agree += la == lb
            if la != lb and it["id"] not in final:
                conflicts.append((it["id"], la, lb))
        elif la or lb:
            only_one += 1
    MANIFEST.write_text(json.dumps(g, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"a {len(a)}장 · b {len(b)}장 · 둘 다 {both}장(일치 {agree}) · 한 명만 {only_one}장",
        f"· 판단 불가 {invalid}장",
    )
    for iid, la, lb in conflicts:
        print(f"  의견 다름: {iid}  a={la} b={lb}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
