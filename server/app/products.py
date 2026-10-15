"""화장품 추천 데이터 — SQLite 를 읽어 준다 (2026-10-15).

**왜 서버에 두나**: 제품을 더해도 앱을 다시 배포하지 않고 반영하려고. 전에는 디비에서 뽑은
TypeScript 파일을 앱에 실어 보냈다 (`client/src/core/product-picks.data.ts`) — 그러면 호수를
하나 더할 때마다 앱을 새로 빌드·배포해야 한다.

**앱은 아직 이것을 안 쓴다.** 실어 보내는 쪽이 아직 살아 있고, 그쪽은 서버가 꺼져도 추천이
멈추지 않는다 (`cosmetics-db/export.py` 머리글). 앱을 이쪽으로 옮길지는 따로 정한다.

디비 파일은 `server/data/cosmetics.db` — `cosmetics-db/` 가 만든 것을 그대로 둔 것이다
(`python3 build.py` 뒤 `cp nudy.db ../server/data/cosmetics.db`).

**읽기만 한다.** `mode=ro` 로 열어 서버가 디비를 바꿀 수 없게 막는다 — 바꾸는 길은
`cosmetics-db/seed/` 하나여야 까닭이 남는다.
"""

from __future__ import annotations

import os
import sqlite3
from functools import lru_cache
from pathlib import Path

# 디비 자리. 환경 변수로 덮어쓸 수 있다 (다른 자리에 두고 싶을 때)
_DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "cosmetics.db"
DB_PATH = Path(os.environ.get("DHE_PRODUCTS_DB", str(_DEFAULT_DB)))

# 부위 이름 — 앱이 쓰는 것과 같은 말이어야 한다 (client/src/core/color-family.ts 의 PalettePart)
PARTS = ("brow", "liner", "shadow", "lip", "cheek")


def available() -> bool:
    """디비 파일이 있나. 없으면 길마다 503 으로 답한다 — 서버는 그래도 뜬다"""
    return DB_PATH.is_file()


def _open() -> sqlite3.Connection:
    # 읽기 전용. 파일이 없으면 여기서 터진다 — 부르는 쪽이 available() 로 먼저 거른다
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


@lru_cache(maxsize=1)
def snapshot() -> dict:
    """제품·호수·계열 전부. **한 번 읽고 들고 있는다** — 디비가 읽기 전용이라 바뀌지 않는다.

    모양은 `cosmetics-db/export.py` 가 뽑는 `products.json` 과 같게 맞춘다 — 앱이 그 모양을
    이미 알고 있어서, 나중에 앱을 이쪽으로 옮길 때 읽는 코드를 안 고쳐도 된다.
    """
    con = _open()
    try:
        fam: dict[str, dict[str, str | None]] = {}
        fam_q = "SELECT part, name, ref_hex FROM family WHERE name NOT LIKE '%※%' ORDER BY part, name"
        for r in con.execute(fam_q):
            fam.setdefault(r["part"], {})[r["name"]] = r["ref_hex"]

        prods: dict[int, dict] = {}
        rows = con.execute(
            """
            SELECT p.id, p.part, b.name AS brand, p.name, p.kind, p.photo, p.source_url,
                   p.checked, p.group_name, s.family, s.code, s.name AS shade, s.hex
            FROM product p
            JOIN brand b ON b.id = p.brand_id
            LEFT JOIN shade s ON s.product_id = p.id
            ORDER BY p.part, b.name, p.name, s.code
            """
        )
        for r in rows:
            p = prods.setdefault(
                r["id"],
                dict(
                    part=r["part"],
                    brand=r["brand"],
                    name=r["name"],
                    kind=r["kind"],
                    photo=r["photo"],
                    source=r["source_url"],
                    checked=bool(r["checked"]),
                    group=r["group_name"],
                    families=[],
                    shades=[],
                ),
            )
            if r["family"] and r["family"] not in p["families"]:
                p["families"].append(r["family"])
            if r["shade"]:
                sh = {"name": r["shade"]}
                if r["code"]:
                    sh["code"] = r["code"]
                if r["hex"]:
                    sh["hex"] = r["hex"]
                p["shades"].append(sh)

        by_part: dict[str, list[dict]] = {k: [] for k in PARTS}
        for p in prods.values():
            by_part.setdefault(p["part"], []).append(p)
        return {"version": "db-v1", "families": fam, "products": by_part}
    finally:
        con.close()


def counts() -> dict[str, int]:
    """몇 개나 들었나 — /health 와 사람이 눈으로 확인할 때"""
    con = _open()
    try:
        one = lambda q: int(con.execute(q).fetchone()[0])  # noqa: E731
        return {
            "brand": one("SELECT COUNT(*) FROM brand"),
            "product": one("SELECT COUNT(*) FROM product"),
            "shade": one("SELECT COUNT(*) FROM shade"),
            "family": one("SELECT COUNT(*) FROM family"),
        }
    finally:
        con.close()
