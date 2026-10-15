-- 기준색을 못 뽑은 계열 메꾸기 — **약한 값**임을 밝혀 둔다 (2026-10-15 다시 뽑음)
--
-- ZZ1 은 trust='ok' 호수가 3개 이상인 계열만 기준색을 뽑는다. 호수 하나가 계열을 대표해
-- 버리는 것을 막으려는 규칙이다. 그런데 그 탓에 남는 계열이 생기고,
-- **기준색이 없으면 '가까운 색 채우기' 에서 아예 빠진다** — 그 계열의 제품은 영영 안 나온다.
--
-- 그래서 여기서는 **trust 를 가리지 않고** 가진 호수 전부로 뽑는다. 아래 주석에 호수 수와
-- trust 를 적어 두었다 — 숫자가 작거나 doubt 가 많은 줄은 **믿을 값이 아니다.**
-- 그 계열의 호수를 더 모으면 그 줄을 지우고 ZZ1 에 맡기면 된다.
--
-- doubt = 글리터·조명이 수상한 호수 · dark = 발색 사진이 어두워 보정이 필요한 호수

UPDATE family SET ref_hex='#a97568' WHERE part='brow' AND name='로즈브라운';  -- 호수 1개 (doubt 1)  ⚠ 호수 1개 — 그 호수가 곧 계열색이다
UPDATE family SET ref_hex='#6b5042' WHERE part='brow' AND name='밀크브라운';  -- 호수 2개 (ok 2)
UPDATE family SET ref_hex='#4a3124' WHERE part='brow' AND name='브라운';  -- 호수 1개 (ok 1)  ⚠ 호수 1개 — 그 호수가 곧 계열색이다
UPDATE family SET ref_hex='#29211f' WHERE part='brow' AND name='소프트블랙';  -- 호수 1개 (ok 1)  ⚠ 호수 1개 — 그 호수가 곧 계열색이다
UPDATE family SET ref_hex='#e6bbab' WHERE part='cheek' AND name='피치';  -- 호수 2개 (doubt 2)
UPDATE family SET ref_hex='#1f1e2b' WHERE part='liner' AND name='네이비';  -- 호수 1개 (ok 1)  ⚠ 호수 1개 — 그 호수가 곧 계열색이다
UPDATE family SET ref_hex='#000000' WHERE part='liner' AND name='블랙';  -- 호수 4개 (ok 1 · doubt 3)
UPDATE family SET ref_hex='#ac5c4f' WHERE part='lip' AND name='브릭';  -- 호수 1개 (ok 1)  ⚠ 호수 1개 — 그 호수가 곧 계열색이다
UPDATE family SET ref_hex='#b33139' WHERE part='lip' AND name='체리';  -- 호수 1개 (ok 1)  ⚠ 호수 1개 — 그 호수가 곧 계열색이다
UPDATE family SET ref_hex='#b75866' WHERE part='lip' AND name='플럼';  -- 호수 1개 (dark 1)  ⚠ 호수 1개 — 그 호수가 곧 계열색이다
UPDATE family SET ref_hex='#815857' WHERE part='shadow' AND name='모브';  -- 호수 3개 (ok 1 · doubt 2)
UPDATE family SET ref_hex='#99625f' WHERE part='shadow' AND name='버건디';  -- 호수 3개 (ok 1 · doubt 2)
UPDATE family SET ref_hex='#deb3c3' WHERE part='shadow' AND name='플럼';  -- 호수 1개 (ok 1)  ⚠ 호수 1개 — 그 호수가 곧 계열색이다
