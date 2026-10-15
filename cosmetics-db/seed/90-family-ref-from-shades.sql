-- 계열 기준색을 **모은 호수 색에서 다시 뽑는다** (2026-10-14)
--
-- 왜: 지금 ref_hex 는 48색 팔레트에서 온 **제품 색**인데, 우리가 모은 호수 색과
-- 사용자 사진에서 읽는 색은 둘 다 **피부·입술에 바른 색**이다. 밑색이 섞여 연해지므로
-- 범위 자체가 다르다 — 실제로 재 보니 이만큼 어긋나 있었다:
--     눈썹   기준색 15~44(중앙 33)  vs  모은 색 23~61(중앙 46)
--     볼터치 기준색 60~75(중앙 68)  vs  모은 색 74~86(중앙 80)   거의 안 겹친다
--     섀도우 기준색 41~70(중앙 55)  vs  모은 색 36~85(중앙 71)
--
-- 그래서 호수 61개가 "어느 계열에도 안 붙는다" 로 떨어졌다 (3CE 퍼스트 레터는
-- 핑크 13.8 · 로즈 14.1 로 차이가 0.3 이었다). 통 안 색과 피부 위 색을 견주고 있었던 것이다.
--
-- **호수 3개 이상인 계열만** 다시 뽑는다. 1~2개로 뽑으면 그 호수 하나가 계열을 대표해 버린다.
-- 값은 Lab 에서 중앙값을 잡고 hex 로 되돌린 것이다 (RGB 평균은 어두운 쪽으로 끌린다).
-- trust='ok' 인 호수만 썼다.

UPDATE family SET ref_hex='#e9b3b8' WHERE part='cheek' AND name='모브';  -- 옛값 없음 · 호수 3개
UPDATE family SET ref_hex='#f3acaa' WHERE part='cheek' AND name='코랄';  -- 옛값 #e89477 · 호수 4개
UPDATE family SET ref_hex='#f3c2c4' WHERE part='cheek' AND name='핑크';  -- 옛값 #e08b86 · 호수 4개
UPDATE family SET ref_hex='#ead1c5' WHERE part='liner' AND name='베이지';  -- 옛값 #90817b · 호수 8개
UPDATE family SET ref_hex='#4e3e39' WHERE part='liner' AND name='브라운';  -- 옛값 #53392b · 호수 7개
UPDATE family SET ref_hex='#d46163' WHERE part='lip' AND name='레드';  -- 옛값 #b8504f · 호수 7개
UPDATE family SET ref_hex='#c4696d' WHERE part='lip' AND name='로즈';  -- 옛값 #c96b7e · 호수 7개
UPDATE family SET ref_hex='#e27b72' WHERE part='lip' AND name='코랄';  -- 옛값 #e07a5f · 호수 7개
UPDATE family SET ref_hex='#bb8a7a' WHERE part='shadow' AND name='누드핑크';  -- 옛값 #ab7875 · 호수 3개
UPDATE family SET ref_hex='#76514c' WHERE part='shadow' AND name='딥브라운';  -- 옛값 #7d5f52 · 호수 3개
UPDATE family SET ref_hex='#e8b6a9' WHERE part='shadow' AND name='베이지';  -- 옛값 #c2a68f · 호수 15개
UPDATE family SET ref_hex='#da9888' WHERE part='shadow' AND name='코랄';  -- 옛값 #d08a72 · 호수 11개
UPDATE family SET ref_hex='#da9da0' WHERE part='shadow' AND name='핑크';  -- 옛값 #c98b93 · 호수 17개
