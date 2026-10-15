-- 페리페라 올 테이크 무드 팔레트를 **사는 단위로 쪼갠다** (2026-10-14)
--
-- 80-palette-split.sql 이 클리오에 한 것과 같은 일이다. 사람이 사는 것은
-- "001 한 통" 이므로 종류마다 한 제품으로 두고, 그 통 안의 칸이 shade 가 된다.
--
-- 종류 이름은 **클럽클리오 공식몰의 구매 옵션 목록 그대로**다 (페리페라는 클리오 쪽 몰에서 판다)
--   https://clubclio.co.kr/shop/goodsView/0000005300
-- 번호 표기도 몰에서 쓰는 001~013 을 따랐다. 상세 이미지의 발색 띠는 01~13 으로 적혀 있는데
-- 같은 것이다.
--
-- **색은 001~006 만 넣었다** (85~90 번 파일). 007~013 은 같은 띠에 발색이 있지만
-- 칸 이름을 아직 다 못 읽어서 비워 둔다 — 칸 0개인 제품으로 남는다. 쪼개기 전 클리오 4종과 같은 상태다.

DELETE FROM shade WHERE product_id = (
  SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
  WHERE b.name='페리페라' AND p.name='올 테이크 무드 팔레트');

-- 종류마다 한 제품. kind·사진·출처는 원래 제품 것을 물려받는다
INSERT INTO product(brand_id, part, name, kind, photo, source_url, checked_at)
SELECT p.brand_id, p.part, p.name || ' ' || v.no || ' ' || v.nm, p.kind, p.photo, p.source_url, p.checked_at
FROM product p JOIN brand b ON b.id=p.brand_id AND b.name='페리페라'
JOIN (SELECT '001' no, '봄바람이 부는걸 보니 봄이 왔나봄' nm UNION ALL
      SELECT '002', '봄과 여름의 서사'                      UNION ALL
      SELECT '003', '꽃이라고 불러도 돼?'                   UNION ALL
      SELECT '004', '쿨톤이셔서 그런데 DM 확인 부탁드려요'  UNION ALL
      SELECT '005', '나가을인데!나랑밤먹을래?'              UNION ALL
      SELECT '006', '너는무슨뮤트하겠다는말을여름에하니'    UNION ALL
      SELECT '007', '우리집에복숭아보러갈래?'               UNION ALL
      SELECT '008', '버건디근데이제도화를곁들인'            UNION ALL
      SELECT '009', '야레야레못말리는복숭아'                UNION ALL
      SELECT '010', '그린곳까지가제눈입니다만?'             UNION ALL
      SELECT '011', '방구석청담샵미지근아티스트'            UNION ALL
      SELECT '012', '애교통신 반짝임 감지 가속모드'         UNION ALL
      SELECT '013', '나됐어요!도도폭스됐어요') v
WHERE p.name='올 테이크 무드 팔레트';

-- 쪼개고 나면 종류가 안 붙은 원래 줄은 살 수 없는 물건이라 지운다
DELETE FROM product WHERE id = (
  SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
  WHERE b.name='페리페라' AND p.name='올 테이크 무드 팔레트');
