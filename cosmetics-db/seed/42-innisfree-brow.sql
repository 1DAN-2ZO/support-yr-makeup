-- 이니스프리 납작 아이브로우 펜슬 — 호수와 색 (2026-10-14)
--
-- 이 제품은 DB 에 호수가 하나도 없었다. 그래서 호수부터 넣는다.
--
-- 출처: 이니스프리 공식몰 상품 페이지와 상세 이미지
--   https://www.innisfree.com/kr/ko/dp/product/35100
--   호수 이름: 그 페이지의 옵션 목록(7색)
--   그림: /publish/pdtDetail/makeup/eye/Auto_Eyebrow_Pencil2/img_13.jpg (780x3556)
--         호수마다 ① 눈썹에 그린 얼굴 사진 ② 색상칩 띠 ③ 종이 발색 이 나란히 있다
--
-- **뽑은 규칙**: 본 앱 client/src/core/ref-colors.ts 와 같다. 얼굴 사진의 눈썹을 상자로
-- 감싸고 Lab 밝기 brow 구간 [5,35](어두운 쪽 — 털 사이 피부를 뺀다)만 남겨 RGB 평균.
-- 눈썹 사진을 쓴 까닭: 본 앱이 읽는 것도 "눈썹 털에 올라간 색" 이라 조건이 같다.
--
-- **계열**: 호수 이름에서 정했다. 지금 코드 product-picks.ts 의 이니스프리 줄에
-- "로즈 브라운 · 블랙 · 그레이 · 애쉬 브라운 · 에스프레소 브라운 · 어반 브라운 · 허니 브라운"
-- 순서로 계열을 적어 둔 것이 있어 그대로 따랐다 (로즈 브라운→레드브라운, 블랙→소프트블랙 …).
-- 그 줄의 families 에는 밀크브라운도 있는데 호수가 7개뿐이라 짝이 남는다 — 사람이 확인할 것.
-- 4호가 들어간 '애쉬브라운' 계열은 family 표에 '애쉬브라운  ※이름이 안 지어짐' 으로 적혀 있다.
-- color-name.ts 가 그 이름을 짓지 못한다는 뜻이라, 사진에서 그 이름이 나올 일이 없어
-- 이 호수는 추천에 뜨지 않는다. 계열 쪽에서 풀어야 할 문제다.
--
-- **믿기 어려운 점**: 공식 사진이 밝고 분홍빛이 돌아, 뽑은 색이 호수 이름보다 밝고 붉다.
--   같은 그림의 색상칩과 대 보면
--     1 로즈브라운   눈썹 #945e54 ↔ 칩 #a97568
--     2 블랙         눈썹 #685757 ↔ 칩 #35383d   ← 눈썹에서는 검정이 안 나온다
--     3 그레이       눈썹 #8a736e ↔ 칩 #6f6e6c
--     4 애쉬브라운   눈썹 #8c6968 ↔ 칩 #786d71
--     5 에스프레소   눈썹 #7c564e ↔ 칩 #5f4e47
--     6 어반브라운   눈썹 #8f645e ↔ 칩 #634e4b
--     7 허니브라운   눈썹 #a57664 ↔ 칩 #b1927d
--   밝기 차례는 맞지만(2번이 가장 어둡다) 절대값은 칩보다 한참 밝다. **checked=0**.
--   같은 그림의 종이 발색에서도 뽑아 봤으나 흰 종이가 상자의 대부분이라 밝기 구간이
--   종이를 잡아 더 밝게 나왔다 (예: 2 블랙 #a5a3a3). 그래서 쓰지 않았다.

INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'1','석양에 핀 로즈 브라운','레드브라운','brow','#945e54','발색사진','이니스프리 공식몰 img_13 눈썹 사진 · brow [5,35] · 칩 #a97568','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'2','깜깜한 밤하늘 블랙','소프트블랙','brow','#685757','발색사진','이니스프리 공식몰 img_13 눈썹 사진 · brow [5,35] · 칩 #35383d 와 크게 어긋남','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'3','꿈꾸는 새벽녘 그레이','그레이브라운','brow','#8a736e','발색사진','이니스프리 공식몰 img_13 눈썹 사진 · brow [5,35] · 칩 #6f6e6c','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'4','새벽 이슬 애쉬 브라운','애쉬브라운  ※이름이 안 지어짐','brow','#8c6968','발색사진','이니스프리 공식몰 img_13 눈썹 사진 · brow [5,35] · 칩 #786d71','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'5','깊은 밤 에스프레소 브라운','다크브라운','brow','#7c564e','발색사진','이니스프리 공식몰 img_13 눈썹 사진 · brow [5,35] · 칩 #5f4e47','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'6','동트기 전 어반 브라운','브라운','brow','#8f645e','발색사진','이니스프리 공식몰 img_13 눈썹 사진 · brow [5,35] · 칩 #634e4b','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'7','밤새고 달콤한 허니 브라운','라이트브라운','brow','#a57664','발색사진','이니스프리 공식몰 img_13 눈썹 사진 · brow [5,35] · 칩 #b1927d','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='이니스프리' AND p.name='납작 아이브로우 펜슬';
