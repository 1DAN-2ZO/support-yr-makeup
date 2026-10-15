-- 클리오 프로 아이 팔레트 에어 01 코랄 스튜디오 — 12칸 색 (2026-10-14)
--
-- 출처 주소: https://clubclio.co.kr/shop/goodsView/0000004563 (클럽클리오 공식몰 상품 상세)
--   상세 이미지 05 (01 CORAL STUDIO)
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
  SELECT '1'    code, '누디 베이지'             name, '베이지'        family, '#eabaa6' hex, 'ok'     trust, 'L*79.4 채도22.0 · 매트' note UNION ALL
  SELECT '2'    code, '피치 베이스'             name, '베이지'        family, '#efbba5' hex, 'ok'     trust, 'L*80.0 채도24.3 · 매트' note UNION ALL
  SELECT '3'    code, '세이버 모먼트'            name, '코랄'         family, '#edab93' hex, 'ok'     trust, 'L*75.6 채도30.2 · 매트' note UNION ALL
  SELECT '4'    code, '시크릿 어텐션'            name, '베이지'        family, '#efb8a8' hex, 'doubt'  trust, 'L*79.3 채도23.4 · 글리터 · 펄 많음(밝기폭 13.2)' note UNION ALL
  SELECT '5'    code, '어텀 메이플'             name, '코랄'         family, '#dd9783' hex, 'ok'     trust, 'L*68.8 채도31.8 · 매트' note UNION ALL
  SELECT '6'    code, '로스트 웨이'             name, '골드'         family, '#a7715c' hex, 'ok'     trust, 'L*52.7 채도27.7 · 매트' note UNION ALL
  SELECT '7'    code, '글린트 라이트'            name, '베이지'        family, '#efcec3' hex, 'doubt'  trust, 'L*85.3 채도14.1 · 글리터 · 펄 많음(밝기폭 14.2)' note UNION ALL
  SELECT '8'    code, '트렌치 노트'             name, '베이지'        family, '#dbaa9b' hex, 'ok'     trust, 'L*73.7 채도21.4 · 매트' note UNION ALL
  SELECT '9'    code, '폴링 시즌'              name, '코랄'         family, '#dc9f8c' hex, 'ok'     trust, 'L*70.8 채도27.4 · 매트' note UNION ALL
  SELECT '10'   code, '블렌딩 우드'             name, '코랄'         family, '#c98b7a' hex, 'ok'     trust, 'L*63.6 채도28.3 · 매트' note UNION ALL
  SELECT '11'   code, '뮤트 쉐이드'             name, '베이지'        family, '#dcac99' hex, 'doubt'  trust, 'L*74.2 채도22.3 · 쉬머 · 펄 많음(밝기폭 17.0)' note UNION ALL
  SELECT '12'   code, '웬지 브라운'             name, '딥브라운'       family, '#785144' hex, 'ok'     trust, 'L*38.4 채도20.4 · 매트' note
) v
WHERE p.name='프로 아이 팔레트 에어 1 코랄 스튜디오';
