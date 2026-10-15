-- 머지 더 퍼스트 슬림 젤 아이라이너 — 호수 체계가 GS → EG 로 바뀌었다 (2026-10-14)
--
-- 전에 넣은 GS1~GS7(블랙 오닉스·브라운 쿼츠·버건디 베릴·모브 로즈·모브 팬시)은
-- 올리브영 A000000119523 "7 colors" 목록에서 온 것인데, **브랜드 쪽 지금 목록은 EG1~EG6** 이다.
-- 전지원이 "머지 더 퍼스트 슬림 젤" 페이지에서 받은 사진으로 확인했다. 리뉴얼로 보인다.
-- 그래서 GS 를 지우고 EG 를 넣는다. 지운 값은 아래에 그대로 적어 두어 되돌릴 수 있다.
--
--   지운 것: GS1 블랙 오닉스 · GS4 브라운 쿼츠 · GS5 버건디 베릴 · GS6 모브 로즈 · GS7 모브 팬시
--            (색은 하나도 없었다 — 발색 자료를 못 찾아 비어 있던 줄들이다)
--
-- 색 출처: 브랜드 상세의 **종이 발색**(흰 바탕에 그은 획). 획에서 바탕보다 뚜렷이 어두운
-- 픽셀만 모아 그중 가장 진한 1/3 의 중앙값을 썼다 — 얇게 그어진 가장자리를 뺀 값이다.
-- **종이 발색이라 피부가 안 섞였고, 어두운 쪽이 안 들렸다.** 지금까지 받은 것 중 가장 깨끗하다.
-- (아이라이너는 불투명해서 피부가 거의 안 비치므로 종이 발색을 써도 된다. 입술·섀도우·볼터치는 안 된다.)
--
-- EG4 는 사진에 없다.

DELETE FROM shade WHERE product_id = (
  SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
  WHERE b.name='머지' AND p.name='더 퍼스트 슬림 젤 아이라이너');

INSERT INTO shade(product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT p.id, v.code, v.name, v.family, 'liner', v.hex, '종이발색', v.note, 'ok', 0
FROM product p JOIN brand b ON b.id=p.brand_id AND b.name='머지'
JOIN (
  SELECT 'EG1' code, '콘테'     name, '소프트블랙' family, '#2e2c2e' hex, '브랜드 종이 발색 · L* 18' note UNION ALL
  SELECT 'EG2',      '체스트넛',      '브라운',      '#463935', '브랜드 종이 발색 · L* 25 — 다크브라운 금(24)에서 1 차이라 아슬아슬' UNION ALL
  -- '마룬' 은 붉은 밤색이라는 뜻인데 규칙은 '브라운' 을 준다. 실제로 재 보니 채도가 10 밖에 안 돼
  -- 붉은 기가 거의 없다 — 이름이 과장된 쪽으로 보인다. 규칙 쪽을 따르되 적어 둔다
  SELECT 'EG3',      '마룬',          '브라운',      '#503d36', '브랜드 종이 발색 · 이름은 붉은 밤색인데 채도 10 으로 붉은 기가 거의 없다' UNION ALL
  SELECT 'EG5',      '딜라잇',        '베이지',      '#ecd8ca', '브랜드 종이 발색 · L* 88' UNION ALL
  -- '피칸' 도 갈색 이름인데 L* 58 이라 밀크브라운 금(55)을 넘겨 베이지가 된다. 금에서 3 차이다
  SELECT 'EG6',      '피칸',          '베이지',      '#a68575', '브랜드 종이 발색 · 이름은 갈색인데 L* 58 로 밀크브라운 금(55)을 3 넘겨 베이지가 됐다'
) v
WHERE p.name='더 퍼스트 슬림 젤 아이라이너';
