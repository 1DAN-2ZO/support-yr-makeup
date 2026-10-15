-- 얼터너티브스테레오 립 포션 (2026-10-14, 첫 데이터)
--
-- 색은 브랜드 상세페이지의 **입술 발색 사진**에서 뽑았다. 색상칩이 아니다 —
-- 칩은 통 안의 색이고 우리가 읽는 것은 피부(입술) 위에 올라간 색이라 비교가 안 된다.
-- 뽑는 규칙은 본 앱과 똑같이 맞췄다 (ref-colors.ts 의 lip: [40,85] — 밝은 쪽,
-- 입 벌어진 틈과 경계선을 뺀다). 규칙이 다르면 아무리 정밀해도 짝이 안 맞는다.
--
-- 맞게 뽑혔는지는 브랜드가 적어 둔 WARM/NEUTRAL/COOL 표시와 대조해 확인했다:
--   01 WARM    → 색상각 +5.8 (주황 쪽)   ✓
--   02 NEUTRAL → 색상각  0.0            ✓
--   03 COOL    → 색상각 -8.7 (분홍 쪽)   ✓
--   04 NEUTRAL → 색상각 -3.9            ✓

INSERT INTO brand(name) VALUES ('얼터너티브스테레오');

INSERT INTO product(brand_id, part, name, kind, photo, source_url, checked_at)
SELECT id, 'lip', '립 포션',
       '촉촉한 틴트 — 누드부터 로즈까지 음영이 옅게 깔려요',
       NULL,
       NULL,
       '2026-10-14'
FROM brand WHERE name = '얼터너티브스테레오';

INSERT INTO shade(product_id, code, name, family, part, hex, hex_source, hex_note)
SELECT p.id, v.code, v.name, v.family, 'lip', v.hex, '발색사진',
       '브랜드 상세페이지 입술 발색 · 본 앱 lip[40,85] 규칙'
FROM product p
JOIN brand b ON b.id = p.brand_id AND b.name = '얼터너티브스테레오'
JOIN (SELECT '01' code, '밀크 카라멜' name, '브릭'  family, '#c8746b' hex UNION ALL
      SELECT '02',      '바닐라 로즈',      '로즈',  '#cc7171'        UNION ALL
      SELECT '03',      '솔티드 핑크',      '핑크',  '#d25d6e'        UNION ALL
      SELECT '04',      '토피 로즈',        '로즈',  '#c65b62') v
WHERE p.name = '립 포션';
