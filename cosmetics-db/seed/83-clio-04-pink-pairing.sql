-- 클리오 프로 아이 팔레트 에어 04 핑크 페어링 — 12칸 색 (2026-10-14)
--
-- 출처 주소: https://clubclio.co.kr/shop/goodsView/0000004563 (클럽클리오 공식몰 상품 상세)
--   상세 이미지 08 (04 PINK PAIRING)
-- 자료 종류: **피부 발색** — 팔에 12칸을 바르고 칸 이름을 적어 둔 격자 사진.
--   통을 열어 찍은 팬 사진과 색상칩은 쓰지 않았다. 섀도우는 얇게 발려 밑색이 비치므로
--   통 안 색과 피부 위 색이 크게 다르고, 우리가 사용자 사진에서 읽는 것은 피부 위 색이다.
-- 뽑은 규칙: 본 앱 client/src/core/ref-colors.ts 와 같다 —
--   칸마다 70x80~90 네모를 잡아 Lab 밝기(L*)로 정렬하고 **25~75 분위만** 남긴 뒤 RGB 평균.
--   양 끝을 자르는 이유는 펄·글리터의 흰 점과 가장자리 그늘을 빼기 위해서다.
-- 계열: 뽑은 색과 family 표의 shadow 기준색 사이 Lab 거리가 가장 가까운 것으로 정했다.
--   **칸 이름으로 추측하지 않았다.** 기준색은 90-family-ref-from-shades.sql 이 다시 뽑은
--   피부 발색 기준의 값이다 — 그 파일이 들어온 뒤 다시 재서 맞췄다.
-- 믿을 만한 정도: 브랜드가 **쉬머·글리터**라 적은 칸은 반짝이가 색을 끌어올리므로 trust='doubt',
--   매트·매트펄은 'ok'. 분위수로 걸러도 글리터 칸은 밝기폭이 11~19 로 매트(4~9)의 두 배다.

INSERT INTO shade(product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT p.id, v.code, v.name, v.family, 'shadow', v.hex, '발색사진', v.note, v.trust, 0
FROM product p JOIN brand b ON b.id=p.brand_id AND b.name='클리오'
JOIN (
  SELECT '1'    code, '페일 뷰'               name, '베이지'        family, '#eac6c3' hex, 'doubt'  trust, 'L*82.9 채도13.8 · 쉬머 · 펄 많음(밝기폭 8.7)' note UNION ALL
  SELECT '2'    code, '라이트 블레싱'            name, '베이지'        family, '#e6ccc7' hex, 'doubt'  trust, 'L*83.9 채도10.4 · 글리터 · 펄 많음(밝기폭 15.5) · 가장 가까운 계열이어도 ΔE 12.5 로 멀다' note UNION ALL
  SELECT '3'    code, '라벤더 브리즈'            name, '베이지'        family, '#e6b4ac' hex, 'doubt'  trust, 'L*77.4 채도20.2 · 쉬머 · 펄 많음(밝기폭 11.4) · 이름은 라벤더인데 색상각 32 로 보랏빛이 없다' note UNION ALL
  SELECT '4'    code, '스윗 먼데이'             name, '핑크'         family, '#d19894' hex, 'ok'     trust, 'L*68.2 채도23.3 · 매트펄' note UNION ALL
  SELECT '5'    code, '뉴트럴 센스'             name, '누드핑크'       family, '#b68c80' hex, 'ok'     trust, 'L*61.8 채도18.8 · 매트' note UNION ALL
  SELECT '6'    code, '라스트 토크'             name, '딥브라운'       family, '#6b4f48' hex, 'ok'     trust, 'L*36.5 채도13.7 · 매트' note UNION ALL
  SELECT '7'    code, '크레페 피스'             name, '베이지'        family, '#e1bcba' hex, 'ok'     trust, 'L*79.3 채도14.3 · 매트' note UNION ALL
  SELECT '8'    code, '크리미 버디'             name, '핑크'         family, '#e0adaf' hex, 'ok'     trust, 'L*75.4 채도19.9 · 매트' note UNION ALL
  SELECT '9'    code, '투게더 베리'             name, '핑크'         family, '#db9ba2' hex, 'ok'     trust, 'L*70.3 채도25.8 · 매트' note UNION ALL
  SELECT '10'   code, '가든 플레이'             name, '핑크'         family, '#d6979b' hex, 'ok'     trust, 'L*68.7 채도25.3 · 매트' note UNION ALL
  SELECT '11'   code, '브링크 코드'             name, '핑크'         family, '#d09a96' hex, 'ok'     trust, 'L*68.5 채도22.2 · 매트' note UNION ALL
  SELECT '12'   code, '타임 스위치'             name, '딥브라운'       family, '#8d605d' hex, 'ok'     trust, 'L*45.4 채도20.3 · 매트' note
) v
WHERE p.name='프로 아이 팔레트 에어 4 핑크 페어링';
