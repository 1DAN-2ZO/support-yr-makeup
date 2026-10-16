-- 릴리바이레드 무드 잇 팔레트를 **사는 단위로 쪼갠다** (2026-10-14)
--
-- 80·84·93 번 파일과 같은 일이다. 사는 것은 "01 프레쉬잇 한 통" 이므로 종류마다 한 제품으로 둔다.
-- 한 통에 네 칸짜리라 칸이 넷씩 들어올 자리다.
--
-- 종류 이름은 **릴리바이레드 공식몰 상품 상세의 'Color chart' 그림 그대로**다.
--   https://lilybyred.co.kr/product/릴리바이레드-무드-잇-팔레트ad/343/
-- 그림에 "8 COLORS | ODD LAVENDER EDITION — NEW SHADE ADDED" 라 적혀 있고 여덟 통이 그려져 있다.
--
-- **색은 하나도 못 넣었다.** 공식몰 상세에 있는 색 그림이 전부 **통 안 팬을 찍은 것과
-- 가루를 부순 사진**이라서다. 섀도우는 얇게 발려 밑색이 비치므로 통 안 색은 피부 위 색과
-- 비교가 안 된다 — 그래서 쓰지 않았다. 피부 발색 사진을 찾으면 그때 칸이 들어온다.
-- (각 종류마다 눈에 바른 사진은 있지만, 한 칸만 바른 것인지 겹쳐 바른 것인지 구분이 안 되고
--  얼굴 점을 못 잡아 눈꺼풀만 떼어낼 수가 없다.)

DELETE FROM shade WHERE product_id = (
  SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
  WHERE b.name='릴리바이레드' AND p.name='무드 잇 팔레트');

-- 종류마다 한 제품. kind·사진·출처는 원래 제품 것을 물려받는다
INSERT INTO product(brand_id, part, name, kind, photo, source_url, checked_at)
SELECT p.brand_id, p.part, p.name || ' ' || v.no || ' ' || v.nm, p.kind, p.photo, p.source_url, p.checked_at
FROM product p JOIN brand b ON b.id=p.brand_id AND b.name='릴리바이레드'
JOIN (SELECT '01' no, '프레쉬잇' nm UNION ALL
      SELECT '02',    '라이크잇'     UNION ALL
      SELECT '03',    '뉴트럴잇'     UNION ALL
      SELECT '04',    '어텐션잇'     UNION ALL
      SELECT '05',    '체리쉬잇'     UNION ALL
      SELECT '06',    '소프트잇'     UNION ALL
      SELECT '07',    '로맨틱잇'     UNION ALL
      SELECT '08',    '스트레인지잇') v
WHERE p.name='무드 잇 팔레트';

-- 쪼개고 나면 종류가 안 붙은 원래 줄은 살 수 없는 물건이라 지운다
DELETE FROM product WHERE id = (
  SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
  WHERE b.name='릴리바이레드' AND p.name='무드 잇 팔레트');
