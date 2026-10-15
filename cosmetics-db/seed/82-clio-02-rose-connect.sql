-- 클리오 프로 아이 팔레트 에어 02 로즈 커넥트 — 12칸 색 (2026-10-14)
--
-- 출처 주소: https://clubclio.co.kr/shop/goodsView/0000004563 (클럽클리오 공식몰 상품 상세)
--   상세 이미지 07 (02 ROSE CONNECT)
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
--
-- 6번 칸은 발색 격자에 '어바웃 토프' 로 적혀 있는데, 같은 페이지 눈 발색 칸에는
-- 같은 자리가 'Mood Glowing 무드 글로윙' 이다. **색을 잰 쪽(발색 격자)의 이름을 따랐다.**

INSERT INTO shade(product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT p.id, v.code, v.name, v.family, 'shadow', v.hex, '발색사진', v.note, v.trust, 0
FROM product p JOIN brand b ON b.id=p.brand_id AND b.name='클리오'
JOIN (
  SELECT '1'    code, '데일리 블룸'             name, '베이지'        family, '#e7c4bb' hex, 'doubt'  trust, 'L*81.8 채도14.5 · 쉬머 · 펄 많음(밝기폭 7.7)' note UNION ALL
  SELECT '2'    code, '프렌치 바닐라'            name, '베이지'        family, '#ebc9bf' hex, 'ok'     trust, 'L*83.4 채도14.3 · 매트' note UNION ALL
  SELECT '3'    code, '드리밍 샤워'             name, '베이지'        family, '#e8ada3' hex, 'ok'     trust, 'L*76.0 채도24.2 · 매트' note UNION ALL
  SELECT '4'    code, '저스트 이너프'            name, '코랄'         family, '#d09180' hex, 'ok'     trust, 'L*65.9 채도28.6 · 매트' note UNION ALL
  SELECT '5'    code, '코지 네스트'             name, '베이지'        family, '#ebbbac' hex, 'doubt'  trust, 'L*79.7 채도20.4 · 쉬머 · 펄 많음(밝기폭 13.8)' note UNION ALL
  SELECT '6'    code, '어바웃 토프'             name, '코랄'         family, '#e19990' hex, 'doubt'  trust, "L*70.1 채도30.0 · 쉬머 · 펄 많음(밝기폭 14.9) · 같은 페이지 눈 발색 칸은 이 자리를 '무드 글로윙' 이라 적는다 — 이름이 어긋난다" note UNION ALL
  SELECT '7'    code, '퍼스널 핑크'             name, '베이지'        family, '#e4b3ae' hex, 'ok'     trust, 'L*77.2 채도19.1 · 매트' note UNION ALL
  SELECT '8'    code, '마이트 러브'             name, '핑크'         family, '#dfa099' hex, 'ok'     trust, 'L*71.7 채도25.9 · 매트펄' note UNION ALL
  SELECT '9'    code, '로즈 어페어'             name, '핑크'         family, '#dc9995' hex, 'ok'     trust, 'L*69.4 채도27.4 · 매트' note UNION ALL
  SELECT '10'   code, '머츄어 레터'             name, '누드핑크'       family, '#c27a71' hex, 'ok'     trust, 'L*58.7 채도31.6 · 매트' note UNION ALL
  SELECT '11'   code, '크런치 모카'             name, '카키브라운'      family, '#9e6a59' hex, 'ok'     trust, 'L*49.8 채도26.0 · 매트' note UNION ALL
  SELECT '12'   code, '덴스 나잇'              name, '코랄'         family, '#cc9489' hex, 'doubt'  trust, 'L*66.4 채도24.1 · 글리터 · 펄 많음(밝기폭 18.8)' note
) v
WHERE p.name='프로 아이 팔레트 에어 2 로즈 커넥트';
