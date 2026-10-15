-- 클리오 샤프 쏘 심플 워터프루프 펜슬 라이너 — 호수 색 (2026-10-14)
--
-- 출처: 클럽클리오 공식몰 상세 이미지의 **피부 발색 사진** (13색을 팔에 그어 둔 한 장)
--   https://clubclio.co.kr/shop/goodsView/0000003203
--   그림: /data/mall_data/ckeditor/test/9caaa8583b5ea91a87ba4dc8af8b75d6.jpg (1000x23953) 의 y 11420~11710
--
-- **뽑은 규칙**: 본 앱 client/src/core/ref-colors.ts 와 같다. 호수마다 그어진 선 하나를
-- 상자로 감싸고, 그 안 픽셀의 Lab 밝기를 정렬해 liner 구간 [0,10](가장 어두운 10%)만
-- 남긴 뒤 RGB 평균을 냈다. 선 가운데가 뽑히고 둘레 피부는 빠진다.
--
-- **같은 페이지의 색상칩과 대 보았다** (칩은 통 안 색이라 참고용):
--   01 블랙      발색 #615153 ↔ 칩 #000000   ← 칩은 디자인용 순검정
--   02 브라운    발색 #9b5752 ↔ 칩 #51352a
--   03 블랙브라운 발색 #734f4e ↔ 칩 #4c3f39
--   04 다크브라운 발색 #805752 ↔ 칩 #625046 (펄이 섞인 칩이라 평균값)
--   05 애쉬브라운 발색 #945f5a ↔ 칩 #92776c   ← 밝기는 거의 일치
--   10 카카오브라운 발색 #a15e52 ↔ 칩 #9a5d48  ← 밝기는 거의 일치
--
-- **믿기 어려운 점**: 발색 사진이 밝게 보정되어 있다. 상자 안에서 가장 어두운 픽셀이
-- (79,65,65) 라서 "01 블랙" 이 #615153(회보라)로 나온다 — 이름과 말이 안 맞는다.
-- 어두운 쪽 호수(01·03)는 칩보다 많이 밝고, 밝은 쪽(05·10)은 칩과 거의 같다.
-- 어느 쪽이 참인지 가릴 근거가 없어 **checked=0** 으로 둔다.
--
-- 호수 이름: 공식몰은 10호를 "카카오브라운" 으로 적는다. DB 에는 "코코아브라운" 으로
-- 들어와 있어 이름을 손대지 않고 code='010' 으로만 짚었다 — 사람이 확인할 것.

UPDATE shade SET hex='#615153', hex_source='발색사진', hex_note='클럽클리오 공식몰 상세 피부 발색 · liner [0,10] · 칩(#000000)과 크게 어긋남', checked=0 WHERE code='001' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');
UPDATE shade SET hex='#9b5752', hex_source='발색사진', hex_note='클럽클리오 공식몰 상세 피부 발색 · liner [0,10] · 칩 #51352a 보다 밝다', checked=0 WHERE code='002' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');
UPDATE shade SET hex='#734f4e', hex_source='발색사진', hex_note='클럽클리오 공식몰 상세 피부 발색 · liner [0,10] · 칩 #4c3f39 보다 밝다', checked=0 WHERE code='003' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');
UPDATE shade SET hex='#805752', hex_source='발색사진', hex_note='클럽클리오 공식몰 상세 피부 발색 · liner [0,10] · 칩 #625046(펄) 보다 밝다', checked=0 WHERE code='004' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');
UPDATE shade SET hex='#945f5a', hex_source='발색사진', hex_note='클럽클리오 공식몰 상세 피부 발색 · liner [0,10] · 칩 #92776c 과 밝기 비슷', checked=0 WHERE code='005' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');
UPDATE shade SET hex='#a15e52', hex_source='발색사진', hex_note='클럽클리오 공식몰 상세 피부 발색 · liner [0,10] · 칩 #9a5d48 과 거의 같음 · 공식몰 이름은 카카오브라운', checked=0 WHERE code='010' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너');
