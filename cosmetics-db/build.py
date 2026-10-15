#!/usr/bin/env python3
"""
DB 를 처음부터 다시 만든다.  python3 build.py

왜 스크립트로 두나: SQLite 는 `PRAGMA foreign_keys` 를 **연결할 때마다** 켜야 한다.
schema.sql 에 적어 두어도 그 연결이 끝나면 꺼지므로, 손으로 sqlite3 를 열어 넣으면
계열 이름 오타가 그대로 들어간다(실제로 '로즈색' 이 들어갔다). 들어오는 길을
여기 하나로 모아서 그 실수를 구조적으로 막는다.
"""
import sqlite3, pathlib, sys

HERE = pathlib.Path(__file__).parent
DB = HERE / "nudy.db"

def main() -> int:
    if DB.exists():
        DB.unlink()
    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")      # ← 이 줄이 이 파일의 존재 이유다
    con.executescript((HERE / "schema.sql").read_text(encoding="utf-8"))
    # 파일 이름의 번호가 넣는 순서다. 계열(01)이 호수보다 먼저 들어가야 한다 —
    # 호수가 계열을 가리키므로 순서가 뒤집히면 FOREIGN KEY 에서 걸린다
    for f in sorted((HERE / "seed").glob("*.sql")):
        con.executescript(f.read_text(encoding="utf-8"))
        print(f"  넣음 {f.name}")
    con.commit()

    n = lambda q: con.execute(q).fetchone()[0]
    print(f"\n브랜드 {n('SELECT count(*) FROM brand')} · "
          f"제품 {n('SELECT count(*) FROM product')} · "
          f"호수 {n('SELECT count(*) FROM shade')} · "
          f"계열 {n('SELECT count(*) FROM family')}")
    print(f"기준색 없는 계열 {n('SELECT count(*) FROM family WHERE ref_hex IS NULL')}개 · "
          f"발색색 없는 호수 {n('SELECT count(*) FROM shade WHERE hex IS NULL')}개")

    # 넣자마자 확인한다 — 틀린 계열 이름이 들어가는 길이 아직 남아 있는지
    try:
        con.execute("INSERT INTO shade(product_id,code,name,family,part) "
                    "SELECT id,'ZZ','__검사__','없는계열','lip' FROM product LIMIT 1")
        con.rollback()
        print("\n⚠️  계열 이름 검사가 안 걸린다 — foreign_keys 가 꺼졌다")
        return 1
    except sqlite3.IntegrityError:
        print("계열 이름 오타 막힘 ✓")
    con.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
