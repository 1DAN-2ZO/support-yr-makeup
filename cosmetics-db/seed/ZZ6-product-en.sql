-- 제품 영문 이름 (2026-10-16) — 영어 화면에서 제품을 찾을 수 있게.
--
-- 브랜드 영문 표기(ZZ5)와 같은 규칙이다: **번역이 아니라 브랜드가 쓰는 표기**를 옮긴다.
-- 못 찾으면 비워 둔다. 지어내면 없는 제품이 된다.
--
-- ── 어디서 왔나, 세 갈래 ──
--
--  [공식]  브랜드 공식 글로벌몰에서 그 이름으로 팔고 있는 것을 눈으로 확인했다.
--  [표기]  한글 이름 자체가 영어를 소리대로 적은 것이라 되돌렸다 ("카라멜 브라운" → Caramel Brown).
--          새로 지은 것이 아니라 원래 글자로 돌린 것이다.
--  [없음]  못 찾았다. 비워 둔다.
--
-- ── 한글만 보고 옮겼으면 틀렸을 것들 (꼭 확인해야 했던 까닭) ──
--
--  · 웨이크메이크 「철벽 펜 아이라이너」 → 공식 이름은 **Any-Proof Pen Eyeliner** 다.
--    일부 판매처가 "Iron Wall Pen Eyeliner" 로 적어 두었는데 그것은 철벽을 글자대로 옮긴 것이고
--    브랜드가 쓰는 이름이 아니다. 소리대로 옮겼으면 틀렸다.
--  · 이니스프리 「납작 아이브로우 펜슬」 → **Auto Eyebrow Pencil**. "Flat" 이 아니다.
--    (우리 사진 파일 이름 innisfree-auto-eyebrow-pencil.jpg 와도 맞는다.)
--  · 클리오 프로 아이 팔레트 에어 「07 라벤더 뉴커머」 → 공식 영문은 **07 Lavender Staff** 다.
--    "Newcomer" 가 아니다 — 한국과 해외의 호수 이름이 아예 다르다. 공식몰에서 직접 봤다.
--  · 모렛 → MOLETTE. 소리만 들으면 "Morette" 로 적기 쉽다 (ZZ5 참고).
--  · 에스쁘아 「노머징 브러쉬 라이너」 → **Nomudging** Brush Liner (no + smudging). 처음에 "No Merging"
--    으로 읽었는데 아예 다른 낱말이었다. 글자만 보고 옮겼으면 못 찾을 이름이 됐다.
--  · 클리오 팔레트 「10 플럼 플럼 인 시즌」 → **10 Season Plum**. 낱말 차례가 뒤집힌다.
--
-- ── 페리페라 「올 테이크 무드 팔레트」만 다르게 적었다 ──
--
-- 호수 이름이 "봄바람이 부는걸 보니 봄이 왔나봄" 같은 **한국어 말장난**이라 영문 이름이 없다.
-- 줄 이름과 번호까지만 적는다 (All Take Mood Palette 001). 번호가 곧 그 호수라 찾는 데 지장이 없고,
-- 없는 영어 이름을 지어내지 않는다.

-- ───────── 2AN ─────────
UPDATE product SET name_en = 'Dual Cheek'                       WHERE name = '듀얼 치크';                      -- [표기] 사진 2an-dual-cheek.jpg

-- ───────── 3CE ─────────
UPDATE product SET name_en = 'Face Blush'                       WHERE name = '페이스 블러쉬';                  -- [표기]
UPDATE product SET name_en = 'My Ring Eye Liner'                WHERE name = '마이 링 아이 라이너';            -- [공식] 3cecosmetics.com
UPDATE product SET name_en = 'Soft Mute Pencil Liner'           WHERE name = '소프트 뮤트 펜슬 라이너';        -- [공식] 3cecosmetics.com
UPDATE product SET name_en = 'Blur Water Tint'                  WHERE name = '블러 워터 틴트';                 -- [공식] 3cecosmetics.com

-- ───────── ALTERNATIVE STEREO ─────────
UPDATE product SET name_en = 'Lip Potion'                       WHERE name = '립 포션';                        -- [공식] StyleKorean · Amazon

-- ───────── AMUSE ─────────
UPDATE product SET name_en = 'Dew Serum Liquid Blusher'         WHERE name = '듀 세럼 리퀴드 블러쉬';          -- [표기]

-- ───────── BBIA ─────────
UPDATE product SET name_en = 'Last Auto Gel Eyeliner'           WHERE name = '라스트 오토 젤 아이라이너';      -- [표기] 사진 bbia-last-auto-gel-liner.jpg

-- ───────── CLIO ─────────
UPDATE product SET name_en = 'Kill Brow Auto Hard Brow Pencil'  WHERE name = '킬브로우 오토 하드 브로우 펜슬';           -- [공식]
UPDATE product SET name_en = 'Sharp So Simple Waterproof Pencil Liner' WHERE name = '샤프 쏘 심플 워터프루프 펜슬 라이너'; -- [공식]
UPDATE product SET name_en = 'Pro Eye Palette Air 01 Coral Studio'  WHERE name = '프로 아이 팔레트 에어 1 코랄 스튜디오';   -- [공식]
UPDATE product SET name_en = 'Pro Eye Palette Air 02 Rose Connect'  WHERE name = '프로 아이 팔레트 에어 2 로즈 커넥트';     -- [공식]
UPDATE product SET name_en = 'Pro Eye Palette Air 04 Pink Pairing'  WHERE name = '프로 아이 팔레트 에어 4 핑크 페어링';     -- [공식]
UPDATE product SET name_en = 'Pro Eye Palette Air 05 Orchid Cloud'  WHERE name = '프로 아이 팔레트 에어 5 오키드 클라우드'; -- [공식]
UPDATE product SET name_en = 'Pro Eye Palette Air 07 Lavender Staff' WHERE name = '프로 아이 팔레트 에어 7 라벤더 뉴커머';  -- [공식] 한글과 호수 이름이 다르다
UPDATE product SET name_en = 'Pro Eye Palette Air 08 Latte Senior'  WHERE name = '프로 아이 팔레트 에어 8 라떼 이즈 시니어'; -- [공식] clubclio.shop
UPDATE product SET name_en = 'Pro Eye Palette Air 10 Season Plum'  WHERE name = '프로 아이 팔레트 에어 10 플럼 플럼 인 시즌'; -- [판매처] 낱말 차례가 뒤집힌다

-- ───────── ETUDE ─────────
UPDATE product SET name_en = 'Drawing Eye Brow'                 WHERE name = '드로잉 아이 브라우';             -- [공식]
UPDATE product SET name_en = 'Drawing Show Brush Liner'         WHERE name = '드로잉쇼 브러쉬 라이너';         -- [공식]
UPDATE product SET name_en = 'Line Fix Brush Liner'             WHERE name = '라인 픽스 브러쉬 라이너';        -- [공식] StyleKorean
-- 아래 둘은 판매처마다 표기가 갈린다. 가장 브랜드에 가까운 쪽을 골랐다 — 둘 다 **실제 판매 페이지에
-- 쓰이는 이름**이고 내가 지은 것이 아니다. 공식 글로벌 페이지를 찾으면 그때 바로잡는다
UPDATE product SET name_en = '2X Bare Liner'                    WHERE name = '2X 쌩얼 라이너';                 -- [판매처] 아모레퍼시픽몰 영문 표기 (에뛰드 모회사)
UPDATE product SET name_en = 'Tear Eye Liner'                   WHERE name = '반짝 눈물 라이너';               -- [판매처] 해외 판매 페이지

-- ───────── HOLIKA HOLIKA ─────────
UPDATE product SET name_en = 'My Fave Piece Eyeshadow'          WHERE name = '마이페이브 피스 아이섀도우';     -- [표기] 사진 holika-my-fave-piece-shadow.jpg

-- ───────── LAKA ─────────
UPDATE product SET name_en = 'Perfect Twin Lip'                 WHERE name = '퍼펙트 트윈 립';                 -- [표기] 사진 laka-perfect-twin-lip.jpg

-- ───────── MERZY ─────────
UPDATE product SET name_en = 'The First Slim Gel Eyeliner'      WHERE name = '더 퍼스트 슬림 젤 아이라이너';   -- [표기] 사진 merzy-the-first-slim-gel-liner.jpg

-- ───────── MOLETTE ─────────
UPDATE product SET name_en = 'Viewfinder Shadow Palette Wine Class'    WHERE name = '뷰파인더 섀도우 팔레트 와인클래스';   -- [표기]
UPDATE product SET name_en = 'Viewfinder Shadow Palette Cooking Class' WHERE name = '뷰파인더 섀도우 팔레트 쿠킹클래스';   -- [표기]
UPDATE product SET name_en = 'Viewfinder Shadow Palette Tea Class'     WHERE name = '뷰파인더 섀도우 팔레트 티클래스';     -- [표기]
UPDATE product SET name_en = 'Viewfinder Shadow Palette Perfume Class' WHERE name = '뷰파인더 섀도우 팔레트 퍼퓸클래스';   -- [표기]
UPDATE product SET name_en = 'Viewfinder Shadow Palette Poem Class'    WHERE name = '뷰파인더 섀도우 팔레트 포엠클래스';   -- [표기]

-- ───────── WAKEMAKE ─────────
UPDATE product SET name_en = 'Any-Proof Pen Eyeliner'           WHERE name = '철벽 펜 아이라이너';             -- [공식] wakemake.hk — "Iron Wall" 이 아니다

-- ───────── dasique ─────────
UPDATE product SET name_en = 'Soft Blur Cheek'                  WHERE name = '소프트 블러 치크';               -- [표기]

-- ───────── espoir ─────────
UPDATE product SET name_en = 'Couture Lip Tint Glaze'           WHERE name = '꾸뛰르 립 틴트 글레이즈';        -- [공식] espoir.com/en
UPDATE product SET name_en = 'Nomudging Brush Liner'            WHERE name = '노머징 브러쉬 라이너';          -- [공식] no + smudging. "No Merging" 이 아니다

-- ───────── fwee ─────────
UPDATE product SET name_en = 'Cheek Chip'                       WHERE name = '치크칩';                         -- [표기] 사진 fwee-cheek-chip.jpg

-- ───────── hince ─────────
UPDATE product SET name_en = 'Half Moon Cheek'                  WHERE name = '하프 문 치크';                   -- [표기]
UPDATE product SET name_en = 'Hug Layer Cheek'                  WHERE name = '허그 레이어 치크';               -- [표기]

-- ───────── innisfree ─────────
UPDATE product SET name_en = 'Auto Eyebrow Pencil'              WHERE name = '납작 아이브로우 펜슬';           -- [공식] innisfree 글로벌 — "Flat" 이 아니다

-- ───────── lilybyred ─────────
UPDATE product SET name_en = 'Love Beam Cheek Balm'             WHERE name = '러브빔 치크밤';                  -- [표기]
UPDATE product SET name_en = 'Starry Eyes AM9 To PM9 Slim Gel Eyeliner' WHERE name = '스태리아이즈 나인투나인 슬림 젤 아이라이너'; -- [표기] 줄 이름은 공식
UPDATE product SET name_en = 'Mood It Palette 01 Fresh It'      WHERE name = '무드 잇 팔레트 01 프레쉬잇';     -- [공식]
UPDATE product SET name_en = 'Mood It Palette 02 Like It'       WHERE name = '무드 잇 팔레트 02 라이크잇';     -- [공식]
UPDATE product SET name_en = 'Mood It Palette 03 Neutral It'    WHERE name = '무드 잇 팔레트 03 뉴트럴잇';     -- [공식]
UPDATE product SET name_en = 'Mood It Palette 04 Attention It'  WHERE name = '무드 잇 팔레트 04 어텐션잇';     -- [공식]
UPDATE product SET name_en = 'Mood It Palette 05 Cherish It'    WHERE name = '무드 잇 팔레트 05 체리쉬잇';     -- [공식]
UPDATE product SET name_en = 'Mood It Palette 06 Soft It'       WHERE name = '무드 잇 팔레트 06 소프트잇';     -- [표기]
UPDATE product SET name_en = 'Mood It Palette 07 Romantic It'   WHERE name = '무드 잇 팔레트 07 로맨틱잇';     -- [표기]
UPDATE product SET name_en = 'Mood It Palette 08 Strange It'    WHERE name = '무드 잇 팔레트 08 스트레인지잇'; -- [표기]

-- ───────── peripera ─────────
UPDATE product SET name_en = 'Speedy Skinny Brow'               WHERE name = '스피디 스키니 브로우';           -- [공식]
UPDATE product SET name_en = 'Speedy Skinny Brow Mascara'       WHERE name = '스피디 스키니 브로우 마스카라';  -- [표기]
UPDATE product SET name_en = 'Pure Blushed Sunshine Cheek'      WHERE name = '퓨어 블러시드 선샤인 치크';      -- [공식]
-- 아래 13줄: 호수 이름이 한국어 말장난이라 **줄 이름 + 번호**까지만 적는다 (머리글 참고)
UPDATE product SET name_en = 'All Take Mood Palette 001' WHERE name LIKE '올 테이크 무드 팔레트 001%';
UPDATE product SET name_en = 'All Take Mood Palette 002' WHERE name LIKE '올 테이크 무드 팔레트 002%';
UPDATE product SET name_en = 'All Take Mood Palette 003' WHERE name LIKE '올 테이크 무드 팔레트 003%';
UPDATE product SET name_en = 'All Take Mood Palette 004' WHERE name LIKE '올 테이크 무드 팔레트 004%';
UPDATE product SET name_en = 'All Take Mood Palette 005' WHERE name LIKE '올 테이크 무드 팔레트 005%';
UPDATE product SET name_en = 'All Take Mood Palette 006' WHERE name LIKE '올 테이크 무드 팔레트 006%';
UPDATE product SET name_en = 'All Take Mood Palette 007' WHERE name LIKE '올 테이크 무드 팔레트 007%';
UPDATE product SET name_en = 'All Take Mood Palette 008' WHERE name LIKE '올 테이크 무드 팔레트 008%';
UPDATE product SET name_en = 'All Take Mood Palette 009' WHERE name LIKE '올 테이크 무드 팔레트 009%';
UPDATE product SET name_en = 'All Take Mood Palette 010' WHERE name LIKE '올 테이크 무드 팔레트 010%';
UPDATE product SET name_en = 'All Take Mood Palette 011' WHERE name LIKE '올 테이크 무드 팔레트 011%';
UPDATE product SET name_en = 'All Take Mood Palette 012' WHERE name LIKE '올 테이크 무드 팔레트 012%';
UPDATE product SET name_en = 'All Take Mood Palette 013' WHERE name LIKE '올 테이크 무드 팔레트 013%';

-- ───────── rom&nd ─────────
UPDATE product SET name_en = 'Better Than Cheek'                WHERE name = '베러 댄 치크';                   -- [표기]
UPDATE product SET name_en = 'Han All Shade Liner'              WHERE name = '한올 쉐이드 라이너';             -- [공식]
UPDATE product SET name_en = 'Han All Eye Pot Liner 01 Brown Taupe'  WHERE name = '한올 아이팟 라이너 01 브라운 토프 팟';   -- [공식]
UPDATE product SET name_en = 'Han All Eye Pot Liner 02 Dusty Rose'   WHERE name = '한올 아이팟 라이너 02 더스티 로즈 팟';   -- [공식]
UPDATE product SET name_en = 'Han All Eye Pot Liner 03 Peony Cream'  WHERE name = '한올 아이팟 라이너 03 피오니 크림 팟';   -- [공식]
UPDATE product SET name_en = 'Han All Eye Pot Liner 04 Caramel Brown' WHERE name = '한올 아이팟 라이너 04 카라멜 브라운 팟'; -- [표기]
UPDATE product SET name_en = 'Han All Eye Pot Liner 05 Grey Pink'   WHERE name = '한올 아이팟 라이너 05 그레이 핑크 팟';   -- [표기]
UPDATE product SET name_en = 'Han All Eye Pot Liner 06 Burnt Coral' WHERE name = '한올 아이팟 라이너 06 번트 코랄 팟';     -- [표기]
UPDATE product SET name_en = 'Juicy Lasting Tint'               WHERE name = '쥬시 래스팅 틴트';               -- [공식] 사진 romand-juicy-lasting-tint.jpg

-- ───────── too cool for school ─────────
UPDATE product SET name_en = 'Artclass Mood Pen Liner'          WHERE name = '아트클래스 무드 펜 라이너';      -- [공식] toocoolforschool.us
UPDATE product SET name_en = 'Artclass Fixing Gel Liner'        WHERE name = '아트클래스 픽싱 젤 라이너';      -- [공식] toocoolforschool.us
-- 둘을 가른 방법: 공식몰 「Artclass Smudging Under Liner」의 호수가 01 Haze · 02 Fuzzy · 03 Icy 인데,
-- 이것이 우리 **트임 라이너**의 호수(헤이즈 · 퍼지 · 아이시)와 그대로 맞는다. 엣지라이너는 호수가
-- 뮤트 블랙 · 쿨 브라운 계열이라 다르다. 이름만으로는 못 갈랐고 호수를 맞춰 보고서 갈랐다
UPDATE product SET name_en = 'Artclass Smudging Under Liner'    WHERE name = '아트클래스 스머징 트임 라이너';  -- [공식] 호수로 맞춤 (Haze · Fuzzy · Icy)
UPDATE product SET name_en = 'Artclass Smudging Edge Liner'     WHERE name = '아트클래스 스머징 엣지라이너';   -- [판매처] 해외 판매 페이지 여럿이 같은 이름
