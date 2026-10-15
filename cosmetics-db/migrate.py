#!/usr/bin/env python3
"""
지금 코드(product-picks.ts)의 제품을 DB seed 로 옮긴다.  python3 migrate.py

**다 옮겨지지 않는다.** 지금 코드는 한 줄이 "제품 + 계열 묶음" 이라 호수가 어느 계열인지
적혀 있지 않다. 호수 이름이 주석에 적힌 제품도 있고 아예 없는 제품도 있다.
그래서 이 스크립트는 **확실한 것만 넣고, 애매한 것은 사람이 볼 목록으로 뽑는다.**
억지로 넣으면 틀린 색을 추천하면서 아무도 못 알아채게 된다.
"""
import re, pathlib, json

SRC = pathlib.Path("/Users/jeonjiwon/Desktop/support-yr-makeup/client/src/core/product-picks.ts")
SOURCES = pathlib.Path("/Users/jeonjiwon/Desktop/support-yr-makeup/client/public/products/SOURCES.md")
HERE = pathlib.Path(__file__).parent

src = SRC.read_text(encoding="utf-8")
body = src[src.index("export const PRODUCT_PICKS"):]

def entries():
    for pm in re.finditer(r'^  (brow|liner|shadow|lip|cheek): \[', body, re.M):
        part = pm.group(1); j = pm.end()-1; d = 0
        while True:
            if body[j] == "[": d += 1
            elif body[j] == "]": d -= 1
            if d == 0: break
            j += 1
        blk = body[pm.end():j]
        # 여러 줄 항목과 한 줄 항목 둘 다 — 한 줄짜리를 빠뜨려 6개를 놓친 적이 있다
        for em in re.finditer(r'\{[^{}]*\}', blk, re.S):
            e = em.group(0)
            g = lambda k: (re.search(rf'{k}: "([^"]*)"', e) or [None, None])[1]
            f = re.search(r'families: \[(.*?)\]', e, re.S)
            if not f: continue
            yield dict(part=part, fams=re.findall(r'"([^"]+)"', f.group(1)),
                       brand=g("brand"), name=g("name"), kind=g("kind"), photo=g("photo"),
                       cmt=" ".join(re.findall(r'//\s*(.+)', e)))

# 사진 파일 → 출처 주소
SRCMAP = dict(re.findall(r'\|\s*`([^`]+)`\s*\|[^|]*\|[^|]*\|\s*\[[^\]]*\]\((https?://[^)]+)\)', SOURCES.read_text(encoding="utf-8")))

prod = {}
for e in entries():
    prod.setdefault((e["part"], e["brand"], e["name"]), []).append(e)

SHADE_RE = re.compile(r'(?:^|[·,:|(]\s*|\s)(\d{1,3}|GS\d)\s+([가-힣A-Za-z][가-힣A-Za-z0-9 ]{0,12}?)(?=\s*[·,|(]|\s*$|\s+\d)')

def shades_of(es):
    out = []
    for e in es:
        for m in SHADE_RE.finditer(e["cmt"]):
            nm = m.group(2).strip()
            if len(nm) < 2 or nm[0].isdigit(): continue
            out.append((m.group(1), nm, e["fams"]))
    return out

def family_for(shade_name, fams):
    """
    호수가 어느 계열인지 정한다. 확실할 때만 정하고, 애매하면 None — 사람이 봐야 한다.

    ① 그 줄의 계열이 하나뿐이면 고민할 것이 없다. 호수 이름이 계열과 안 닮아도 마찬가지다
       ('모브 팬시' 가 '플럼' 한 줄에 있으면 그건 플럼이다). 이걸 빠뜨려 멀쩡한 줄들을
       사람한테 넘기고 있었다 (2026-10-14).
    ② 여럿이면 호수 이름에 들어 있는 계열로. '브라운'·'다크브라운' 둘 다 걸리면 긴 쪽
    ③ 그래도 모르면 None
    """
    if len(fams) == 1: return fams[0]
    hit = [f for f in fams if f in shade_name]
    if len(hit) == 0: return None
    return max(hit, key=len)

sql = ["-- 지금 코드(product-picks.ts)에서 옮긴 제품 (2026-10-14, migrate.py 가 만듦)",
       "-- 손으로 고치지 말 것 — migrate.py 를 고치고 다시 돌려라", ""]
brands = sorted({b for _, b, _ in prod})
for b in brands:
    sql.append(f"INSERT OR IGNORE INTO brand(name) VALUES ('{b}');")
sql.append("")

review = []; n_sh = 0
for (part, br, nm), es in sorted(prod.items()):
    e0 = es[0]
    photo = e0["photo"] or ""
    url = SRCMAP.get(photo.split("/")[-1], "")
    q = lambda v: "NULL" if not v else "'" + v.replace("'", "''") + "'"
    sql.append(f"INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) "
               f"SELECT id,'{part}',{q(nm)},{q(e0['kind'])},{q(photo)},{q(url)},'2026-10-14' "
               f"FROM brand WHERE name={q(br)};")
    got = shades_of(es)
    for code, sname, fams in got:
        fam = family_for(sname, fams)
        if fam is None:
            review.append((part, br, nm, code, sname, fams)); continue
        sql.append(f"INSERT INTO shade(product_id,code,name,family,part,checked) "
                   f"SELECT p.id,{q(code)},{q(sname)},{q(fam)},'{part}',0 "
                   f"FROM product p JOIN brand b ON b.id=p.brand_id "
                   f"WHERE b.name={q(br)} AND p.name={q(nm)};")
        n_sh += 1
    if not got:
        review.append((part, br, nm, "", "— 호수가 코드에 아예 없음", e0["fams"]))
    sql.append("")

(HERE/"seed"/"20-from-code.sql").write_text("\n".join(sql)+"\n", encoding="utf-8")
(HERE/"review-needed.md").write_text(
    "# 사람이 봐야 하는 것 (2026-10-14)\n\n"
    "migrate.py 가 자동으로 못 정한 것들. 호수 이름만으로 계열을 알 수 없거나, 코드에 호수가 없다.\n\n"
    "| 부위 | 브랜드 | 제품 | 호수 | 후보 계열 |\n|---|---|---|---|---|\n" +
    "\n".join(f"| {p} | {b} | {n} | {c} {s} | {' · '.join(f)} |" for p,b,n,c,s,f in review) + "\n",
    encoding="utf-8")

print(f"브랜드 {len(brands)} · 제품 {len(prod)} · 자동으로 넣은 호수 {n_sh}")
print(f"사람이 봐야 하는 줄 {len(review)}  →  review-needed.md")
