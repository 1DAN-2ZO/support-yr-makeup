-- 삐아 라스트 오토 젤 아이라이너 — 호수 색 (2026-10-14)
--
-- 출처: 삐아 공식몰 상세 이미지의 **호수 라벨 띠 색**
--   https://www.bbia.co.kr/goods/goods_view.php?goodsNo=206
--
-- **왜 팔 발색이 아니라 띠인가**: 같은 페이지에 호수마다 눈에 그은 사진이 있지만,
-- 거기서 색을 뽑으면 속눈썹이 섞여 밝은 호수가 전부 어두운 갈색으로 나온다.
-- 본 앱은 얼굴 점으로 눈꺼풀 띠만 골라 이 문제를 피하는데, 이 사진은 눈만 잘려 있어
-- 얼굴 점을 못 잡는다. 아이라이너는 불투명해서 칩과 발색 차이가 작다는 점도 고려했다.
--
-- **다만 다 믿을 수는 없다.** 눈 사진에서 뽑은 값과 대 보니
--   어두운 호수는 맞고 (02 재즈 띠 #3b2822 = 눈사진 #3b2822)
--   밝은 호수는 크게 어긋난다 (15 살몬베이지 띠 #ffe5d0 ≠ 눈사진 #503836)
-- 어느 쪽이 참인지 가릴 근거가 아직 없다. 특히 08 엔젤(#f9e1e1)은 거의 흰색이라
-- 아이라이너 색으로 말이 안 된다 — 띠가 디자인용 연한 색일 가능성이 크다.
-- 그래서 **checked=0** 으로 둔다. 팔 발색 사진이 생기면 덮어쓴다.
--
-- 10번은 공식몰 상세에 없다 (단종으로 보인다).

UPDATE shade SET hex='#2d2b2c', hex_source='라벨띠', hex_note='삐아 공식몰 상세 · 눈사진과 일치', checked=0 WHERE code='01' AND name LIKE '느와르%'   AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#8e4d47', hex_source='라벨띠', hex_note='삐아 공식몰 상세', checked=0 WHERE code='03' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#76513f', hex_source='라벨띠', hex_note='삐아 공식몰 상세', checked=0 WHERE code='04' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#af725d', hex_source='라벨띠', hex_note='삐아 공식몰 상세', checked=0 WHERE code='05' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#8f4e48', hex_source='라벨띠', hex_note='삐아 공식몰 상세', checked=0 WHERE code='07' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#fdeae4', hex_source='라벨띠', hex_note='삐아 공식몰 상세 · 띠가 디자인용 연한 색일 수 있음', checked=0 WHERE code='11' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#fbe5d0', hex_source='라벨띠', hex_note='삐아 공식몰 상세 · 띠가 디자인용 연한 색일 수 있음', checked=0 WHERE code='12' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#d4c0b7', hex_source='라벨띠', hex_note='삐아 공식몰 상세', checked=0 WHERE code='13' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#c7a196', hex_source='라벨띠', hex_note='삐아 공식몰 상세', checked=0 WHERE code='14' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#ffe5d0', hex_source='라벨띠', hex_note='삐아 공식몰 상세 · 눈사진(#503836)과 크게 어긋남', checked=0 WHERE code='15' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#ffded5', hex_source='라벨띠', hex_note='삐아 공식몰 상세 · 띠가 디자인용 연한 색일 수 있음', checked=0 WHERE code='16' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#ab6f6f', hex_source='라벨띠', hex_note='삐아 공식몰 상세', checked=0 WHERE code='20' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#968b87', hex_source='라벨띠', hex_note='삐아 공식몰 상세 · 눈사진(#503633)과 크게 어긋남', checked=0 WHERE code='21' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#ebb29f', hex_source='라벨띠', hex_note='삐아 공식몰 상세', checked=0 WHERE code='22' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#d69da6', hex_source='라벨띠', hex_note='삐아 공식몰 상세', checked=0 WHERE code='24' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
UPDATE shade SET hex='#e7cbbf', hex_source='라벨띠', hex_note='삐아 공식몰 상세', checked=0 WHERE code='25' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아');
