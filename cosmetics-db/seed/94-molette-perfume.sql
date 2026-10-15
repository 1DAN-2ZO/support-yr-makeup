-- 모렛 뷰파인더 섀도우 팔레트 퍼퓸클래스 — 6칸 색 (2026-10-14)
--
-- 출처 주소: https://molette.co.kr/ViewfinderPalette/?idx=51 (모렛 공식몰 상품 상세)
--   상세 이미지 05 (여름 데일리 팔레트) 의 팔 발색 사진 — 칸마다 네모로 바르고 그 위에 칸 이름을 적어 두었다
-- 자료 종류: **피부 발색**. 통 안 팬 사진과 색상칩은 쓰지 않았다.
-- 뽑은 규칙: 본 앱 client/src/core/ref-colors.ts 와 같다 —
--   칸마다 네모 **윗부분 60~70px 띠**를 잡아 Lab 밝기(L*)로 정렬하고 25~75 분위만 남긴 뒤 RGB 평균.
--   윗부분만 쓴 까닭은 네모 가운데에 **흰 글씨로 칸 이름이 얹혀 있어서**다. 흰 글씨가 섞이면 색이 밝아진다.
-- 계열: 뽑은 색과 family 표의 shadow 기준색 사이 Lab 거리가 가장 가까운 것. 이름으로 추측하지 않았다.
--   기준색은 90-family-ref-from-shades.sql 이 다시 뽑은 피부 발색 기준의 값이다.
-- 믿을 만한 정도: 여섯 칸 모두 매트로 보이고 밝기폭이 1.5~6.5 로 좁아 trust='ok'.
--   이 브랜드 발색 사진은 지금까지 본 것 중 가장 깨끗하다 — 네모가 떨어져 있고 반짝이가 없다.

INSERT INTO shade(product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT p.id, v.code, v.name, v.family, 'shadow', v.hex, '발색사진', v.note, v.trust, 0
FROM product p JOIN brand b ON b.id=p.brand_id AND b.name='모렛'
JOIN (
  SELECT '1'   code, '잔느'             name, '베이지'        family, '#e5c6cf' hex, 'ok'     trust, 'L*82.6 채도12.4 · 가장 가까운 계열이어도 ΔE 15.2 로 멀다 — shadow 기준색이 모두 중간 밝기라 이만큼 진한 색을 받을 칸이 없다' note UNION ALL
  SELECT '2'   code, '시넨시스'           name, '베이지'        family, '#e0c1c5' hex, 'ok'     trust, 'L*80.8 채도11.7' note UNION ALL
  SELECT '3'   code, '모디파이'           name, '핑크'         family, '#ddb3b8' hex, 'ok'     trust, 'L*76.8 채도16.4' note UNION ALL
  SELECT '4'   code, '라일락 알파'         name, '핑크'         family, '#deb3c3' hex, 'ok'     trust, 'L*77.1 채도18.0' note UNION ALL
  SELECT '5'   code, '스모키 모브'         name, '핑크'         family, '#cc9ca5' hex, 'ok'     trust, 'L*69.0 채도19.5' note UNION ALL
  SELECT '6'   code, '오르간'            name, '로즈'         family, '#ab7579' hex, 'ok'     trust, 'L*54.9 채도22.6' note
) v
WHERE p.name='뷰파인더 섀도우 팔레트 퍼퓸클래스';
