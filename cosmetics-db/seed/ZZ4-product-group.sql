-- 한 제품을 통마다 쪼개 넣은 것들을 **묶어 준다** (2026-10-15)
--
-- 까닭: 팔레트·팟은 "사람이 사는 한 단위" 가 통이라 통마다 제품 한 줄로 넣는다
-- (80-palette-split.sql 이 정한 규칙). 그런데 화면에서 **같은 팔레트가 두 번 떴다** —
-- 전지원이 폰에서 「프로 아이 팔레트 에어 2 로즈 커넥트」와 「4 핑크 페어링」이 나란히
-- 나오는 것을 보고 알렸다.
--
-- 앱은 `brand + name` 으로 중복을 거르는데(product-picks.ts 의 `shown`), 통마다 이름이
-- 달라서 거르개가 안 먹었다. 원래 그 코드 주석이 경고하던 바로 그 일이다 —
-- "두 번 뜨면 「왜 같은 게 두 개지」 가 된다".
--
-- 그래서 통들을 `group_name` 으로 묶는다. 앱은 이 이름으로 중복을 거르고,
-- **어느 통인지는 name 으로 그대로 보여 준다** — 통까지 알려 주는 편이 쓸모 있다.
--
-- 이름을 글자로 잘라 묶지 않고 **여기 손으로 적는다.** 「한올 쉐이드 라이너」와
-- 「한올 아이팟 라이너」처럼 앞이 같아도 다른 제품인 것이 있어서, 자동으로 자르면 잘못 묶인다.

UPDATE product SET group_name = '프로 아이 팔레트 에어'
  WHERE name LIKE '프로 아이 팔레트 에어 %';

UPDATE product SET group_name = '올 테이크 무드 팔레트'
  WHERE name LIKE '올 테이크 무드 팔레트 %';

UPDATE product SET group_name = '무드 잇 팔레트'
  WHERE name LIKE '무드 잇 팔레트 %';

UPDATE product SET group_name = '뷰파인더 섀도우 팔레트'
  WHERE name LIKE '뷰파인더 섀도우 팔레트 %';

UPDATE product SET group_name = '한올 아이팟 라이너'
  WHERE name LIKE '한올 아이팟 라이너 %';
