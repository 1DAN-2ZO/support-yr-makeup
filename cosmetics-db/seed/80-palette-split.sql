-- 팔레트를 **사는 단위로 쪼갠다** (2026-10-14)
--
-- 전에는 "클리오 프로 아이 팔레트 에어" 가 제품 하나이고 팔레트 종류(1 코랄 스튜디오 …)가
-- shade 였다. 그러면 **통 안의 칸 12개를 넣을 자리가 없어** 섀도우가 색 0개로 비어 있었다.
-- 사람이 사는 것은 "3호 한 통" 이므로 종류마다 한 제품으로 둔다. 칸이 shade 가 된다.
--
-- 지금은 **쪼개기만** 한다. 칸 색은 아직 안 모았다 — 모으면 여기에 호수로 들어온다.
-- 20-from-code.sql 이 migrate.py 로 다시 만들어지므로, 그 뒤에 지우고 다시 넣는다.

DELETE FROM shade WHERE product_id = (
  SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
  WHERE b.name='클리오' AND p.name='프로 아이 팔레트 에어');

-- 팔레트 종류마다 한 제품. kind·사진·출처는 원래 제품 것을 물려받는다
INSERT INTO product(brand_id, part, name, kind, photo, source_url, checked_at)
SELECT p.brand_id, p.part, p.name || ' ' || v.no || ' ' || v.nm, p.kind, p.photo, p.source_url, p.checked_at
FROM product p JOIN brand b ON b.id=p.brand_id AND b.name='클리오'
JOIN (SELECT '1' no, '코랄 스튜디오' nm UNION ALL
      SELECT '2',   '로즈 커넥트'      UNION ALL
      SELECT '4',   '핑크 페어링'      UNION ALL
      SELECT '10',  '플럼 플럼 인 시즌') v
WHERE p.name='프로 아이 팔레트 에어';

-- 쪼개고 나면 종류가 안 붙은 원래 줄은 살 수 없는 물건이라 지운다
DELETE FROM product WHERE id = (
  SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
  WHERE b.name='클리오' AND p.name='프로 아이 팔레트 에어');
