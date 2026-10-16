-- 브랜드 영문 표기 (2026-10-16) — 영어 화면에서 제품을 찾을 수 있게 하려고 넣는다.
--
-- **번역이 아니다.** 통에 적혀 있는 글자를 그대로 옮긴 것이라 대소문자도 건드리지 않는다:
-- `rom&nd` 는 소문자에 `&`, `CLIO` 는 대문자, `too cool for school` 은 띄어쓰기까지 소문자다.
-- 한글 이름을 소리 나는 대로 적은 것이 아니라 브랜드가 스스로 쓰는 표기다.
--
-- ── 어디서 확인했나 ──
--
-- 지어낸 것이 하나도 없게, **레포 안에 이미 있는 자료**부터 썼다. 두 갈래다:
--
--  ① 제품 사진 파일 이름 — `client/public/products/*.jpg`.
--     사진을 받을 때 그 브랜드의 판매 페이지를 보고 파일 이름을 지었으니, 그 글자가 곧 표기다.
--     (`molette-viewfinder-palette.jpg` → 모렛은 MOLETTE 다. 소리만 들으면 "모레트" 로 적기 쉽다.)
--  ② `product.source_url` 의 공식몰 주소 — `romand.co.kr` · `etude.com` · `hince.co.kr` 처럼
--     브랜드가 스스로 고른 도메인이다.
--
-- 얼터너티브스테레오 하나만 레포에 자료가 없어서 (사진도 출처도 비어 있다) 따로 찾았다 —
-- 무신사·StyleKorean 의 브랜드 표기가 `ALTERNATIVE STEREO` · `alternative stereo` 로 같다.
--
-- ── 지키는 규칙 ──
--
-- **모르면 비워 둔다.** 영문 표기가 없는 브랜드가 생기면 `name_en` 을 NULL 로 두고, 화면은
-- 한글 이름을 그대로 쓴다 (없는 브랜드 이름을 보여 주는 것보다 낫다).
-- 지금은 21개 모두 찾았다.

UPDATE brand SET name_en = 'ALTERNATIVE STEREO' WHERE name = '얼터너티브스테레오';  -- 무신사 · StyleKorean
UPDATE brand SET name_en = '3CE'                WHERE name = '3CE';                  -- 3cecosmetics.com
UPDATE brand SET name_en = 'LAKA'               WHERE name = '라카';                 -- laka-perfect-twin-lip.jpg
UPDATE brand SET name_en = 'rom&nd'             WHERE name = '롬앤';                 -- romand.co.kr
UPDATE brand SET name_en = 'lilybyred'          WHERE name = '릴리바이레드';         -- lilybyred.co.kr
UPDATE brand SET name_en = 'MERZY'              WHERE name = '머지';                 -- merzy-the-first-slim-gel-liner.jpg
UPDATE brand SET name_en = 'MOLETTE'            WHERE name = '모렛';                 -- molette-viewfinder-palette.jpg
UPDATE brand SET name_en = 'BBIA'               WHERE name = '삐아';                 -- bbia-last-auto-gel-liner.jpg
UPDATE brand SET name_en = 'ETUDE'              WHERE name = '에뛰드';               -- etude.com
UPDATE brand SET name_en = 'espoir'             WHERE name = '에스쁘아';             -- espoir.com
UPDATE brand SET name_en = 'WAKEMAKE'           WHERE name = '웨이크메이크';         -- wakemake-pen-eyeliner.jpg
UPDATE brand SET name_en = 'innisfree'          WHERE name = '이니스프리';           -- innisfree.com
UPDATE brand SET name_en = 'CLIO'               WHERE name = '클리오';               -- clubclio.co.kr · clio-pro-eye-palette-air.jpg
UPDATE brand SET name_en = '2AN'                WHERE name = '투에이엔';             -- 2an-dual-cheek.jpg
UPDATE brand SET name_en = 'peripera'           WHERE name = '페리페라';             -- peripera-speedy-skinny-brow.jpg
UPDATE brand SET name_en = 'fwee'               WHERE name = '퓌';                   -- fwee-cheek-chip.jpg
UPDATE brand SET name_en = 'HOLIKA HOLIKA'      WHERE name = '홀리카홀리카';         -- holika-my-fave-piece-shadow.jpg
UPDATE brand SET name_en = 'dasique'            WHERE name = '데이지크';             -- dasique.co.kr
UPDATE brand SET name_en = 'AMUSE'              WHERE name = '어뮤즈';               -- amusemakeup.com
UPDATE brand SET name_en = 'hince'              WHERE name = '힌스';                 -- hince.co.kr
UPDATE brand SET name_en = 'too cool for school' WHERE name = '투쿨포스쿨';          -- toocoolforschool.com
