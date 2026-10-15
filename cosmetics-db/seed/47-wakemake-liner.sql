-- 웨이크메이크 철벽 펜 아이라이너 — 호수 색 (2026-10-14)
--
-- **왜 공식몰이 아닌가**: 웨이크메이크 공식몰(wakemake.co.kr)은 지금
-- "Sorry, this store is temporarily unavailable." 만 뜬다. 클럽클리오(clubclio.co.kr)에도
-- 웨이크메이크는 없다(클리오·페리페라·구달·더마토리·힐링버드·심플레인·타입넘버·트루알엑스뿐).
-- 11번가·SSG(이마트몰)·무신사·지그재그에도 발색 자료가 없었다. SSG 는 403 으로 막혔다.
--
-- 출처: 코리아디파트 상품 상세에 실린 **브랜드 상세 이미지 사본**
--   https://en.koreadepart.com/item/1680596689
--   그림 https://www.koreadepart.com/data/cheditor4/2304/c232e298d57161a85f9f170391e402f4_irGm2DVLxQzIzy.jpg (486x3534)
--   맨 위 "세 가지 컬러!" 칸에 호수마다 **흰 바탕에 그은 획**(종이 발색)이 있다.
--   획 위치: 01 x 88~137 · 02 x 196~244 · 03 x 298~347, 모두 y 84~133.
--
-- **뽑은 규칙**: 본 앱 client/src/core/ref-colors.ts 와 같다. 상자 안에서 바탕(흰 종이)보다
-- 뚜렷이 어두운 픽셀만 모으고, 그중 Lab 밝기 liner 구간 [0,10](가장 어두운 쪽)만 남겨 RGB 평균.
--
-- **믿을 만한 정도**: 종이 발색이라 피부가 안 섞이고 어두운 쪽도 안 들렸다 —
-- 01 블랙이 L* 7.4 로 나왔다(발색 사진이면 L* 36 쯤으로 들린다, 50-brightness-caveat.sql 참고).
-- 다만 **이 그림이 작아서 획이 1~2px 밖에 안 된다.** 가장 어두운 10% 만 써서 흰 바탕이 섞이는
-- 것을 줄였지만 더 큰 그림을 찾으면 다시 재는 쪽이 낫다. 그래서 checked=0.
--
-- **말이 되는지 확인**: 밝기 차례가 이름과 맞는다 — 01 블랙(L* 7.4) < 03 다크브라운(28.2)
-- < 02 브라운(31.8). 02 는 붉은기 a* 5.7 로 갈색 쪽이다.
--
-- **DB 에 없어서 안 넣은 호수**: 03 다크브라운(#47423d, L* 28.2) 이 같은 그림에 있지만
-- DB 에 그 호수 줄이 없어 손대지 않았다. 필요하면 이 값을 쓰면 된다.

UPDATE shade SET hex='#161616', hex_source='종이발색',
  hex_note='코리아디파트 상세의 브랜드 그림 종이 발색(x 88~137, y 84~133) · liner [0,10] · L* 7.4 · 획이 1~2px 라 더 큰 그림이 생기면 다시 잴 것',
  trust='ok', checked=0
 WHERE code='01' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
   WHERE b.name='웨이크메이크' AND p.name='철벽 펜 아이라이너');

UPDATE shade SET hex='#574743', hex_source='종이발색',
  hex_note='코리아디파트 상세의 브랜드 그림 종이 발색(x 196~244, y 84~133) · liner [0,10] · L* 31.8 · 획이 1~2px 라 더 큰 그림이 생기면 다시 잴 것',
  trust='ok', checked=0
 WHERE code='02' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
   WHERE b.name='웨이크메이크' AND p.name='철벽 펜 아이라이너');
