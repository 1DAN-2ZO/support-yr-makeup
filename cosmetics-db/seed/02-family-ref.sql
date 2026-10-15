-- 비어 있던 계열의 기준색 (2026-10-14)
--
-- 지어낸 값이 아니다. color-name.ts 의 describeColor 에 **실제로 넣어 보고** 그 계열 이름이
-- 나오는 색만 골랐고, 그중 그 부위에 이미 있는 색들의 밝기·채도 한가운데에 가장 가까운 것이다
-- (tools/ref-candidates.ts). 혼자 튀면 이웃 계열과의 거리가 들쭉날쭉해진다.
--
-- **22개 중 13개만 넣는다.** 나머지 9개는 규칙이 그 이름을 엉뚱한 색에도 붙여서,
-- 규칙대로 고르면 "초코브라운 = 청록색" 같은 값이 나온다. 기준색으로 못 쓴다 —
-- color-name.ts 를 고쳐야 하는 일이라 ② 에게 넘긴다. 아래 "못 넣은 것" 참고.

UPDATE family SET ref_hex='#6c423f' WHERE part='brow'   AND name='로즈브라운';   -- 색상각 28
UPDATE family SET ref_hex='#574e39' WHERE part='brow'   AND name='카키브라운';   -- 90
UPDATE family SET ref_hex='#544548' WHERE part='liner'  AND name='로즈';         -- 5
UPDATE family SET ref_hex='#5a4e48' WHERE part='liner'  AND name='밀크브라운';   -- 54
UPDATE family SET ref_hex='#90817b' WHERE part='liner'  AND name='베이지';       -- 49
UPDATE family SET ref_hex='#30301e' WHERE part='liner'  AND name='카키';         -- 107
UPDATE family SET ref_hex='#332d36' WHERE part='liner'  AND name='플럼';         -- 315
UPDATE family SET ref_hex='#a27e5d' WHERE part='shadow' AND name='골드';         -- 68
UPDATE family SET ref_hex='#ab7875' WHERE part='shadow' AND name='누드핑크';     -- 26
UPDATE family SET ref_hex='#876345' WHERE part='shadow' AND name='카키브라운';   -- 65
UPDATE family SET ref_hex='#bd7e9c' WHERE part='lip'    AND name='모브';         -- 348 (진짜 보랏빛)
UPDATE family SET ref_hex='#bd8751' WHERE part='lip'    AND name='살구';         -- 68
UPDATE family SET ref_hex='#72695a' WHERE part='lip'    AND name='토프';         -- 85

-- 못 넣은 것 9개 — 규칙이 그 이름을 엉뚱한 색에 붙인다 (색상각)
--   brow   초코브라운   #032d2d (197)  청록색
--   liner  코랄         #541b27 (12)   거의 검은 자주 (밝기 19)
--   shadow 차콜         #4e5448 (128)  녹색빛 회색 — 차콜은 무채색이어야
--   shadow 모브         #996966 (27)   주황빛. '모브' 가 조건 없는 '나머지' 칸이라 아무 색이나 떨어진다
--   lip    그레이베이지 #7e8a7b (138)  녹색빛
--   cheek  그레이베이지 #a8ab99 (116)  녹색빛
--   cheek  모브         #de9690 (28)   주황빛 — 위와 같은 '나머지' 문제
--   cheek  브릭         #c6a566 (84)   황토색. 브릭은 붉은 갈색이어야
--   cheek  올리브       #18bacc (212)  하늘색
