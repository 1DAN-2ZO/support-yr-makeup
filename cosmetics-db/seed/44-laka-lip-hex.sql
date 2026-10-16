-- 라카 퍼펙트 트윈 립 — 호수 색 (2026-10-14)
--
-- 출처: 라카 공식몰 상세 이미지의 **입술에 바른 사진** (호수마다 매트·광택 두 장)
--   https://laka.co.kr/product/new컬러퍼펙트-트윈-립/191/
--   그림: /web/upload/NNEditor/20260921/...트윈립...상세페이지_08.jpg (1000x14032)
--
-- **뽑은 규칙**: 본 앱 client/src/core/ref-colors.ts 와 같다. 왼쪽(매트) 사진의 입술을
-- 상자로 감싸고 Lab 밝기 lip 구간 [40,85](밝은 쪽 — 입 벌어진 틈과 입술선을 뺀다)만
-- 남겨 RGB 평균. 광택 사진은 번들거림이 섞여 쓰지 않았다.
--
-- **맞는지 확인한 방법**: 같은 상세의 "12 shades" 웜/쿨 배치도와 색상각을 대 보았다.
--   902 비지코랄이 가장 웜(색상각 25.3), 907 젠틀로즈가 가장 쿨(14.5),
--   901(22.5) · 904(19.4) 가 그 사이 — 브랜드가 그려 둔 웜/쿨 차례와 맞는다.
--
-- **다만**: 입술 사진에서 뽑은 색에는 그 모델의 입술 밑색이 섞여 있다. 본 앱은 립에
-- 피부 걷어내기(unmixSkin)를 걸지만 여기서는 기준이 될 이마가 사진에 없어 못 걸었다.
-- 그래서 실제 제품보다 연할 수 있다 — **checked=0**.

UPDATE shade SET hex='#e79797', hex_source='발색사진', hex_note='라카 공식몰 상세 입술 사진(매트) · lip [40,85] · 피부 걷어내기 없음', checked=0 WHERE code='901' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='라카' AND p.name='퍼펙트 트윈 립');
UPDATE shade SET hex='#e58280', hex_source='발색사진', hex_note='라카 공식몰 상세 입술 사진(매트) · lip [40,85] · 웜/쿨 배치도와 색상각 일치', checked=0 WHERE code='902' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='라카' AND p.name='퍼펙트 트윈 립');
UPDATE shade SET hex='#d27a7f', hex_source='발색사진', hex_note='라카 공식몰 상세 입술 사진(매트) · lip [40,85] · 피부 걷어내기 없음', checked=0 WHERE code='904' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='라카' AND p.name='퍼펙트 트윈 립');
UPDATE shade SET hex='#b75866', hex_source='발색사진', hex_note='라카 공식몰 상세 입술 사진(매트) · lip [40,85] · 웜/쿨 배치도와 색상각 일치', checked=0 WHERE code='907' AND product_id=(SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='라카' AND p.name='퍼펙트 트윈 립');
