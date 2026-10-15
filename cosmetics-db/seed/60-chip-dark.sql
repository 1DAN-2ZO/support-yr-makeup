-- 어두운 라이너·눈썹 14개 — 색을 색상칩에서 다시 받는다 (2026-10-14)
--
-- **왜 바꾸나**: 이 14개는 브랜드 발색 사진에서 뽑았는데, 그 사진들이 어두운 쪽을
-- 들어올려 보정돼 있어 실제보다 밝다(50-brightness-caveat.sql 참고). 같은 사진 안의
-- 맨 피부를 기준으로 되돌려도 배수 하나로는 안 된다 — 보정이 배수가 아니기 때문이다.
-- 아이라이너·눈썹은 불투명해서 밑색이 거의 안 비치므로, **이 부위만큼은 칩이 발색보다
-- 진실에 가깝다.** (입술·섀도우·볼터치는 반대다. 그쪽은 손대지 않았다.)
--
-- **출처**
--   클리오 샤프 쏘 심플 펜슬 라이너 — 클럽클리오 공식몰 상세의 13색 칩 그리드
--     https://clubclio.co.kr/shop/goodsView/0000003203
--     그림 /data/mall_data/ckeditor/test/9caaa8583b5ea91a87ba4dc8af8b75d6.jpg (1000x23953)
--     칩 그리드는 y 11000~11300. 호수마다 네모 색 블록에 흰 글씨가 올라가 있다.
--   이니스프리 납작 아이브로우 펜슬 — 이니스프리 공식몰 상세의 호수별 세로 색 띠
--     https://www.innisfree.com/kr/ko/dp/product/35100
--     그림 /publish/pdtDetail/makeup/eye/Auto_Eyebrow_Pencil2/img_13.jpg (780x3556)
--     눈썹 사진과 종이 발색 사이의 x 405~440 띠. 7색 모두 픽셀 편차 0 인 완전 평면색.
--   페리페라 스피디 스키니 브로우 — 클럽클리오 공식몰 상세의 호수 머리띠
--     https://clubclio.co.kr/shop/goodsView/0000001999
--     그림 /data/mall_data/ckeditor/test/3beb4ca4a6f1e2e4eca62c7362b664e5.jpg (1000x27293)
--     **네모 칩 그리드가 없다.** 호수마다 있는 '01 그레이 브라운' 머리띠 배경색을 썼다.
--     상품 페이지 HTML 에도 옵션 색 동그라미가 없다(글자 목록뿐).
--
-- **뽑은 규칙**: 상자를 테두리 4px 안쪽으로 줄이고, 색을 4단위로 뭉쳐 최빈색을 찾은 뒤
-- 그 색에서 ±18 안쪽 픽셀만 남겨 평균. 흰 글씨와 테두리가 빠진다.
-- 클리오 004 다크브라운만 예외 — 펄이 박힌 칩이라 최빈색이 흰 반짝이에 걸린다.
-- 글자 위·아래 띠의 중앙값을 썼다(#574338). 41-clio 머리말의 평균값 #625046 보다 어둡다.
--
-- **의심스러운 값 — 사람이 봐야 한다**
--   클리오 005 애쉬브라운   발색 L* 45.9 → 칩 L* 52.3 (+6.3)  칩이 더 밝다
--   이니스프리 1 로즈브라운  발색 L* 45.6 → 칩 L* 54.2 (+8.6)  칩이 더 밝다
--   이니스프리 4 애쉬브라운  발색 L* 47.9 → 칩 L* 47.1 (-0.7)  거의 같다
--   클리오 010 코코아브라운  발색 L* 47.2 → 칩 L* 45.9 (-1.4)  거의 같다
--   페리페라 003 내추럴브라운 발색 L* 48.4 → 칩 L* 45.8 (-2.6) 거의 같다.
--     게다가 이 머리띠 색(#846749)은 같은 페이지 '11 모카 토프' 머리띠와 **완전히 같다.**
--     머리띠가 호수별 색이 아니라 디자인용으로 돌려 쓰인 것일 수 있다.
--   밝은 쪽 호수는 원래 보정이 잘 먹어 발색과 칩이 비슷하다는 점은 41·42 머리말에도
--   적혀 있다. 그래도 바꾼 까닭은 "라이너·눈썹은 칩이 기준" 을 14개 모두에 똑같이
--   적용해 섞이지 않게 하려는 것이다. 되돌리려면 hex_note 의 이전 값을 쓰면 된다.
--
-- **못 바꾼 호수**: 없다. 14개 모두 칩을 찾았다.
--   삐아 라스트 오토 젤 아이라이너 3개(03·04·07)는 이미 30-bbia-hex.sql 에서
--   라벨 띠(= 칩)에서 왔으므로 이번 일에서 뺐다.
--
-- hex_note 의 '어두운 호수 …' 표시는 지운다 — 칩으로 바꾼 값은 사진 보정 문제가 아니다.
-- checked 는 0 으로 둔다. 칩도 아직 사람이 확인한 값이 아니다.

-- ── 클리오 샤프 쏘 심플 워터프루프 펜슬 라이너 ─────────────────────────────
UPDATE shade SET hex='#000000', hex_source='색상칩', hex_note='클럽클리오 공식몰 상세 칩 그리드(y 11000~11300) · 이전 발색사진 값 #615153', checked=0
 WHERE code='001' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');
UPDATE shade SET hex='#51352a', hex_source='색상칩', hex_note='클럽클리오 공식몰 상세 칩 그리드(y 11000~11300) · 이전 발색사진 값 #9b5752', checked=0
 WHERE code='002' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');
UPDATE shade SET hex='#4c3f39', hex_source='색상칩', hex_note='클럽클리오 공식몰 상세 칩 그리드(y 11000~11300) · 이전 발색사진 값 #734f4e', checked=0
 WHERE code='003' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');
UPDATE shade SET hex='#574338', hex_source='색상칩', hex_note='클럽클리오 공식몰 상세 칩 그리드(y 11000~11300) · 펄 칩이라 중앙값 · 이전 발색사진 값 #805752', checked=0
 WHERE code='004' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');
UPDATE shade SET hex='#92776c', hex_source='색상칩', hex_note='클럽클리오 공식몰 상세 칩 그리드(y 11000~11300) · 칩이 발색보다 밝다(L* 45.9→52.3) 의심 · 이전 발색사진 값 #945f5a', checked=0
 WHERE code='005' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');
UPDATE shade SET hex='#9a5d48', hex_source='색상칩', hex_note='클럽클리오 공식몰 상세 칩 그리드(y 11000~11300) · 발색과 거의 같다(L* 47.2→45.9) · 이전 발색사진 값 #a15e52', checked=0
 WHERE code='010' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');

-- ── 이니스프리 납작 아이브로우 펜슬 ───────────────────────────────────────
UPDATE shade SET hex='#a97568', hex_source='색상칩', hex_note='이니스프리 공식몰 img_13 색 띠(x 405~440) · 칩이 발색보다 밝다(L* 45.6→54.2) 의심 · 이전 발색사진 값 #945e54', checked=0
 WHERE code='1' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬');
UPDATE shade SET hex='#35383d', hex_source='색상칩', hex_note='이니스프리 공식몰 img_13 색 띠(x 405~440) · 이전 발색사진 값 #685757', checked=0
 WHERE code='2' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬');
UPDATE shade SET hex='#786d71', hex_source='색상칩', hex_note='이니스프리 공식몰 img_13 색 띠(x 405~440) · 발색과 거의 같다(L* 47.9→47.1) · 이전 발색사진 값 #8c6968', checked=0
 WHERE code='4' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬');
UPDATE shade SET hex='#5f4e47', hex_source='색상칩', hex_note='이니스프리 공식몰 img_13 색 띠(x 405~440) · 이전 발색사진 값 #7c564e', checked=0
 WHERE code='5' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬');
UPDATE shade SET hex='#634e4b', hex_source='색상칩', hex_note='이니스프리 공식몰 img_13 색 띠(x 405~440) · 이전 발색사진 값 #8f645e', checked=0
 WHERE code='6' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬');

-- ── 페리페라 스피디 스키니 브로우 ─────────────────────────────────────────
UPDATE shade SET hex='#3b3b3b', hex_source='색상칩', hex_note='클럽클리오(페리페라) 공식몰 상세 호수 머리띠(y 11984~12128) · 네모 칩이 없어 머리띠를 씀 · 이전 발색사진 값 #795e58', checked=0
 WHERE code='001' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='스피디 스키니 브로우');
UPDATE shade SET hex='#604a3d', hex_source='색상칩', hex_note='클럽클리오(페리페라) 공식몰 상세 호수 머리띠(y 12848~12992) · 네모 칩이 없어 머리띠를 씀 · 이전 발색사진 값 #825a52', checked=0
 WHERE code='002' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='스피디 스키니 브로우');
UPDATE shade SET hex='#846749', hex_source='색상칩', hex_note='클럽클리오(페리페라) 공식몰 상세 호수 머리띠(y 13705~13845) · 발색과 거의 같고(L* 48.4→45.8) 11 모카토프 머리띠와 색이 똑같다 — 디자인용일 수 있음 의심 · 이전 발색사진 값 #916a5b', checked=0
 WHERE code='003' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='스피디 스키니 브로우');
