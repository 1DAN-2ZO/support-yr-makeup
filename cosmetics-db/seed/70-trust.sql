-- 색을 얼마나 믿는지 (2026-10-14)
--
-- 전에는 hex_note 에 글로 적고 LIKE 로 찾았는데, 글을 조금만 바꿔도 안 걸린다.
-- trust 칸으로 옮긴다. hex_note 의 설명은 그대로 두되 찾을 때는 이 칸을 쓴다.

-- ① 아직 발색 사진에서 온 어두운 호수 — 칩으로 못 바꾼 것들
--    삐아 셋은 라벨띠(=칩)에서 왔지만 밝은 호수에서 눈 사진과 크게 어긋났던 제품이라 그대로 둔다.
--    라카 907 은 립이라 칩을 쓰면 안 된다 (입술은 피부가 비쳐 통 안 색과 비교가 안 된다)
UPDATE shade SET trust='dark' WHERE hex_note LIKE '%어두운 호수%';

-- ② 칩으로 바꿨지만 미심쩍은 것 (교체한 사람이 짚어 준 5개)
--    앞의 넷은 칩이 발색보다 밝거나 거의 안 내려갔다 — 밝은 호수라 보정이 덜 먹었을 수 있다
UPDATE shade SET trust='doubt',
  hex_note = COALESCE(hex_note,'') || ' / 칩이 발색보다 밝거나 거의 안 내려감 — 사람이 볼 것'
WHERE hex_source='색상칩' AND code IN ('005','010','1','4')
  AND product_id IN (SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
                     WHERE b.name IN ('클리오','이니스프리') AND p.part IN ('liner','brow'));

--    페리페라 003 은 더 나쁘다: 머리띠 색이 '11 모카 토프' 와 **완전히 같다**.
--    머리띠가 호수별 색이 아니라 디자인용으로 돌려 쓰인 것으로 보인다
UPDATE shade SET trust='doubt',
  hex_note = COALESCE(hex_note,'') || ' / 머리띠 색이 11 모카 토프와 동일 — 호수별 색이 아닐 수 있음'
WHERE hex_source='색상칩' AND code='003'
  AND product_id IN (SELECT p.id FROM product p JOIN brand b ON b.id=p.brand_id
                     WHERE b.name='페리페라' AND p.part='brow');
