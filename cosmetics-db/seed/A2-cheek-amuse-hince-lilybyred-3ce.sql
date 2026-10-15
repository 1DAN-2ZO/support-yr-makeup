-- 볼터치 네 브랜드 — 어뮤즈 · 힌스 · 릴리바이레드 · 3CE (2026-10-15)
--
-- 왜: 볼터치가 투에이엔·페리페라 둘뿐이고 호수 15개가 전부 연한 핑크·로즈였다.
-- 코랄·살구 / 브릭·레드 / 라벤더·모브 쪽이 통째로 비어 있어 그 쪽을 메꾼다.
--
-- **색은 전부 「피부에 바른 발색 사진」에서 읽었다.** 통 안 팬 색이나 쇼핑몰 색상칩은
-- 한 개도 쓰지 않았다. 까닭은 schema.sql 의 shade.hex 주석과 같다 — 우리가 사용자
-- 사진에서 읽는 것이 "피부 위에 올라간 색" 이라 조건이 같아야 비교가 된다.
-- (실제로 이 디비에서 통 안 60~75 vs 피부 위 74~86 으로 거의 안 겹쳤다.)
--
-- **뽑은 규칙**: 바른 자리에 상자를 잡고 **채널별 중앙값**을 썼다. 한 점이 아니라 패치다 —
-- 한 점은 조명 얼룩·주근깨 한 알에 휘둘린다. 상자 좌표는 호수마다 hex_note 에 적었다.
-- 「BEST」 「COOL BEST」 같은 딱지가 겹친 자리는 피해서 상자를 잡았다.
-- 사진마다 조명이 다르므로 **같은 사진 안의 맨살**도 같이 재서 hex_note 에 남겼다.
--
-- **공통 한계**: 넷 다 얼굴(볼·눈밑)에 바른 사진이라 **피부가 그대로 비친다.** 본 앱은 볼에
-- 피부 걷어내기(unmixSkin)를 거는데, 기준이 될 맨 이마가 이 사진들에 없어 못 걸었다.
-- 49-2an-cheek.sql 과 같은 한계다. 그래서 **값은 실제 제품보다 연하다.** 전부 checked=0.
--
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠ **family 를 비워 두라고 했는데 못 비웠다 — 사람이 봐야 한다**
--
-- 받은 지시는 "family 는 NULL 로 두고 계열은 앱 함수(99-family-from-app-name.sql)가 정한다"
-- 였다. 그런데 **schema.sql 의 shade.family 는 NOT NULL** 이라 NULL 이 안 들어간다.
-- 게다가 seed 는 파일 이름 차례로 들어가는데 'A2…' 는 '99-…' 보다 **뒤**라서,
-- 이 파일이 넣은 호수는 99 번 파일이 손댈 수조차 없다.
--
-- 그래서 **내가 색 이름을 짓지는 않고**, '미정' 이라는 계열을 하나 만들어 거기에 묶어 두었다.
-- 이건 색 이름이 아니라 "아직 안 정함" 표시다. 다음에 할 일은 둘 중 하나다.
--   ① 이 파일 이름을 99 번보다 앞으로 옮기고 family 를 NULL 로 바꾼다 (schema 도 NULL 허용으로)
--   ② 앱 describeColor 를 이 호수들의 hex 에 돌려 계열을 UPDATE 한다 (99 번 파일이 한 방식)
-- 어느 쪽으로 갈지는 내가 정할 일이 아니라 비워 둔다.
-- ───────────────────────────────────────────────────────────────────────────
--
-- id 는 2000 번대만 쓴다 (지금 쓰이는 번호: brand≤17 · product≤52 · shade≤208).

-- ① 계열 자리표. 색 이름이 아니라 "아직 안 정함" 표시다 (위 주석 참고)
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '미정');

-- ② 브랜드. 3CE(2) 와 릴리바이레드(5) 는 이미 있다
INSERT OR IGNORE INTO brand(id, name) VALUES (2001, '어뮤즈');
INSERT OR IGNORE INTO brand(id, name) VALUES (2002, '힌스');


-- ═══════════════════════════════════════════════════════════════════════════
-- 힌스 하프 문 치크 — 9색
--   https://hince.co.kr/product/하프-문-치크/1191/
--   발색 그림 https://hince.co.kr/web/upload/NNEditor/20260921/
--             copy-1789984068-EC8381EC84B8_ECB9A0EBB3B4EC95BCECA780_ED9598ED9484EBACB8ECB998ED81AC_04.jpg
--             (1000x3701) — 'COLOR CHART' 한 줄이 [왼쪽 볼에 바른 사진 | 오른쪽 가루]다.
--   상자: 바른 자리 x 290~440, 띠시작+65 ~ +140 (왼쪽 코와 'COOL BEST' 딱지를 피했다)
--         맨살      x  80~135, 띠시작+205 ~ +265 (코 옆, 거의 안 발린 자리)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO product(id, brand_id, part, name, kind, source_url, checked_at)
VALUES (2001, 2002, 'cheek', '하프 문 치크', '크림에서 파우더로 바뀌는 치크',
        'https://hince.co.kr/product/하프-문-치크/1191/', '2026-10-15');

INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 2001, v.code, v.name, '미정', 'cheek', v.hex, '발색사진:hince.co.kr', v.note, v.trust, 0 FROM (
  SELECT 2001 id,'01' code,'프레클' name,'#fabbb2' hex,'ok' trust,'하프문 COLOR CHART 띠 y1499 · 상자(290,1564)-(440,1639) 중앙값 · 같은 사진 맨살 #f2c8c0 · 브랜드 설명 "누디 애프리콧"' note UNION ALL
  SELECT 2002,'02','스윗츠','#f8b9bb','ok','하프문 COLOR CHART 띠 y1815 · 상자(290,1880)-(440,1955) 중앙값 · 같은 사진 맨살 #edc0ba · 브랜드 설명 "크리미 피치 핑크"' UNION ALL
  SELECT 2003,'03','라일락 문','#f3b5c0','ok','하프문 COLOR CHART 띠 y2131 · 상자(290,2196)-(440,2271) 중앙값 · 같은 사진 맨살 #ecc0b9 · 브랜드 설명 "페일 라일락"' UNION ALL
  SELECT 2004,'04','리본','#f7b3bc','ok','하프문 COLOR CHART 띠 y2447 · 상자(290,2512)-(440,2587) 중앙값 · 같은 사진 맨살 #edc0b9 · 브랜드 설명 "소프트 베리"' UNION ALL
  SELECT 2005,'05','로지 문','#f5b3b3','ok','하프문 COLOR CHART 띠 y2763 · 상자(290,2828)-(440,2903) 중앙값 · 같은 사진 맨살 #ecc2bb · 브랜드 설명 "뉴트럴한 생기 로즈"' UNION ALL
  SELECT 2006,'06','얼루어 문','#ecafb1','ok','하프문 COLOR CHART 띠 y3079 · 상자(290,3144)-(440,3219) 중앙값 · 같은 사진 맨살 #efc2bc · 브랜드 설명 "뮤티드 로즈 베이지"' UNION ALL
  SELECT 2007,'07','트렌치','#edb1aa','ok','하프문 COLOR CHART 띠 y3395 · 상자(290,3460)-(440,3535) 중앙값 · 같은 사진 맨살 #efc5be · 브랜드 설명 "베이크드 진저 브라운"' UNION ALL
  SELECT 2008,'08','돌체','#e6aba5','ok','하프문 COLOR CHART NEW COLOR 띠 y861 · 상자(290,926)-(440,1001) 중앙값 · 같은 사진 맨살 #eec6c1 · 브랜드 설명 "베이크드 피치"' UNION ALL
  SELECT 2009,'09','버블','#e3aab0','ok','하프문 COLOR CHART NEW COLOR 띠 y1175 · 상자(290,1240)-(440,1315) 중앙값 · 같은 사진 맨살 #eec5c0 · 브랜드 설명 "베이크드 라벤더"'
) v;


-- ═══════════════════════════════════════════════════════════════════════════
-- 힌스 허그 레이어 치크 — 7색
--   https://hince.co.kr/product/허그-레이어-치크/1391/
--   발색 그림 https://hince.co.kr/web/upload/NNEditor/20260715/
--             EC8381EC84B8_ED9788EAB7B8EBA088EC9DB4EC96B4ECB998ED81AC_07.jpg (1000x4736)
--             'Color Chart' 한 줄이 [왼쪽 볼에 바른 사진 | 오른쪽 가루]다.
--   상자: 바른 자리 x 180~340, 띠시작+120 ~ +200 ('WARM BEST' 딱지와 오른쪽 코를 피했다)
--         맨살      x 450~490, 띠시작+235 ~ +280 (콧등, 가장 덜 발린 자리)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO product(id, brand_id, part, name, kind, source_url, checked_at)
VALUES (2002, 2002, 'cheek', '허그 레이어 치크', '파우더 — 한 통에 두 칸, 겹쳐 발라요',
        'https://hince.co.kr/product/허그-레이어-치크/1391/', '2026-10-15');

INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 2002, v.code, v.name, '미정', 'cheek', v.hex, '발색사진:hince.co.kr', v.note, v.trust, 0 FROM (
  SELECT 2011 id,'01' code,'니티드' name,'#fcc5c1' hex,'ok' trust,'허그레이어 Color Chart 띠 y319 · 상자(180,439)-(340,519) 중앙값 · 같은 사진 맨살(코) #eecac7 · 브랜드 설명 "따스한 살구빛의 밀키 코랄"' note UNION ALL
  SELECT 2012,'02','러브','#f7c4ca','ok','허그레이어 Color Chart 띠 y635 · 상자(180,755)-(340,835) 중앙값 · 같은 사진 맨살(코) #ecc4c0 · 브랜드 설명 "라일락 핑크"' UNION ALL
  SELECT 2013,'03','튤','#f5bdc2','ok','허그레이어 Color Chart 띠 y951 · 상자(180,1071)-(340,1151) 중앙값 · 같은 사진 맨살(코) #ecc7c3 · 브랜드 설명 "베리 로즈"' UNION ALL
  SELECT 2014,'04','허밍','#fabebe','ok','허그레이어 Color Chart 띠 y1267 · 상자(180,1387)-(340,1467) 중앙값 · 같은 사진 맨살(코) #ecc4bf · 브랜드 설명 "뉴트럴 핑크 베이지"' UNION ALL
  SELECT 2015,'05','허그','#f3b7b3','ok','허그레이어 Color Chart 띠 y1583 · 상자(180,1703)-(340,1783) 중앙값 · 같은 사진 맨살(코) #e7bdb7 · 브랜드 설명 "소프트 웜 로즈"' UNION ALL
  SELECT 2016,'06','테디','#ecb9b5','ok','허그레이어 Color Chart 띠 y1899 · 상자(180,2019)-(340,2099) 중앙값 · 같은 사진 맨살(코) #ecc5c0 · 브랜드 설명 "톤 다운된 뮤트 베이지"' UNION ALL
  SELECT 2017,'07','미스티','#e8b6b8','ok','허그레이어 Color Chart 띠 y2215 · 상자(180,2335)-(340,2415) 중앙값 · 같은 사진 맨살(코) #e8beb8 · 브랜드 설명 "모브쉬 라벤더"'
) v;


-- ═══════════════════════════════════════════════════════════════════════════
-- 릴리바이레드 러브빔 치크밤 — 19색
--   https://lilybyred.co.kr/product/릴리바이레드-러브빔-치크밤/29/
--   발색 그림 https://hkicorea.godohosting.com/LR/L469A_ALL_02.jpg (1000x23821)
--   'Color Chart' 가 Neutral(#04 #07 #12 #13 #16) / Warm(#01 #03 #06 #08 #09 #11 #17 #19 #20) /
--   Cool(#02 #05 #10 #18 #21) 세 묶음으로 나뉘고, 한 줄이 [왼쪽 볼에 바른 사진 | 오른쪽 팬]이다.
--   상자: 바른 자리 x 210~430, 띠시작+90 ~ +200
--         맨살      x 420~500, 띠시작+300 ~ +355 (턱 쪽, 가장 덜 발린 자리)
--
--   **호수 #14 #15 는 이 Color Chart 에 없다.** 있는지 없는지 확인 못 했으므로 안 넣었다.
--
--   trust='doubt' 네 개(07·12·13·11): **같은 사진 안 맨살이 다른 줄보다 눈에 띄게 어둡다**
--   (#e2afac · #e2a7a3 · #dba8a5 · #e6ada3 vs 다른 줄 #f6c4c3~#fed1c7). 줄마다 조명이 다르거나
--   맨살 상자가 아직 발린 자리에 걸쳐 있다는 뜻이라, 이 네 개는 절대값을 믿지 말 것.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO product(id, brand_id, part, name, kind, source_url, checked_at)
SELECT 2003, b.id, 'cheek', '러브빔 치크밤', '밤 — 하트 모양 통에 담긴 크림 타입',
       'https://lilybyred.co.kr/product/릴리바이레드-러브빔-치크밤/29/', '2026-10-15'
FROM brand b WHERE b.name='릴리바이레드';

INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 2003, v.code, v.name, '미정', 'cheek', v.hex, '발색사진:lilybyred.co.kr', v.note, v.trust, 0 FROM (
  -- Neutral Tone 묶음
  SELECT 2021 id,'04' code,'심쿵빔' name,'#feaa9c' hex,'ok' trust,'치크밤 Color Chart Neutral 띠 y867 · 상자(210,957)-(430,1067) 중앙값 · 같은 사진 맨살 #feccb6 · 브랜드 설명 "퓨어 레드"' note UNION ALL
  SELECT 2022,'07','발그레빔','#f9bfc3','doubt','치크밤 Color Chart Neutral 띠 y1481 · 상자(210,1571)-(430,1681) 중앙값 · 같은 사진 맨살 #e2afac — 다른 줄보다 어두워 조명이 수상하다 · 브랜드 설명 "스트로베리 핑크"' UNION ALL
  SELECT 2023,'12','두근빔','#f2b7bb','doubt','치크밤 Color Chart Neutral 띠 y2104 · 상자(210,2194)-(430,2304) 중앙값 · 같은 사진 맨살 #e2a7a3 — 다른 줄보다 어두워 조명이 수상하다 · 브랜드 설명 "핑크 베이지"' UNION ALL
  SELECT 2024,'13','부끄빔','#f2b7b8','doubt','치크밤 Color Chart Neutral 띠 y2730 · 상자(210,2820)-(430,2930) 중앙값 · 같은 사진 맨살 #dba8a5 — 다른 줄보다 어두워 조명이 수상하다 · 브랜드 설명 "뉴트럴 핑크"' UNION ALL
  SELECT 2025,'16','꿀복빔','#f9c1c3','ok','치크밤 Color Chart Neutral 띠 y3353 · 상자(210,3443)-(430,3553) 중앙값 · 같은 사진 맨살 #f6c4c3 · 브랜드 설명 "멀멀 꿀복숭아"' UNION ALL
  -- Warm Tone 묶음
  SELECT 2026,'20','모카빔','#edb9b4','ok','치크밤 Color Chart Warm 띠 y4961 · 상자(210,5051)-(430,5161) 중앙값 · 같은 사진 맨살 #f6cbc8 · 브랜드 설명 "누디모카"' UNION ALL
  SELECT 2027,'01','청초빔','#f3b9b5','ok','치크밤 Color Chart Warm 띠 y5609 · 상자(210,5699)-(430,5809) 중앙값 · 같은 사진 맨살 #f8d6c8 · 브랜드 설명 "피치 코랄"' UNION ALL
  SELECT 2028,'03','감성빔','#feafa8','ok','치크밤 Color Chart Warm 띠 y6273 · 상자(210,6363)-(430,6473) 중앙값 · 같은 사진 맨살 #fecabc · 브랜드 설명 "MLBB 로지"' UNION ALL
  SELECT 2029,'06','복숭빔','#fbcbca','ok','치크밤 Color Chart Warm 띠 y6945 · 상자(210,7035)-(430,7145) 중앙값 · 같은 사진 맨살 #e8cac3 · 브랜드 설명 "핑크 코랄"' UNION ALL
  SELECT 2030,'08','설렘빔','#f6c3c0','ok','치크밤 Color Chart Warm 띠 y7597 · 상자(210,7687)-(430,7797) 중앙값 · 같은 사진 맨살 #eccbc3 · 브랜드 설명 "핑크코랄 베이지"' UNION ALL
  SELECT 2031,'09','새콤빔','#fcccc7','ok','치크밤 Color Chart Warm 띠 y8263 · 상자(210,8353)-(430,8463) 중앙값 · 같은 사진 맨살 #f0d0c5 · 브랜드 설명 "퓨어 오렌지"' UNION ALL
  SELECT 2032,'11','포근빔','#fbbcb5','doubt','치크밤 Color Chart Warm 띠 y8941 · 상자(210,9031)-(430,9141) 중앙값 · 같은 사진 맨살 #e6ada3 — 다른 줄보다 어두워 조명이 수상하다 · 브랜드 설명 "피치 베이지"' UNION ALL
  SELECT 2033,'17','딱복빔','#febebe','ok','치크밤 Color Chart Warm 띠 y9610 · 상자(210,9700)-(430,9810) 중앙값 · 같은 사진 맨살 #fac4c2 · 브랜드 설명 "코랄 피치"' UNION ALL
  SELECT 2034,'19','테디빔','#f6c5c1','ok','치크밤 Color Chart Warm 띠 y10280 · 상자(210,10370)-(430,10480) 중앙값 · 같은 사진 맨살 #f9cecb · 브랜드 설명 "누디 애프리콧"' UNION ALL
  -- Cool Tone 묶음
  SELECT 2035,'21','타로빔','#e9b8b9','ok','치크밤 Color Chart Cool 띠 y11926 · 상자(210,12016)-(430,12126) 중앙값 · 같은 사진 맨살 #f6cac7 · 브랜드 설명 "누디모브"' UNION ALL
  SELECT 2036,'02','순수빔','#fcbdc7','ok','치크밤 Color Chart Cool 띠 y12535 · 상자(210,12625)-(430,12735) 중앙값 · 같은 사진 맨살 #fed1c7 · 브랜드 설명 "밀키 핑크"' UNION ALL
  SELECT 2037,'05','앙큼빔','#fdd6e9','ok','치크밤 Color Chart Cool 띠 y13161 · 상자(210,13251)-(430,13361) 중앙값 · 같은 사진 맨살 #e6c4c4 · 브랜드 설명 "밀키 라벤더"' UNION ALL
  SELECT 2038,'10','포도빔','#ebc0c9','ok','치크밤 Color Chart Cool 띠 y13786 · 상자(210,13876)-(430,13986) 중앙값 · 같은 사진 맨살 #eac9c8 · 브랜드 설명 "모브 베이지"' UNION ALL
  SELECT 2039,'18','딸기빔','#fac1d4','ok','치크밤 Color Chart Cool 띠 y14408 · 상자(210,14498)-(430,14608) 중앙값 · 같은 사진 맨살 #f5c5c5 · 브랜드 설명 "퓨어 핑크"'
) v;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3CE 페이스 블러쉬 — 20색
--   https://www.3cecosmetics.com/all-products/cheeks/blush/3ce-face-blush
--   발색 그림 https://www.3cecosmetics.com/-/media/project/loreal/brand-sites/tce/apac/int/
--             en-image-assets/all-prouducts/cheeks/blush/face-blush/p-color/<칸>.jpg (각 528x260)
--             왼쪽 반(0~264)이 볼에 바른 사진, 오른쪽 반이 가루 + 이름이다.
--   상자: 바른 자리 x 140~235, y 125~205
--         맨살      x 185~250, y  10~ 55 (눈썹 위 이마)
--
--   **호수 번호(code)는 비워 뒀다.** 공식몰이 주는 code 1~20 은 이름을 알파벳 차례로 매긴
--   사이트 내부 번호일 뿐이고(CITY MAUVE=1 … TENDER DUSK=20), 제품에 적힌 호수가 아니다.
--   짐작으로 채우지 않았다.
--   **이름이 영문인 것도 그대로 뒀다** — 글로벌 공식몰에만 있고 한글 이름을 확인 못 했다.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO product(id, brand_id, part, name, kind, source_url, checked_at)
SELECT 2004, b.id, 'cheek', '페이스 블러쉬', '파우더',
       'https://www.3cecosmetics.com/all-products/cheeks/blush/3ce-face-blush', '2026-10-15'
FROM brand b WHERE b.name='3CE';

INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 2004, NULL, v.name, '미정', 'cheek', v.hex, '발색사진:3cecosmetics.com', v.note, v.trust, 0 FROM (
  -- Cool 묶음
  SELECT 2041 id,'CITY MAUVE' name,'#f8bcb9' hex,'ok' trust,'p-color/c1.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #d7b1a6 · 공식몰 묶음 Cool' note UNION ALL
  SELECT 2042,'PINK FILTER','#eebcb7','ok','p-color/c2.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #e1b8ae · 공식몰 묶음 Cool' UNION ALL
  SELECT 2043,'FOOLS IN LOVE','#f4b9b6','ok','p-color/c3.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #e2b6ac · 공식몰 묶음 Cool' UNION ALL
  SELECT 2044,'DELECTABLE','#f8b7b5','doubt','p-color/c4.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #e2b7ad · **FEVER DREAM 과 값이 똑같이 나왔다** · 공식몰 묶음 Cool' UNION ALL
  SELECT 2045,'MISSING DAWN','#f0bcc3','ok','p-color/c5.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #d7b1a6 · 공식몰 묶음 Cool' UNION ALL
  SELECT 2046,'TENDER DUSK','#e8acb3','ok','p-color/c6.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #d7b1a6 · 공식몰 묶음 Cool' UNION ALL
  SELECT 2047,'KINDA SHY','#e8b5b1','ok','p-color/c7.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #e1b8ae · 공식몰 묶음 Cool' UNION ALL
  SELECT 2048,'ODD HOUR','#f8cdda','doubt','p-color/c8.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #edc1b5 · **바른 자국이 띠처럼 좁아 상자가 다 덮지 못했다** — 팬은 연보라인데 뽑힌 값은 분홍 쪽이다 · 공식몰 묶음 Cool' UNION ALL
  -- Neutral 묶음
  SELECT 2049,'MONO PINK','#fabfbb','ok','p-color/n1.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #d7b1a6 · 공식몰 묶음 Neutral' UNION ALL
  SELECT 2050,'LET ME STAY','#f0baab','ok','p-color/n2.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #dfb6aa · 공식몰 묶음 Neutral' UNION ALL
  SELECT 2051,'SUNDAY STEPS','#f8d8d4','doubt','p-color/n3-b.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #e5baad · **거의 무색에 가까워 맨살과 잘 안 갈린다** · 공식몰 묶음 Neutral' UNION ALL
  SELECT 2052,'PINCHED SMOKE','#ebacab','ok','p-color/n4.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #d7b1a5 · 공식몰 묶음 Neutral' UNION ALL
  -- Warm 묶음
  SELECT 2053,'NUDE PEACH','#f9bfb7','ok','p-color/w1.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #d7b1a5 · 공식몰 묶음 Warm' UNION ALL
  SELECT 2054,'PURE CAKE','#f6baae','ok','p-color/w2.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #e2b7a9 · 공식몰 묶음 Warm' UNION ALL
  SELECT 2055,'FEVER DREAM','#f8b7b5','doubt','p-color/w3.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #e3b6aa · **DELECTABLE 과 값이 똑같이 나왔다** · 공식몰 묶음 Warm' UNION ALL
  SELECT 2056,'PEACH SPLASH','#f3b6a4','ok','p-color/w4.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #e0b5a8 · 공식몰 묶음 Warm' UNION ALL
  SELECT 2057,'MAPLE TOAST','#efada5','ok','p-color/w5.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #d7b1a5 · 공식몰 묶음 Warm' UNION ALL
  SELECT 2058,'ROSE BEIGE','#f3b8a7','ok','p-color/w6.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #e2b6a8 · 공식몰 묶음 Warm' UNION ALL
  SELECT 2059,'FIG DIVE','#f4baae','ok','p-color/w7.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #e2b7a9 · 공식몰 묶음 Warm' UNION ALL
  SELECT 2060,'SWEET ODDITY','#fac7bd','ok','p-color/w8.jpg 왼쪽 발색 · 상자(140,125)-(235,205) 중앙값 · 같은 사진 이마 #e7bbad · 공식몰 묶음 Warm'
) v;


-- ═══════════════════════════════════════════════════════════════════════════
-- 어뮤즈 듀 세럼 리퀴드 블러쉬 — 8색
--   https://www.amusemakeup.com/product/듀-세럼-리퀴드-블러쉬-8종-택1/1075/
--   발색 그림 https://www.amusemakeup.com/web/upload/NEW상페/CHEEK/dew serum liquid blush/12.jpg
--             (1000x4575 · S01~S04) 와 같은 폴더의 13.jpg (1000x3040 · S05·P01~P03)
--             'COLOR SHADE' 한 칸이 [왼쪽 눈밑에 바른 사진 | 오른쪽 제품] 이고 아래에 이름이 있다.
--   상자: 바른 자리 x 285~460, 칸시작+120 ~ +260
--         맨살      x  70~160, 칸시작+330 ~ +420
--
--   **8색 전부 trust='doubt'.** 이 제품은 펄이 굵게 들어가 바른 자리가 반짝이는데,
--   그래서 상자 안 흩어짐이 10~15 로 다른 제품(2~6)의 두세 배다. 중앙값으로 눌렀어도
--   펄 알갱이가 값을 들어 올린다 — **실제보다 밝고 연하게 나왔다고 보아야 한다.**
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO product(id, brand_id, part, name, kind, source_url, checked_at)
VALUES (2005, 2001, 'cheek', '듀 세럼 리퀴드 블러쉬', '리퀴드 — 세럼처럼 묽어 얇게 퍼져요',
        'https://www.amusemakeup.com/product/듀-세럼-리퀴드-블러쉬-8종-택1/1075/', '2026-10-15');

INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 2005, v.code, v.name, '미정', 'cheek', v.hex, '발색사진:amusemakeup.com', v.note, 'doubt', 0 FROM (
  SELECT 2071 id,'S01' code,'마멀레이드' name,'#f9ccc1' hex,'듀세럼 12.jpg COLOR SHADE 칸 y1656 · 상자(285,1776)-(460,1916) 중앙값 · 같은 사진 맨살 #edc5b9 · 펄 때문에 흩어짐 9.8 · 브랜드 설명 "우유 살구잼 누드"' note UNION ALL
  SELECT 2072,'S02','로즈 미네랄','#f4c5c2','듀세럼 12.jpg COLOR SHADE 칸 y2386 · 상자(285,2506)-(460,2646) 중앙값 · 같은 사진 맨살 #e9c1b6 · 펄 때문에 흩어짐 12.3 · 브랜드 설명 "장밋빛 혈색"' UNION ALL
  SELECT 2073,'S03','피치 라떼','#f5c4c0','듀세럼 12.jpg COLOR SHADE 칸 y3116 · 상자(285,3236)-(460,3376) 중앙값 · 같은 사진 맨살 #efc7bd · 펄 때문에 흩어짐 12.2 · 브랜드 설명 "멀멀 구운 복숭아"' UNION ALL
  SELECT 2074,'S04','오트 모카','#eec4ba','듀세럼 12.jpg COLOR SHADE 칸 y3845 · 상자(285,3965)-(460,4105) 중앙값 · 같은 사진 맨살 #efc8be · 펄 때문에 흩어짐 12.7 · 브랜드 설명 "구운 오트 베이지"' UNION ALL
  SELECT 2075,'S05','우베라','#eec1c1','듀세럼 13.jpg COLOR SHADE 칸 y0 · 상자(285,120)-(460,260) 중앙값 · 같은 사진 맨살 #f1cbc0 · 펄 때문에 흩어짐 12.1 · 브랜드 설명 "몽환적 크림 모브"' UNION ALL
  SELECT 2076,'P01','바닐라 쉘','#f3cbbb','듀세럼 13.jpg COLOR SHADE 칸 y729 · 상자(285,849)-(460,989) 중앙값 · 같은 사진 맨살 #e7bdb0 · 펄 때문에 흩어짐 14.8 · 브랜드 설명 "우유빛 누드 펄"' UNION ALL
  SELECT 2077,'P02','로즈 차이','#f1bfb8','듀세럼 13.jpg COLOR SHADE 칸 y1459 · 상자(285,1579)-(460,1719) 중앙값 · 같은 사진 맨살 #e9c1b5 · 펄 때문에 흩어짐 10.8 · 브랜드 설명 "로즈 베이지 펄"' UNION ALL
  SELECT 2078,'P03','레드빈 모브','#f5bdb8','듀세럼 13.jpg COLOR SHADE 칸 y2189 · 상자(285,2309)-(460,2449) 중앙값 · 같은 사진 맨살 #efc0b2 · 펄 때문에 흩어짐 10.4 · 브랜드 설명 "팥 모비시 펄"'
) v;
