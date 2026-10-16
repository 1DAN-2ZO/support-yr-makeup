-- 어두운 호수의 색은 못 믿는다 (2026-10-14)
--
-- 브랜드 공식 발색 사진이 **어두운 쪽을 들어올려** 보정돼 있다. 같은 사진 안의 맨 피부를
-- 기준으로 되돌려 보았지만(피부 밝기 194 → 150, 0.77배) 검정은 밝기 86 → 66 까지만 내려간다.
-- 진짜 검정(10~20)과는 멀다. 보정이 '배수' 가 아니라 '어두운 쪽을 더 들어올리는' 방식이라
-- 배수 하나로는 못 되돌린다. 되돌리려면 밝은 기준(피부)과 **어두운 기준(진짜 검정)** 둘이
-- 있어야 하는데 발색 사진에는 검정이 안 찍혀 있다.
--   클리오 001 블랙   #615153 (L* 36)  — 색상칩은 #000000
--   이니스프리 2 블랙 #685757 (L* 39)  — 칩은 #35383d
--
-- **밝은 호수는 보정이 잘 먹는다.** 그래서 L* 50 아래만 표시한다.
-- 같은 사진 안에서 어느 호수가 더 어두운지(차례)는 맞다 — 절대값만 밝다.
--
-- id 를 박아 두는 까닭: SQLite 는 '0x61' 을 숫자로 못 읽어서(CAST 가 0 을 준다) hex 를
-- SQL 안에서 밝기로 바꿀 수가 없다. 실제로 그렇게 썼다가 51개가 전부 표시됐다.
-- 이 파일은 tools 로 다시 만든다 — 손으로 고치지 말 것.


UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 36) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=27;  -- liner 001 블랙
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 37) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=29;  -- liner 003 블랙브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 38) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=22;  -- liner 04 멜로우브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 39) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=42;  -- brow 2 깜깜한 밤하늘 블랙
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 40) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=45;  -- brow 5 깊은 밤 에스프레소 브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 40) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=16;  -- liner 03 로즈브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 41) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=17;  -- liner 07 로즈번
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 41) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=30;  -- liner 004 다크브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 42) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=49;  -- brow 002 다크브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 42) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=48;  -- brow 001 그레이브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 45) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=28;  -- liner 002 브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 46) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=41;  -- brow 1 석양에 핀 로즈 브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 46) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=31;  -- liner 005 애쉬브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 47) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=46;  -- brow 6 동트기 전 어반 브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 47) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=32;  -- liner 010 코코아브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 48) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=44;  -- brow 4 새벽 이슬 애쉬 브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 48) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=50;  -- brow 003 내추럴브라운
UPDATE shade SET hex_note = COALESCE(hex_note,'') || ' / 어두운 호수(L* 50) — 사진 보정으로 실제보다 밝다. 절대값 쓰지 말 것' WHERE id=36;  -- lip 907 젠틀 로즈
