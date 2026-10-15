-- 페리페라 올 테이크 무드 팔레트 003 꽃이라고 불러도 돼? — 8칸 색 (2026-10-14)
--
-- 출처 주소: https://clubclio.co.kr/shop/goodsView/0000005300 (클럽클리오 공식몰 · 페리페라 상품 상세)
--   상세 이미지 06 의 맨 아래 'Color Swatch' 띠 — 팔에 종류마다 한 줄로 바르고 칸 번호를 적어 둔 것
-- 자료 종류: **피부 발색**. 통 안 팬 사진과 색상칩은 쓰지 않았다.
-- 뽑은 규칙: 본 앱 client/src/core/ref-colors.ts 와 같다 —
--   칸마다 56x75 네모를 잡아 Lab 밝기(L*)로 정렬하고 **25~75 분위만** 남긴 뒤 RGB 평균.
--   '7+8' 처럼 **두 칸을 섞어 바른 자리는 건너뛰었다** — 그건 칸이 아니다.
-- 계열: 뽑은 색과 family 표의 shadow 기준색 사이 Lab 거리가 가장 가까운 것. 이름으로 추측하지 않았다.
--   기준색은 90-family-ref-from-shades.sql 이 다시 뽑은 피부 발색 기준의 값이다.
-- 믿을 만한 정도: 띠에서 **반짝임이 눈에 보이는 칸**과 **밝기폭이 12 이상인 칸**은 trust='doubt'.
--   클리오 쪽 격자와 달리 이 띠는 칸끼리 붙어 있어 가장자리가 섞인다. 네모를 칸 가운데
--   56px 만 잡아 피했지만, 클리오 값보다 한 단계 무르다고 보는 편이 안전하다.

INSERT INTO shade(product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT p.id, v.code, v.name, v.family, 'shadow', v.hex, '발색사진', v.note, v.trust, 0
FROM product p JOIN brand b ON b.id=p.brand_id AND b.name='페리페라'
JOIN (
  SELECT '1'   code, '봄의 데모곡'               name, '베이지'        family, '#ebc2b4' hex, 'doubt'  trust, 'L*81.6 채도17.4 · 띠에서 반짝임이 보인다' note UNION ALL
  SELECT '2'   code, '꽃되는 꿀팁'               name, '베이지'        family, '#e5b3a5' hex, 'ok'     trust, 'L*76.9 채도21.5' note UNION ALL
  SELECT '3'   code, '튤립아 망고해'              name, '베이지'        family, '#e8b5ae' hex, 'doubt'  trust, 'L*77.9 채도20.4 · 띠에서 반짝임이 보인다' note UNION ALL
  SELECT '4'   code, '봄기운 가득'               name, '베이지'        family, '#e8aba1' hex, 'ok'     trust, 'L*75.4 채도25.1' note UNION ALL
  SELECT '5'   code, '코랄 부심'                name, '코랄'         family, '#eb9d90' hex, 'ok'     trust, 'L*72.1 채도33.1' note UNION ALL
  SELECT '6'   code, '핑존주의'                 name, '코랄'         family, '#e28f8a' hex, 'doubt'  trust, 'L*67.6 채도34.9 · 밝기폭 13.1 로 넓다' note UNION ALL
  SELECT '7'   code, '봄 산책길'                name, '코랄'         family, '#cb8a7a' hex, 'ok'     trust, 'L*63.6 채도29.6' note UNION ALL
  SELECT '8'   code, '생초콜릿'                 name, '브라운'        family, '#96655c' hex, 'doubt'  trust, 'L*47.7 채도22.7 · 밝기폭 12.0 로 넓다' note
) v
WHERE p.name='올 테이크 무드 팔레트 003 꽃이라고 불러도 돼?';
