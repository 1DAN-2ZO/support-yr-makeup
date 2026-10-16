-- 모렛 뷰파인더 섀도우 팔레트를 **사는 단위로 쪼갠다** (2026-10-14)
--
-- 80-palette-split.sql · 84-peripera-split.sql 과 같은 일이다. 사람이 사는 것은
-- "와인클래스 한 통" 이므로 종류(클래스)마다 한 제품으로 두고, 그 통 안의 칸 6개가 shade 가 된다.
--
-- 종류 이름은 **모렛 공식몰(molette.co.kr) 첫 화면의 상품 이름 그대로**다. 다섯 가지다.
-- 번호를 안 쓰고 클래스 이름으로 파는 브랜드라 번호를 지어 붙이지 않았다.
--
-- **색은 퍼퓸·와인 두 클래스만 넣었다** (92·93번 파일). 와인클래스 상품 페이지
--   https://molette.co.kr/ViewfinderPalette/?idx=51
-- 안에 이 두 클래스의 팔 발색 사진이 같이 실려 있어서다. 티·쿠킹·포엠은 각자의 상품 페이지를
-- 더 봐야 해서 칸 0개로 남긴다.

DELETE FROM shade WHERE product_id = (
  SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
  WHERE b.name='모렛' AND p.name='뷰파인더 섀도우 팔레트');

-- 종류마다 한 제품. kind·사진·출처는 원래 제품 것을 물려받는다
INSERT INTO product(brand_id, part, name, kind, photo, source_url, checked_at)
SELECT p.brand_id, p.part, p.name || ' ' || v.nm, p.kind, p.photo, p.source_url, p.checked_at
FROM product p JOIN brand b ON b.id=p.brand_id AND b.name='모렛'
JOIN (SELECT '퍼퓸클래스' nm UNION ALL
      SELECT '와인클래스'    UNION ALL
      SELECT '티클래스'      UNION ALL
      SELECT '쿠킹클래스'    UNION ALL
      SELECT '포엠클래스') v
WHERE p.name='뷰파인더 섀도우 팔레트';

-- 쪼개고 나면 클래스가 안 붙은 원래 줄은 살 수 없는 물건이라 지운다
DELETE FROM product WHERE id = (
  SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
  WHERE b.name='모렛' AND p.name='뷰파인더 섀도우 팔레트');
