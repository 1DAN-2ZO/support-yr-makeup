-- 페리페라 올 테이크 무드 팔레트 006 너는무슨뮤트하겠다는말을여름에하니 — 8칸 색 (2026-10-14)
--
-- (01~05 는 85~89 번인데 이것만 92 번이다. 90·91 번을 다른 사람이 먼저 쓰고 있어 비켰다.)
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
  SELECT '1'   code, '복숭아 정과'               name, '베이지'        family, '#edbbba' hex, 'ok'     trust, 'L*80.3 채도19.4' note UNION ALL
  SELECT '2'   code, '나 제법 핑크해요'            name, '베이지'        family, '#e8b5b5' hex, 'ok'     trust, 'L*78.1 채도19.6' note UNION ALL
  SELECT '3'   code, '반짝이는 오간자'             name, '베이지'        family, '#ecbbbc' hex, 'doubt'  trust, 'L*80.1 채도19.0 · 띠에서 반짝임이 보인다' note UNION ALL
  SELECT '4'   code, '오색찬란'                 name, '핑크'         family, '#ebb5bb' hex, 'doubt'  trust, 'L*78.7 채도20.6 · 띠에서 반짝임이 보인다 · 밝기폭 14.0 로 넓다' note UNION ALL
  SELECT '5'   code, '핑크 못 잃어'              name, '핑크'         family, '#de9b9d' hex, 'ok'     trust, 'L*70.4 채도27.2' note UNION ALL
  SELECT '6'   code, '모브였다'                 name, '핑크'         family, '#d5959d' hex, 'ok'     trust, 'L*68.1 채도25.9' note UNION ALL
  SELECT '7'   code, '분위기 있을게'              name, '로즈'         family, '#b9787a' hex, 'ok'     trust, 'L*57.2 채도27.5' note UNION ALL
  SELECT '8'   code, '쫀득한 브라우니'             name, '로즈'         family, '#a56a68' hex, 'doubt'  trust, 'L*51.1 채도25.9 · 밝기폭 12.3 로 넓다' note
) v
WHERE p.name='올 테이크 무드 팔레트 006 너는무슨뮤트하겠다는말을여름에하니';
