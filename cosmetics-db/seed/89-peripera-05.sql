-- 페리페라 올 테이크 무드 팔레트 005 나가을인데!나랑밤먹을래? — 8칸 색 (2026-10-14)
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
  SELECT '1'   code, '달콤 조청'                name, '베이지'        family, '#f8d0cb' hex, 'doubt'  trust, 'L*86.6 채도15.2 · 띠에서 반짝임이 보인다 · 밝기폭 12.2 로 넓다' note UNION ALL
  SELECT '2'   code, '호두주의보'                name, '베이지'        family, '#e6b4a3' hex, 'ok'     trust, 'L*77.2 채도22.0' note UNION ALL
  SELECT '3'   code, '음영 과식'                name, '베이지'        family, '#e7b6b2' hex, 'ok'     trust, 'L*78.3 채도19.0' note UNION ALL
  SELECT '4'   code, '가을 종결자'               name, '코랄'         family, '#db9a90' hex, 'ok'     trust, 'L*69.5 채도27.5' note UNION ALL
  SELECT '5'   code, '럭키어텀이잔앙'              name, '베이지'        family, '#ebb2ae' hex, 'doubt'  trust, 'L*77.6 채도22.9 · 띠에서 반짝임이 보인다 · 밝기폭 12.1 로 넓다' note UNION ALL
  SELECT '6'   code, '노릇한 호구마'              name, '코랄'         family, '#ce917e' hex, 'ok'     trust, 'L*65.6 채도28.3' note UNION ALL
  SELECT '7'   code, '왕밤빵왕밤빵'               name, '버건디'        family, '#99625e' hex, 'ok'     trust, 'L*47.4 채도24.8' note UNION ALL
  SELECT '8'   code, '시루시루떡'                name, '버건디'        family, '#8f5d59' hex, 'doubt'  trust, 'L*44.9 채도22.4 · 밝기폭 14.1 로 넓다' note
) v
WHERE p.name='올 테이크 무드 팔레트 005 나가을인데!나랑밤먹을래?';
