-- 페리페라 스피디 스키니 브로우 — 호수와 색 (2026-10-14)
--
-- 이 제품도 DB 에 호수가 하나도 없었다. 호수부터 넣는다.
--
-- 출처: 클럽클리오(페리페라 공식몰) 상품 페이지와 상세 이미지
--   https://clubclio.co.kr/shop/goodsView/0000001999
--   호수 이름: 그 페이지의 옵션 목록(9색)
--   그림: /data/mall_data/ckeditor/test/3beb4ca4a6f1e2e4eca62c7362b664e5.jpg (1000x27293)
--         호수마다 ① 눈썹에 그린 얼굴 사진 ② 종이 발색 이 나란히 있다
--
-- **뽑은 규칙**: 본 앱 client/src/core/ref-colors.ts 와 같다. 얼굴 사진의 눈썹 몸통을
-- 상자로 감싸고 Lab 밝기 brow 구간 [5,35]만 남겨 RGB 평균.
--
-- **9호수 중 4개만 넣는다.** 계열을 확실히 말할 수 있는 것만 넣었다.
-- 지금 코드 product-picks.ts 의 페리페라 줄은 호수를
-- "그레이브라운·다크브라운·내추럴브라운·베이지애쉬·토프애쉬·밀키토프" 로 적어 두었는데,
-- 공식몰의 지금 호수는 베이지애쉬·토프애쉬가 없고 대신 쿨그레이·토프베이지·토프브라운·
-- 피오니토프·모카토프가 있다. 이 5개는 어느 계열인지 확실하지 않아 **넣지 않았다.**
-- 뽑아 둔 색은 아래에 적어 두니 계열이 정해지면 그대로 쓰면 된다.
--   006 쿨그레이   #8b7570
--   008 토프베이지 #a5887e
--   009 토프브라운 #aa887e
--   010 피오니토프 #ab7d75
--   011 모카토프   #a98278
--
-- **믿기 어려운 점**: 이니스프리와 같다. 공식 사진이 밝고 분홍빛이 돌아, 뽑은 색을
-- 본 앱의 describeColor 에 넣으면 "그레이브라운" 이 아니라 "라이트브라운" 이 나온다.
-- 밝기 차례는 맞다(002 다크브라운이 가장 어둡다). **checked=0**.

INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'001','그레이브라운','그레이브라운','brow','#795e58','발색사진','클럽클리오(페리페라) 공식몰 상세 눈썹 사진 · brow [5,35] · 사진이 밝아 실제보다 밝게 나옴','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='스피디 스키니 브로우';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'002','다크브라운','다크브라운','brow','#825a52','발색사진','클럽클리오(페리페라) 공식몰 상세 눈썹 사진 · brow [5,35] · 사진이 밝아 실제보다 밝게 나옴','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='스피디 스키니 브로우';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'003','내추럴브라운','브라운','brow','#916a5b','발색사진','클럽클리오(페리페라) 공식몰 상세 눈썹 사진 · brow [5,35] · 사진이 밝아 실제보다 밝게 나옴','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='스피디 스키니 브로우';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'012','밀키토프','밀크브라운','brow','#b18b82','발색사진','클럽클리오(페리페라) 공식몰 상세 눈썹 사진 · brow [5,35] · 사진이 밝아 실제보다 밝게 나옴','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='스피디 스키니 브로우';
