-- nudy 화장품 DB (2026-10-14)
--
-- 왜 만드나: 지금 제품 데이터가 client/src/core/product-picks.ts 안에 박혀 있는데,
-- 한 줄이 "제품 + 계열 묶음" 이라 호수를 못 담는다. 그래서 삐아 26색이 5줄로 쪼개졌고
-- 호수 색(hex)을 적을 자리가 없다. 호수 단위로 바꾸면 둘 다 풀린다.
--
-- 최종 목표는 "계열 이름" 이 아니라 "이 호수" 를 집어 주는 것이다. 그러려면 호수마다
-- 발색 색이 있어야 하고, 그 수가 수백 개가 되면 코드 파일로는 사람이 못 고친다.

PRAGMA foreign_keys = ON;

CREATE TABLE brand (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

-- 제품 = **사람이 사는 한 단위**.
--
-- 팔레트는 여기서 갈린다. "클리오 프로 아이 팔레트 에어" 는 한 제품이 아니라 **팔레트 종류마다
-- 한 제품**이다 — 사람이 사는 것이 "3호 뮤트 라이브러리" 한 통이기 때문이다. 그 통 안의 칸 12개가
-- shade 가 된다 (2026-10-14).
--
-- 전에는 팔레트 종류를 shade 로 두었는데, 그러면 칸 색을 넣을 자리가 없어 섀도우가 통째로 비었다
-- (제품 5개·색 0개). 칸 테이블을 하나 더 두는 방법도 있지만 쿼리와 내보내기를 다 고쳐야 해서,
-- **사는 단위에 맞춰 제품을 쪼개는 쪽**을 골랐다. 스키마는 안 바뀐다.
CREATE TABLE product (
  id          INTEGER PRIMARY KEY,
  brand_id    INTEGER NOT NULL REFERENCES brand(id),
  part        TEXT NOT NULL CHECK (part IN ('brow','liner','shadow','lip','cheek')),
  name        TEXT NOT NULL,
  -- 제형·도구. "왜 이것인지" 를 한눈에 — 펜슬인지 팔레트인지 틴트인지
  kind        TEXT NOT NULL,
  -- 화면에 띄울 제품 사진 (/products/*.jpg)
  photo       TEXT,
  -- 출처. SOURCES.md 가 하던 일을 여기로 가져온다 — 사진 권리가 브랜드에 있어서 꼭 남겨야 한다
  source_url  TEXT,
  checked_at  DATE,
  -- **한 제품을 통(팟·호수 묶음)마다 쪼개 넣었을 때, 그 묶음의 이름.** 안 쪼갰으면 비운다.
  --
  -- 왜 필요한가: 팔레트는 "사람이 사는 한 단위" 가 통이라 통마다 제품 한 줄로 넣는다
  -- (80-palette-split.sql). 그런데 화면은 **같은 제품을 두 번 보여 주면 안 된다** —
  -- 앱이 이름으로 중복을 거르는데 통마다 이름이 달라서(「2 로즈 커넥트」·「4 핑크 페어링」)
  -- 거르개가 안 먹었다. 2026-10-15 에 실제로 한 화면에 같은 팔레트가 둘 떴다.
  -- 이 칸이 같은 제품끼리를 묶어 줘서, **한 묶음에서 하나만** 뜨게 한다.
  -- 어느 통인지는 name 으로 그대로 보여 준다 — 통까지 알려 주는 편이 쓸모 있다.
  group_name  TEXT,
  -- **전지원이 실물·판매 페이지로 직접 확인한 제품**. checked_at 과 다른 것이다 —
  -- checked_at 은 "이 줄을 언제 넣었나" 라서 모든 제품에 들어가 있고, 이 칸은
  -- "직접 보고 확인했나" 다. 앱의 `ProductPick.checked` 가 그대로 여기로 온다 (2026-10-15)
  checked     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (brand_id, name)
);

-- 제품 단위로만 아는 계열 (2026-10-15).
--
-- 앱(client/src/core/product-picks.ts)은 제품 한 줄에 계열을 손으로 적어 두었다.
-- 호수 이름을 읽어서 적은 것이라("호수에 그레이브라운·다크브라운…이 있어") 계열은 아는데
-- **어느 호수가 그 계열인지, 그 색이 무엇인지는 모른다.** shade 표에는 넣을 수가 없다 —
-- 호수 이름을 지어내야 하기 때문이다.
--
-- 그래서 그 계열을 제품에 바로 붙인다. shade 가 생기면 그 줄을 지우면 된다.
-- family 를 가리키므로 계열 이름 오타는 여기서도 막힌다.
CREATE TABLE product_family (
  product_id  INTEGER NOT NULL REFERENCES product(id),
  part        TEXT NOT NULL,     -- product.part 와 같다 (family 를 가리키려고 둔다)
  family      TEXT NOT NULL,
  -- 어디서 온 계열인가. 호수 색을 재서 옮기려면 이 글이 단서다
  note        TEXT,
  PRIMARY KEY (product_id, family),
  FOREIGN KEY (part, family) REFERENCES family(part, name)
);

-- 계열. **이름과 기준색을 한 줄에 둔다.**
--
-- 지금은 이름이 color-name.ts 에, 기준색이 color-family.ts 에 따로 있어서 어긋난다.
-- 이름은 지어지는데 기준색이 없는 계열이 22개이고, 그 계열은 "가까운 색 채우기" 가
-- 아예 안 돈다. 반대로 팔레트에만 있고 이름으로는 안 나오는 죽은 색도 4개 있다.
-- 한 줄에 같이 두면 그런 어긋남이 구조적으로 불가능해진다.
CREATE TABLE family (
  part     TEXT NOT NULL CHECK (part IN ('brow','liner','shadow','lip','cheek')),
  name     TEXT NOT NULL,
  -- 이 계열의 기준색. **비어 있으면 그 계열은 추천을 못 채운다** — 채워야 할 빈칸이다
  ref_hex  TEXT,
  PRIMARY KEY (part, name)
);

-- 호수. 여기가 이 DB 의 핵심이다.
CREATE TABLE shade (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES product(id),
  code        TEXT,                 -- "11", "GS3", "01"
  name        TEXT NOT NULL,        -- 리넨베이지, 밀크 카라멜
  family      TEXT NOT NULL,        -- 베이지, 코랄 ...
  part        TEXT NOT NULL,        -- product.part 와 같다 (family 를 가리키려고 둔다)
  -- 이 호수의 발색 색. **통 안의 팬 색이나 쇼핑몰 색상칩이 아니라 피부에 바른 색**이어야 한다.
  -- 우리가 사용자 사진에서 읽는 것이 "피부 위에 올라간 색" 이라 조건이 같아야 비교가 된다
  hex         TEXT,
  -- 그 색을 어디서 어떻게 얻었나. 나중에 "이 값 믿어도 되나" 를 가릴 유일한 단서다
  hex_source  TEXT,                 -- '발색사진' / '직접측정' / '종이발색'
  hex_note    TEXT,                 -- 뽑은 규칙·사진 주소 등
  /**
   * 이 색을 얼마나 믿나. **글이 아니라 칸으로 둔다** —
   * 전에는 hex_note 에 "어두운 호수 …" 라고 적고 LIKE 로 찾았는데, 글을 조금만 고쳐도
   * 안 걸린다. 실제로 그 글을 바꾸자 걸리던 줄이 사라졌다 (2026-10-14).
   *   ok     믿을 만하다
   *   dark   어두운 호수 — 발색 사진이 들려 있어 실제보다 밝다. 절대값 쓰지 말 것(차례는 맞음)
   *   doubt  의심스럽다 — 칩이 디자인용으로 보이거나 다른 호수와 같은 값이 나왔다
   */
  trust       TEXT NOT NULL DEFAULT 'ok' CHECK (trust IN ('ok','dark','doubt')),
  checked     INTEGER NOT NULL DEFAULT 0,
  -- 이 호수만 찍은 사진 (/products/*.jpg). 제품 사진(product.photo)과 따로 둔다 —
  -- 투에이엔 듀얼 치크처럼 호수마다 색이 다른 제품은 앱이 호수별 사진을 가지고 있었다.
  -- **내보내기는 아직 제품 사진 한 장만 쓴다.** 호수를 집어 주게 되면 여기를 쓴다 (2026-10-15)
  photo       TEXT,
  UNIQUE (product_id, name),
  FOREIGN KEY (part, family) REFERENCES family(part, name)
);

CREATE INDEX idx_shade_find ON shade(part, family);

-- 추천에 쓰는 보기 — 부위+계열로 제품을 찾고, 한 제품은 한 줄로 묶는다.
-- 지금 코드가 "삐아 5줄" 로 쪼개 넣던 일을 GROUP BY 가 대신한다.
CREATE VIEW pick AS
SELECT p.part, s.family, b.name AS brand, p.name AS product, p.kind, p.photo,
       COUNT(*) AS n_shades,
       GROUP_CONCAT(s.name, ' · ') AS shades
FROM shade s
JOIN product p ON p.id = s.product_id
JOIN brand   b ON b.id = p.brand_id
GROUP BY p.id, s.family;
