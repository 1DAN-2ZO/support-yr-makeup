-- 사진이 없는 제품은 추천에 내보내지 않는다 (2026-10-16 전지원 결정) — 부위 가이드 화장품 칸이 비어 보여서.
-- 페리페라 퓨어 블러시드 선샤인 치크: 공식몰(클리오몰)에서 제품 페이지를 못 찾아 사진을 못 넣었다. 호수 11개와 계열 연결도 같이 뺀다.
-- 사진을 구하면 이 파일을 지우고 ZZ8-product-photo.sql 에 photo 를 적으면 된다 (seed/45-peripera-cheek.sql 의 호수는 그대로 있다).
DELETE FROM shade WHERE product_id IN (SELECT id FROM product WHERE name = '퓨어 블러시드 선샤인 치크');
DELETE FROM product_family WHERE product_id IN (SELECT id FROM product WHERE name = '퓨어 블러시드 선샤인 치크');
DELETE FROM product WHERE name = '퓨어 블러시드 선샤인 치크';
