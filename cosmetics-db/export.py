#!/usr/bin/env python3
"""
DB → 앱이 읽을 파일 둘.  python3 export.py

  out/products.json           — 사람이 들여다보는 쪽 (호수·색·출처까지 다 들어 있다)
  out/product-picks.data.ts   — **앱이 그대로 쓰는 쪽.** 이 파일을
                                client/src/core/product-picks.data.ts 로 복사하면 끝난다

**왜 JSON 으로 뽑나**: 앱은 폰 브라우저에서 돈다. 추천할 때마다 서버에 물으면 부위를
넘길 때마다 기다리게 되고, 서버가 꺼지면 추천도 멈춘다. 코드와 같이 실어 보내면
한 번에 받아 두고 즉시 뜬다. 호수 1,000개라도 압축하면 20KB 라 무겁지 않다.

**그런데 왜 DB 를 두나**: 사람이 다루는 쪽은 DB 가 훨씬 낫다. 계열 이름 오타가 막히고,
같은 호수가 두 번 들어가는 것도 막힌다. 수백 줄짜리 코드 파일은 손으로 못 고친다.

그래서 **모으는 곳은 DB, 쓰는 곳은 JSON** 이고 이 파일이 둘을 잇는다.
"""

import json
import pathlib
import re
import sqlite3
import sys

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"

# 앱 타입(client/src/core/color-family.ts 의 PalettePart) 차례. 다섯 개가 다 있어야 타입이 맞는다
PARTS = ("brow", "liner", "shadow", "cheek", "lip")

HEX_OK = re.compile(r"^#[0-9a-f]{6}$")

DATA_HEADER = """// ───────────────────────────────────────────────────────────────────────────
//
//   이 파일은 손으로 고치지 마라.
//
//   nudy-db/export.py 가 만든다. 여기서 고치면 다음에 다시 뽑을 때 그대로 지워진다.
//   제품·호수·계열을 고치려면 **디비 쪽**을 고친다:
//
//     1. nudy-db/seed/*.sql 에 줄을 더하거나 고친다
//     2. cd nudy-db && python3 build.py && python3 export.py
//     3. nudy-db/out/product-picks.data.ts 를 이 자리로 복사한다
//
// ───────────────────────────────────────────────────────────────────────────
//
// 만든 규칙 (export.py 의 write_data_ts):
//   · families — 호수에서 나온 계열이 먼저, 제품 단위로만 아는 계열(product_family)이 뒤.
//     앱이 목록 차례대로 고르므로 **색을 재서 확인한 계열이 앞**에 있어야 한다
//   · shade · hex — **그 제품의 호수가 하나뿐일 때만** 적는다. 여럿이면 비운다
//     (product-picks.ts 머리글의 규칙: 여러 호수 중 하나를 적으면 틀린 안내가 된다)
//   · checked — 전지원이 실물·판매 페이지로 직접 확인한 것 (product.checked)
//   · 계열이 하나도 없는 제품은 넣지 않는다 — 추천에 걸릴 길이 없다
//   · 차례는 **직접 확인한 것 먼저, 그다음 색을 잰 호수가 많은 것 먼저**다.
//     앱의 pickProducts 가 목록 앞에서부터 담으므로 믿을 만한 것이 앞에 와야 한다

import type { PalettePart } from "./color-family";
import type { ProductPick } from "./product-picks";

"""


def ts(v: str) -> str:
    """TS 문자열 한 토막. 겹따옴표·역슬래시만 막는다"""
    return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'


def write_data_ts(fam: dict, by_part: dict) -> None:
    """앱이 그대로 쓰는 product-picks.data.ts 를 만든다"""
    out = [DATA_HEADER, "export const PRODUCT_PICKS: Record<PalettePart, readonly ProductPick[]> = {\n"]
    kept = skipped = 0
    for part in PARTS:
        out.append(f"  {part}: [\n")
        # 직접 확인한 것 먼저 · 색을 잰 호수가 많은 것 먼저 · 그다음 이름 차례
        rows = sorted(
            by_part.get(part, []), key=lambda p: (not p["checked"], -len(p["shades"]), p["brand"], p["name"])
        )
        for p in rows:
            if not p["families"]:
                skipped += 1
                continue
            kept += 1
            note = [f"호수 {len(p['shades'])}개" if p["shades"] else "호수 없음"]
            if p["hinted"]:
                note.append(f"제품 단위 계열 {len(p['hinted'])}개({' · '.join(p['hinted'])})")
            if p["checked"]:
                note.append("전지원 직접 확인")
            out.append(f"    // {' · '.join(note)}\n")
            out.append("    {\n")
            out.append(f"      families: [{', '.join(ts(f) for f in p['families'])}],\n")
            out.append(f"      brand: {ts(p['brand'])}, name: {ts(p['name'])},\n")
            # 통마다 쪼개 넣은 제품은 묶음 이름을 적는다 — 화면이 한 묶음에서 하나만 보여 준다
            if p.get("group"):
                out.append(f"      group: {ts(p['group'])},\n")
            out.append(f"      kind: {ts(p['kind'])},\n")
            # 호수가 하나뿐인 제품에만 호수 이름·색을 적는다
            if len(p["shades"]) == 1:
                one = p["shades"][0]
                out.append(f"      shade: {ts(one['name'])},\n")
                if HEX_OK.match(one.get("hex") or ""):
                    out.append(f"      hex: {ts(one['hex'])},\n")
            if p["photo"]:
                out.append(f"      photo: {ts(p['photo'])},\n")
            if p["checked"]:
                out.append("      checked: true,\n")
            out.append("    },\n")
        out.append("  ],\n")
    out.append("};\n\n")

    out.append("""/**
 * 계열 기준색 (nudy-db 의 family.ref_hex). product-picks.ts 의 familyLab 이
 * 48색 팔레트보다 **먼저** 본다 — 까닭은 그 함수 주석에 적어 두었다.
 *
 * 값의 출처는 계열마다 다르다. 어느 쪽인지는 디비 seed 를 보면 된다:
 *   · 호수가 모인 계열은 **그 호수들의 피부 위 발색** 중앙값이다 (seed ZZ1 · ZZ2).
 *     앱이 사진에서 읽는 것과 조건이 같아서 이것이 제일 낫다
 *   · 호수가 아직 없는 계열은 디비가 48색 팔레트·규칙 검증으로 채워 둔 값이다 (seed 01 · 02)
 * 여기 아예 없는 계열은 기준색이 비어 있는 것이다 — 그때는 팔레트로 넘어간다.
 */
export const FAMILY_REF: Record<PalettePart, Record<string, string>> = {
""")
    n_ref = 0
    for part in PARTS:
        pairs = [(f, h) for f, h in sorted((fam.get(part) or {}).items()) if h]
        n_ref += len(pairs)
        if not pairs:
            out.append(f"  {part}: {{}},\n")
            continue
        out.append(f"  {part}: {{\n")
        for f, h in pairs:
            out.append(f"    {ts(f)}: {ts(h)},\n")
        out.append("  },\n")
    out.append("};\n")

    (OUT / "product-picks.data.ts").write_text("".join(out), encoding="utf-8")
    size = (OUT / "product-picks.data.ts").stat().st_size
    print(f"out/product-picks.data.ts  {size / 1024:.1f}KB")
    print(f"  제품 {kept}개 · 기준색 {n_ref}개 · 계열 없어 뺀 제품 {skipped}개")
    print("  → client/src/core/product-picks.data.ts 로 복사하면 앱이 바로 쓴다")


def write_product_en(by_part: dict) -> int:
    """
    제품 이름·설명의 **영어판만** 따로 뽑는다 → `out/product-en.ts`.

    왜 `product-picks.data.ts` 에 같이 안 넣나:
    그 파일은 `client/src/core/` 로 들어가는데, 코어는 **본 앱과 같이 쓰는 폴더**다.
    영어는 리액트 화면에만 있는 기능이라, 코어를 건드리지 않고 리액트 쪽에만 두는 편이 낫다.
    (`client-react/src/i18n/product-en.ts` 로 복사해서 쓴다.)

    찾는 열쇠는 **"브랜드|제품이름"** 한국어 그대로다 — 앱이 들고 있는 값이 그것이라
    따로 번호를 맞출 필요가 없다. 비어 있는 칸은 아예 안 적는다 (화면이 한국어로 떨어진다).
    """
    rows = []
    for part in PARTS:
        for p in sorted(by_part.get(part, []), key=lambda p: (p["brand"], p["name"])):
            if not p["families"]:
                continue  # 추천에 걸릴 길이 없는 제품은 화면에도 안 나온다
            got = {k: p[f"{k}_en"] for k in ("brand", "name", "kind") if p.get(f"{k}_en")}
            if not got:
                continue
            key = f"{p['brand']}|{p['name']}"
            body = ", ".join(f"{k}: {ts(v)}" for k, v in got.items())
            rows.append(f"  [{ts(key)}]: {{ {body} }},\n")

    out = [
        """/*
 * 제품 이름·설명의 영어판 — **nudy-db 의 export.py 가 만든다. 손으로 고치지 마라.**
 *
 * 고치려면 디비 쪽을 고친다:
 *   1. cosmetics-db/seed/ZZ5-brand-en.sql · ZZ6-product-en.sql · ZZ7-kind-en.sql
 *   2. cd cosmetics-db && python3 build.py && python3 export.py
 *   3. cosmetics-db/out/product-en.ts 를 이 자리로 복사한다
 *
 * 열쇠는 「브랜드|제품이름」 한국어 그대로다 — 앱(`core/product-picks.data.ts`)이 들고 있는
 * 값이 그것이라 번호를 따로 맞출 필요가 없다.
 *
 * **여기 없는 제품은 한국어 이름이 그대로 나간다.** 영어 이름을 못 찾은 제품이 그렇다
 * (없는 제품 이름을 지어내는 것보다 낫다 — ZZ6 머리글 참고).
 */

export interface ProductEn {
  brand?: string;
  name?: string;
  kind?: string;
}

export const PRODUCT_EN: Readonly<Record<string, ProductEn>> = {
"""
    ]
    out.extend(rows)
    out.append("};\n")
    (OUT / "product-en.ts").write_text("".join(out), encoding="utf-8")
    return len(rows)


def main() -> int:
    con = sqlite3.connect(HERE / "nudy.db")
    con.row_factory = sqlite3.Row
    OUT.mkdir(exist_ok=True)

    # ① 계열 + 기준색 — 이름과 기준색이 한곳에 있어야 어긋나지 않는다
    fam = {}
    for r in con.execute(
        "SELECT part, name, ref_hex FROM family WHERE name NOT LIKE '%※%' ORDER BY part, name"
    ):
        fam.setdefault(r["part"], {})[r["name"]] = r["ref_hex"]

    # ② 제품 — 한 제품이 여러 계열에 걸치면 계열 목록으로 묶는다.
    #    화면에는 같은 제품이 한 번만 떠야 하므로 제품 단위로 모은다
    prods = {}
    for r in con.execute("""
        SELECT p.id, p.part, b.name AS brand, b.name_en AS brand_en,
               p.name, p.name_en, p.kind, p.kind_en, p.photo, p.source_url, p.checked, p.group_name,
               s.family, s.code, s.name AS shade, s.hex
        FROM product p
        JOIN brand b ON b.id = p.brand_id
        LEFT JOIN shade s ON s.product_id = p.id
        ORDER BY p.part, b.name, p.name, s.code
    """):
        k = r["id"]
        p = prods.setdefault(
            k,
            dict(
                part=r["part"],
                brand=r["brand"],
                name=r["name"],
                kind=r["kind"],
                # 영어 화면용. 못 찾아 비어 있을 수 있다 — 그때는 한국어를 그대로 쓴다 (seed ZZ5 · ZZ6)
                brand_en=r["brand_en"],
                name_en=r["name_en"],
                kind_en=r["kind_en"],
                photo=r["photo"],
                source=r["source_url"],
                checked=bool(r["checked"]),
                group=r["group_name"],
                families=[],
                hinted=[],
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
            if r["family"]:
                sh["family"] = r["family"]
            p["shades"].append(sh)

    # ②-2 제품 단위로만 아는 계열 (product_family) 을 뒤에 붙인다.
    #     호수가 있는 계열이 **먼저** 와야 한다 — 앱이 목록 차례대로 고르므로,
    #     색을 재서 확인한 계열이 앞에 있어야 더 믿을 만한 것이 먼저 뽑힌다
    for r in con.execute("SELECT product_id, family FROM product_family ORDER BY product_id, family"):
        p = prods.get(r["product_id"])
        if not p or r["family"] in p["families"]:
            continue
        p["families"].append(r["family"])
        p["hinted"].append(r["family"])

    by_part = {}
    for p in prods.values():
        by_part.setdefault(p.pop("part"), []).append(p)

    data = {"version": "db-v1", "families": fam, "products": by_part}
    (OUT / "products.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    write_data_ts(fam, by_part)
    n_en = write_product_en(by_part)
    print(f"out/product-en.ts   제품 {n_en}개")

    n_sh = sum(len(p["shades"]) for v in by_part.values() for p in v)
    n_hex = sum(1 for v in by_part.values() for p in v for s in p["shades"] if "hex" in s)
    size = (OUT / "products.json").stat().st_size
    print(f"out/products.json  {size / 1024:.1f}KB")
    print(f"  제품 {len(prods)} · 호수 {n_sh} (색 있음 {n_hex}) · 계열 {sum(len(v) for v in fam.values())}")

    # 빈칸을 숨기지 않는다 — 뽑아낸 것이 지금 코드보다 적으면 갈아끼우면 안 된다
    blank = [(part, f) for part, d in fam.items() for f, h in d.items() if not h]
    if blank:
        print(f"\n⚠️  기준색 없는 계열 {len(blank)}개 — 이 계열은 '가까운 색 채우기' 가 안 돈다")
        for part, f in blank[:30]:
            print(f"     {part} {f}")
    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
