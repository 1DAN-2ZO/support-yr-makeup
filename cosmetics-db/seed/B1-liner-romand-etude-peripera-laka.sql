-- 아이라이너 호수와 색 — 롬앤 · 에뛰드 (2026-10-15)
--
-- 맡은 브랜드는 롬앤 · 에뛰드 · 페리페라 · 라카 넷이었는데, **자료를 찾은 둘만** 넣었다.
-- 페리페라와 라카는 한 호수도 안 넣었다 (까닭은 아래 ④).
--
-- ───────────────────────────────────────────────────────────────────────────
-- ① 색을 어디서 읽었나 — **피부 발색 사진을 안 썼다**
--
-- 라이너는 불투명하게 덮는 제품이라 피부색이 안 비친다. 게다가 브랜드 발색 사진은 어두운 색의
-- 그림자를 비선형으로 들어 올려서 검정이 회갈색으로 읽힌다 (41-clio-liner-hex.sql 에서 겪은 일:
-- '01 블랙' 이 #615153 으로 나왔다). 그래서 **색상칩과 흰 종이에 그은 획**만 썼다.
--
-- 실제로 롬앤 쉐이드 라이너는 같은 상세 그림 안에 팔에 그은 발색 띠가 **있는데도 안 썼다.**
-- 같은 페이지에 색상칩(Color Swatch)이 있어서 그 쪽이 낫다고 보았다.
--
-- 뽑는 규칙은 둘로 갈린다.
--   ⑴ 색상칩 — 칸 한가운데에 **20x20 패치를 잡아 RGB 채널별 중앙값**. 글씨·딱지가 겹친 자리는
--      피했다 (칩 가운데에 흰 글씨가 있어 왼쪽 1/4 쯤에서 읽은 것이 있다).
--   ⑵ 종이 발색(흰 종이 획) — 획은 20x20 보다 가늘어 패치를 잡으면 흰 종이가 섞인다. 그래서
--      **바탕보다 또렷이 어두운 픽셀만 모으고 그중 가장 어두운 10% 의 RGB 평균**을 썼다.
--      앱 client/src/core/ref-colors.ts 의 liner 구간 [0,10] 과 같은 규칙이고,
--      47-wakemake-liner.sql 이 쓴 것과 같다. hex_note 에 상자 자리를 적어 두었다.
--
-- ② 값이 흔들리는지 확인했다
--   색상칩 24칸은 패치를 20→40 으로 키우거나 자리를 ±60px 옮겨도 Lab 거리가 최대 3.8 이었다
--   (대부분 1 미만). 칩에 결 무늬가 입혀져 있어 한 점으로 읽으면 안 되고 중앙값이 꼭 필요했다.
--   종이 획은 '가장 어두운 몇 %' 를 2→30% 로 바꾸면 L* 가 8~16 움직인다. 10% 를 쓴 것은
--   이 디비의 기존 규칙을 따른 것일 뿐이고, 절대값보다 **호수끼리의 차례**를 믿는 쪽이 낫다.
--
-- ③ 아이팟 라이너를 **6개 제품으로 쪼갰다**
--   롬앤 한올 아이팟 라이너는 공식몰 옵션이 팟 6종이고, 한 팟 안에 칸이 4개다(24색).
--   schema.sql 과 80-palette-split.sql 이 정한 대로 **사람이 사는 한 단위(팟 하나)를 제품**으로 두고
--   칸을 호수로 넣었다. 팔레트를 쪼갠 것과 같은 결정이다.
--   덕분에 liner 제품이 4 → 15 개가 된다 (계열당 제품 수를 늘리는 것이 이 일의 목적이었다).
--
-- ④ 못 넣은 브랜드 — **단종이라고 적지 않는다. 확인을 못 했다**
--   페리페라 — 제품은 있는 것으로 보인다. 웹 검색에 '잉크 씬씬 펜슬 라이너'·'잉크 씬 브러쉬 라이너'
--     가 해외 판매처 이름으로 나온다. 그런데 **색을 읽을 사진을 못 구했다.**
--       · peripera.co.kr · www.peripera.co.kr · peripera.com — 모두 연결 자체가 안 된다(타임아웃).
--       · 클럽클리오(clubclio.co.kr) — 페리페라 제품이 같이 올라오는 곳이다. 사이트맵 319개를
--         모두 열어 이름을 뽑았다. 그중 **판매중인 것은 58개뿐**이고(나머지 261개는
--         "판매중지된 상품입니다" 알림만 돌아온다), 그 58개에 페리페라는 잉크 더 벨벳 ·
--         잉크 더 에어리 벨벳 · 잉크 무드 글로이 틴트 · 워터 베어 틴트 · 맑게 물든 선샤인 치크 ·
--         스피디 스키니 브로우가 있을 뿐 **아이라이너는 하나도 없다.** 라이너 7개는 전부 클리오다.
--       · 해외 판매처 두 곳은 쪽이 사라졌거나(peachesandcremeshop 404) 봇 차단에 걸렸다
--         (sukoshimart — Cloudflare 403). **차단을 우회하지 않았다.**
--     => 공식몰이 열리면 가장 먼저 할 일이다. 지금 자료로는 단종인지 아닌지 가릴 수 없다.
--   라카 — **공식몰에 아이라이너 제품 자체가 없다.** laka.co.kr 사이트맵 63개와 eye 분류(79번)를
--     다 보았는데 눈 제품은 픽시 브로우 카라 · 모노 아이섀도우 · 포에버 6 아이 팔레트 셋뿐이다.
--     이름에 '라이너' 가 붙은 것은 **립 라이너**(194번)뿐이라 부위가 다르다.
--     옛날에 아이라이너가 있었는지는 확인 못 했다.
--
-- ⑤ 계열(family) 은 아무 이름이나 넣은 것이다
--   맨 뒤에 도는 ZZ1-family-from-app-name.sql 이 앱 함수로 전부 덮어쓴다. 다만 family 가
--   NOT NULL 이고 외래키라 빌드가 깨지지 않게 **쓰는 이름을 여기서 먼저 만들어 둔다**
--   (A1-cheek-… 와 같은 방법). 새 이름은 만들지 않았고 전부 01-family.sql 에 이미 있는 것이다.
--
-- ⑥ 다음 사람에게
--   · 롬앤은 **상세 그림 안에 색상칩이 꼭 있다.** 쉐이드 라이너는 'Color Swatch' 띠,
--     아이팟은 팟마다 4칸 띠다. 둘 다 평평해서 읽기 좋다. 다만 칩에 결 무늬가 깔려 있다.
--   · 에뛰드 공식몰(etude.com)은 워드프레스라 상품 쪽에는 통 사진밖에 없다. 색은
--     **상세페이지 그림이 따로 올라가 있는 kinxzone 주소**(191981945491ece1.kinxzone.com)에 있다.
--     html 에서 그 주소를 긁어 쓰면 된다. 'colors' 칸에 호수 이름과 획이 나란히 있다.
--   · 클럽클리오 사이트맵은 **판매중지된 상품이 8할**이다. 이름을 뽑으려면 og:title 을 보면 되고,
--     판매중지면 본문 대신 alert 한 줄만 온다.
-- ───────────────────────────────────────────────────────────────────────────

-- 번호는 3000 번대부터 쓴다 (이 파일을 쓸 때 쓰이던 번호: brand 2002 · product 2005 · shade 2078)
-- 롬앤(4) · 에뛰드(9) 는 brand 표에 이미 있어 새 브랜드는 안 만든다.

-- 이 파일이 쓰는 계열을 먼저 만들어 둔다 (⑤ 참고). 전부 이미 있는 이름이라 IGNORE 로 지나간다
INSERT OR IGNORE INTO family(part, name) VALUES
  ('liner','블랙'), ('liner','소프트블랙'), ('liner','그레이'), ('liner','브라운'),
  ('liner','밀크브라운'), ('liner','베이지'), ('liner','로즈'), ('liner','코랄');


-- ═══════════════════════════════════════════════════════════════════════════
-- 롬앤 한올 쉐이드 라이너 — 7호수
--
-- 출처: 공식몰 상품 상세의 **'Color Swatch' 색상칩 띠**
--   https://romand.co.kr/product/롬앤-한올-쉐이드-라이너/635/
--   그림 .../web/upload/NNEditor/20220829/한올 쉐이드 라이너 01.jpg (900x14088)
--   띠는 y 9952~9995 에 있고 칸 경계는 x 126·219·312·404·496·588·682·775 이다.
--   칸 가운데에 흰 글씨(01…07)가 있어 **칸 왼쪽 1/4 쯤(가운데에서 왼쪽으로 30px)** 에서 읽었다.
--   패치 안 표준편차가 0.0 이라 글씨가 안 섞인 것이 확인된다.
--
-- **같은 쪽의 다른 색상칩과 대 보았다**: 호수마다 있는 설명 칸 왼쪽에 동그라미 칩이 또 있다
--   (x=576, y=10367·10899·11451·12002·12551·13106·13674). 01·04·06·07 은 띠와 **완전히 같은 값**,
--   02 는 Lab 거리 3, 03 은 6.9, 05 는 4.1 만큼 어긋난다. 어긋나는 셋은 hex_note 에 둘 다 적었다.
--
-- **피부 발색 띠는 일부러 안 썼다**: 같은 그림 y 6400 쯤에 팔에 7호수를 그은 띠가 있다.
--   라이너라 피부색이 섞이면 안 되고, 어두운 쪽이 들릴 위험도 있어 색상칩을 골랐다.
INSERT INTO product(id, brand_id, part, name, kind, source_url, checked_at)
SELECT 3001, b.id, 'liner', '한올 쉐이드 라이너', '펜슬 — 그림자 같은 음영색이라 선이 세게 안 보여요',
       'https://romand.co.kr/product/롬앤-한올-쉐이드-라이너/635/', '2026-10-15'
FROM brand b WHERE b.name='롬앤';

INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 3001, v.code, v.name, v.family, 'liner', v.hex, '색상칩:romand.co.kr', v.note, v.trust, 0
FROM (
  SELECT 3001 id, '01' code, '에보니 토프' name, '그레이' family, '#504a4a' hex, 'ok' trust,
         '한올 쉐이드 라이너 01.jpg · Color Swatch 띠 패치 중앙값 20x20 (x=142,y=9973) · L*32.0 a*2.5 b*0.9 · 같은 쪽 동그라미 칩(x576,y10367)도 #504a4a 로 같다' note UNION ALL
  SELECT 3002, '02', '뮤티드 브라운', '브라운', '#69554e', 'ok',
         '한올 쉐이드 라이너 01.jpg · Color Swatch 띠 패치 중앙값 20x20 (x=235,y=9973) · L*37.9 C10.1 h45.5 · 동그라미 칩(y10899)은 #614e48 로 Lab 거리 3.0' UNION ALL
  SELECT 3003, '03', '헤이즐 마룬', '브라운', '#7d6a5b', 'doubt',
         '한올 쉐이드 라이너 01.jpg · Color Swatch 띠 패치 중앙값 20x20 (x=328,y=9973) · L*46.2 C12.3 h65.8 · **같은 쪽 동그라미 칩(y11451)은 #7b614a (b* 11.2 → 17.1) 로 Lab 거리 6.9 만큼 어긋난다** · 어느 쪽이 맞는지 못 가려 doubt' UNION ALL
  SELECT 3004, '04', '코티드 로지', '로즈', '#a46c6f', 'ok',
         '한올 쉐이드 라이너 01.jpg · Color Swatch 띠 패치 중앙값 20x20 (x=420,y=9973) · L*51.6 C24.0 h18.3 · 동그라미 칩(y12002)도 #a46c6f 로 같다' UNION ALL
  SELECT 3005, '05', '쉐이드 베이지', '베이지', '#bc9880', 'doubt',
         '한올 쉐이드 라이너 01.jpg · Color Swatch 띠 패치 중앙값 20x20 (x=512,y=9973) · L*65.5 C20.3 h60.7 · 동그라미 칩(y12551)은 #c7a38b 로 Lab 거리 4.1 · **06 페이드 애쉬와 Lab 거리가 3.5 밖에 안 되어 둘을 가릴 수 없다** → doubt' UNION ALL
  SELECT 3006, '06', '페이드 애쉬', '베이지', '#b2937e', 'doubt',
         '한올 쉐이드 라이너 01.jpg · Color Swatch 띠 패치 중앙값 20x20 (x=604,y=9973) · L*63.2 C17.6 h61.4 · 동그라미 칩(y13106)도 #b2937e 로 같다 · **이름은 애쉬(찬색)인데 색상각 61 의 따뜻한 베이지로 읽히고, 05 와 Lab 거리가 3.5 뿐이다** → doubt' UNION ALL
  SELECT 3007, '07', '크리미 베이지', '베이지', '#f5e5d6', 'ok',
         '한올 쉐이드 라이너 01.jpg · Color Swatch 띠 패치 중앙값 20x20 (x=698,y=9973) · L*91.8 C9.7 h72.1 · 동그라미 칩(y13674)도 #f5e5d6 로 같다'
) v;


-- ═══════════════════════════════════════════════════════════════════════════
-- 롬앤 한올 아이팟 라이너 — 팟 6개 × 칸 4개 = 24호수
--
-- 출처: 공식몰 상품 상세의 **팟마다 있는 4칸 색상칩 띠**
--   https://romand.co.kr/product/롬앤-한올-아이팟-라이너/1032/
--   그림 .../web/upload/NNEditor/20260410/…한올 아이팟 라이너 컬러추가-N.jpg (모두 900px 너비)
--   네 칸의 가로 자리는 여섯 띠가 모두 같다: x 109-264 · 285-440 · 461-616 · 637-791.
--   칸 가운데 아래쪽에 흰 글씨(칸 이름)가 있어 **글씨 위쪽**에서 읽었다.
--   칸 중심 x 는 186 · 362 · 538 · 714 를 썼다.
--
-- **칩에 결 무늬(종이결 같은 질감)가 입혀져 있다.** 한 점으로 읽으면 안 되고 20x20 중앙값이
--   꼭 필요하다. 패치를 40x40 으로 키우거나 자리를 ±60px 옮겨 봤을 때 Lab 거리는 최대 3.8,
--   대부분 1 미만이었다. 24칸 모두 확인했다.
--
-- **칸 번호**: 공식 호수 번호는 팟에만 붙고 칸에는 안 붙는다. 팟 사진에 찍힌 1~4 를 code 로 썼다.
INSERT INTO product(id, brand_id, part, name, kind, source_url, checked_at)
SELECT v.id, b.id, 'liner', v.name, '젤 팟 — 한 통에 칸 4개라 음영까지 같이 돼요',
       'https://romand.co.kr/product/롬앤-한올-아이팟-라이너/1032/', '2026-10-15'
FROM brand b, (
  SELECT 3002 id, '한올 아이팟 라이너 01 브라운 토프 팟' name UNION ALL
  SELECT 3003, '한올 아이팟 라이너 02 더스티 로즈 팟' UNION ALL
  SELECT 3004, '한올 아이팟 라이너 03 피오니 크림 팟' UNION ALL
  SELECT 3005, '한올 아이팟 라이너 04 카라멜 브라운 팟' UNION ALL
  SELECT 3006, '한올 아이팟 라이너 05 그레이 핑크 팟' UNION ALL
  SELECT 3007, '한올 아이팟 라이너 06 번트 코랄 팟'
) v WHERE b.name='롬앤';

-- 01 브라운 토프 팟 — 그림 …컬러추가-6.jpg (900x8318) 의 띠 y 1215~1512, 읽은 줄 y=1280
INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 3002, v.code, v.name, v.family, 'liner', v.hex, '색상칩:romand.co.kr', v.note, 'ok', 0
FROM (
  SELECT 3011 id, '1' code, '크림 볼류머' name, '베이지' family, '#deb19b' hex,
         '한올 아이팟 라이너 컬러추가-6.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=186,y=1280) · L*75.7 C21.9 h52.9' note UNION ALL
  SELECT 3012, '2', '카멜 쉐이드', '밀크브라운', '#a57762',
         '한올 아이팟 라이너 컬러추가-6.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=362,y=1280) · L*54.1 C24.1 h50.8' UNION ALL
  SELECT 3013, '3', '코코아 블렌딩', '브라운', '#77594e',
         '한올 아이팟 라이너 컬러추가-6.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=538,y=1280) · L*40.6 C15.4 h46.3' UNION ALL
  SELECT 3014, '4', '모카 쉐입', '브라운', '#59463f',
         '한올 아이팟 라이너 컬러추가-6.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=714,y=1280) · L*31.5 C10.1 h46.5'
) v;

-- 02 더스티 로즈 팟 — 그림 …컬러추가-7.jpg (900x16535) 의 띠 y 1309~1601, 읽은 줄 y=1374
INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 3003, v.code, v.name, v.family, 'liner', v.hex, '색상칩:romand.co.kr', v.note, 'ok', 0
FROM (
  SELECT 3015 id, '1' code, '페일 볼류머' name, '로즈' family, '#e7bfc1' hex,
         '한올 아이팟 라이너 컬러추가-7.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=186,y=1374) · L*80.8 C15.2 h16.6' note UNION ALL
  SELECT 3016, '2', '로지 쉐이드', '로즈', '#d29a9b',
         '한올 아이팟 라이너 컬러추가-7.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=362,y=1374) · L*68.9 C22.4 h20.1' UNION ALL
  SELECT 3017, '3', '로즈 블렌딩', '로즈', '#b17f82',
         '한올 아이팟 라이너 컬러추가-7.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=538,y=1374) · L*58.2 C20.7 h17.0' UNION ALL
  SELECT 3018, '4', '딥 플럼 쉐입', '그레이', '#524346',
         '한올 아이팟 라이너 컬러추가-7.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=714,y=1374) · L*30.0 C7.0 h4.9'
) v;

-- 03 피오니 크림 팟 — 그림 …컬러추가-7.jpg 의 띠 y 9739~10031, 읽은 줄 y=9804
INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 3004, v.code, v.name, v.family, 'liner', v.hex, '색상칩:romand.co.kr', v.note, 'ok', 0
FROM (
  SELECT 3019 id, '1' code, '바닐라 볼류머' name, '베이지' family, '#edbfb0' hex,
         '한올 아이팟 라이너 컬러추가-7.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=186,y=9804) · L*81.0 C19.9 h44.0' note UNION ALL
  SELECT 3020, '2', '피오니 쉐이드', '코랄', '#f3b5ab',
         '한올 아이팟 라이너 컬러추가-7.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=362,y=9804) · L*79.1 C25.3 h33.3' UNION ALL
  SELECT 3021, '3', '코랄 블렌딩', '코랄', '#e0a095',
         '한올 아이팟 라이너 컬러추가-7.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=538,y=9804) · L*71.7 C27.0 h34.2' UNION ALL
  SELECT 3022, '4', '멜로우 쉐입', '밀크브라운', '#96736a',
         '한올 아이팟 라이너 컬러추가-7.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=714,y=9804) · L*51.6 C16.1 h39.7'
) v;

-- 04 카라멜 브라운 팟 — 그림 …컬러추가-4.jpg (900x16503) 의 띠 y 1298~1595, 읽은 줄 y=1363
INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 3005, v.code, v.name, v.family, 'liner', v.hex, '색상칩:romand.co.kr', v.note, 'ok', 0
FROM (
  SELECT 3023 id, '1' code, '캐슈 볼류머' name, '밀크브라운' family, '#cf9571' hex,
         '한올 아이팟 라이너 컬러추가-4.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=186,y=1363) · L*66.5 C32.7 h57.7' note UNION ALL
  SELECT 3024, '2', '월넛 쉐이드', '밀크브라운', '#bf7f5c',
         '한올 아이팟 라이너 컬러추가-4.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=362,y=1363) · L*59.0 C35.8 h54.3' UNION ALL
  SELECT 3025, '3', '초콜릿 블렌딩', '브라운', '#7c4d39',
         '한올 아이팟 라이너 컬러추가-4.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=538,y=1363) · L*37.6 C26.7 h48.9' UNION ALL
  SELECT 3026, '4', '다크 쉐입', '블랙', '#241b1c',
         '한올 아이팟 라이너 컬러추가-4.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=714,y=1363) · L*10.9 C4.7 · 이 디비에서 가장 어두운 라이너 값 가운데 하나다 — 색상칩인데도 들려 있지 않다'
) v;

-- 05 그레이 핑크 팟 — 그림 …컬러추가-4.jpg 의 띠 y 9710~10002, 읽은 줄 y=9775
INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 3006, v.code, v.name, v.family, 'liner', v.hex, '색상칩:romand.co.kr', v.note, 'ok', 0
FROM (
  SELECT 3027 id, '1' code, '무드 볼류머' name, '로즈' family, '#e4a2ab' hex,
         '한올 아이팟 라이너 컬러추가-4.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=186,y=9775) · L*73.1 C26.2 h11.3' note UNION ALL
  SELECT 3028, '2', '핑크 쉐이드', '로즈', '#dd8f99',
         '한올 아이팟 라이너 컬러추가-4.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=362,y=9775) · L*67.5 C31.6 h12.9' UNION ALL
  SELECT 3029, '3', '모브 블렌딩', '로즈', '#744150',
         '한올 아이팟 라이너 컬러추가-4.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=538,y=9775) · L*34.1 C24.1 h1.6' UNION ALL
  SELECT 3030, '4', '딥 네이비 쉐입', '블랙', '#1f1e2b',
         '한올 아이팟 라이너 컬러추가-4.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=714,y=9775) · L*11.9 b*-8.5 · 이 디비에서 유일하게 푸른 쪽으로 치우친 라이너다'
) v;

-- 06 번트 코랄 팟 — 그림 …컬러추가-5.jpg (900x8735) 의 띠 y 1637~1929, 읽은 줄 y=1702
INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 3007, v.code, v.name, v.family, 'liner', v.hex, '색상칩:romand.co.kr', v.note, 'ok', 0
FROM (
  SELECT 3031 id, '1' code, '페블 볼류머' name, '코랄' family, '#f8a695' hex,
         '한올 아이팟 라이너 컬러추가-5.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=186,y=1702) · L*75.7 C35.3 h36.8' note UNION ALL
  SELECT 3032, '2', '살몬 쉐이드', '코랄', '#f78e81',
         '한올 아이팟 라이너 컬러추가-5.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=362,y=1702) · L*70.0 C45.4 h32.4 · 24칸 가운데 가장 선명하다' UNION ALL
  SELECT 3033, '3', '휘그 블렌딩', '코랄', '#8f5349',
         '한올 아이팟 라이너 컬러추가-5.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=538,y=1702) · L*42.0 C29.1 h34.9' UNION ALL
  SELECT 3034, '4', '시나몬 쉐입', '브라운', '#431c11',
         '한올 아이팟 라이너 컬러추가-5.jpg · 4칸 색상칩 띠 패치 중앙값 20x20 (x=714,y=1702) · L*15.8 C24.0 h42.1'
) v;


-- ═══════════════════════════════════════════════════════════════════════════
-- 에뛰드 — 라이너 4제품 9호수
--
-- 공식몰 etude.com 은 워드프레스라 상품 쪽에 통 사진밖에 없다. 색은 **상세페이지 그림**이
-- 따로 올라간 주소(191981945491ece1.kinxzone.com/webcatalogue/…)와 상품 사진 몇 장에 있고,
-- 거기 'colors' 칸에 호수 이름과 **흰 종이에 그은 획**이 나란히 있다. 그 획에서 읽었다.
--
-- 읽는 규칙(네 제품 공통): 상자 안에서 바탕(흰 종이, L*100)보다 L* 로 20 넘게 어두운 픽셀만
-- 모으고, 그중 가장 어두운 10% 의 RGB 평균. hex_note 에 상자를 (x0,y0,x1,y1) 로 적어 두었다.
-- '가장 어두운 몇 %' 를 2~30% 로 바꾸면 L* 가 8~16 움직인다 — 절대값보다 차례를 믿을 것.

INSERT INTO product(id, brand_id, part, name, kind, source_url, checked_at)
SELECT v.id, b.id, 'liner', v.name, v.kind, v.url, '2026-10-15'
FROM brand b, (
  SELECT 3008 id, '2X 쌩얼 라이너' name, '펜 라이너 — 묽게 비쳐서 그린 티가 덜 나요' kind,
         'https://www.etude.com/shop/category/eye/2x-쌩얼-라이너-0-5g/' url UNION ALL
  SELECT 3009, '드로잉쇼 브러쉬 라이너', '붓펜 — 획이 굵게도 가늘게도 나와요',
         'https://www.etude.com/shop/category/eye/드로잉쇼-브러쉬-라이너-0-6g/' UNION ALL
  SELECT 3010, '라인 픽스 브러쉬 라이너', '붓펜 — 잘 안 번지는 쪽이에요',
         'https://www.etude.com/shop/category/eye/라인-픽스-브러쉬-라이너-0-5g/' UNION ALL
  SELECT 3011, '반짝 눈물 라이너', '글리터 라이너 — 눈물 모양 반짝이를 얹는 용이에요',
         'https://www.etude.com/shop/category/eye/반짝-눈물-라이너-8g/'
) v WHERE b.name='에뛰드';

-- 2X 쌩얼 라이너 — 2호수
-- 그림 http://191981945491ece1.kinxzone.com/webcatalogue/2022/07/2X_eyeliner/img/2X_eyeliner_04.jpg (1000x2005)
-- 'colors' 칸에 호수 이름 바로 옆에 획이 있어 **어느 획이 어느 호수인지 적혀 있다**.
-- (상품 사진 쪽에도 획이 있지만 두 호수가 한 장에 섞여 있어 가릴 수 없다 — 그 쪽은 안 썼다.)
INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 3008, v.code, v.name, v.family, 'liner', v.hex, '종이발색:etude.com', v.note, v.trust, 0
FROM (
  SELECT 3035 id, '1' code, '소프트 딥 브라운' name, '브라운' family, '#817164' hex, 'ok' trust,
         '2X_eyeliner_04.jpg colors 칸 흰 종이 획 (상자 100,780,420,1000) · 가장 어두운 10% 평균 · L*48.8 C10.3 h67.1 · 2%~30% 로 바꾸면 L* 44.3~52.7 · 이름은 딥 브라운인데 꽤 밝게 읽힌다 — 묽게 비치는 틴팅 제형이라 그런 것으로 보이나 확인은 못 했다' note UNION ALL
  SELECT 3036, '2', '내추럴 라이트 브라운', '밀크브라운', '#a28974', 'ok',
         '2X_eyeliner_04.jpg colors 칸 흰 종이 획 (상자 100,1430,420,1650) · 가장 어두운 10% 평균 · L*58.8 C16.0 h67.3 · 2%~30% 로 바꾸면 L* 54.6~62.4 · 1호보다 L* 가 10 밝아 이름 차례와 맞는다'
) v;

-- 드로잉쇼 브러쉬 라이너 — 2호수
-- 그림 http://191981945491ece1.kinxzone.com/webcatalogue/2012/04/drawing/images/brush_img3.jpg (1000x3896)
-- 'Colors' 칸에 호수 이름(흑심블랙 BK801 / 앙심브라운 BR401)과 흰 종이 획이 짝지어 있다.
INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 3009, v.code, v.name, v.family, 'liner', v.hex, '종이발색:etude.com', v.note, v.trust, 0
FROM (
  SELECT 3037 id, 'BK801' code, '흑심 블랙' name, '블랙' family, '#202020' hex, 'ok' trust,
         'brush_img3.jpg Colors 칸 흰 종이 획 (상자 40,760,320,850) · 가장 어두운 10% 평균 · L*12.3 C0.0 · 획이 굵어 흰 바탕이 거의 안 섞였다 · 2%~30% 로 바꾸면 L* 5.9~15.6' note UNION ALL
  SELECT 3038, 'BR401', '앙심 브라운', '브라운', '#533a30', 'doubt',
         'brush_img3.jpg Colors 칸 흰 종이 획 (상자 40,1440,350,1560) · 가장 어두운 10% 평균 · L*27.0 C14.3 h47.9 · **획에 펄(반짝이)이 또렷하게 섞여 있다** · 가장 어두운 10% 를 써서 반짝이 하이라이트는 뺐지만 바탕색이 이 값이 맞는지 못 가린다 → doubt'
) v;

-- 라인 픽스 브러쉬 라이너 — 2호수
-- 그림: 공식몰 상품 쪽에 **호수마다 한 장씩** 올라와 있다 (획이 흰 바탕에 혼자 있어 가장 깨끗하다)
--   블랙  https://www.etude.com/wp-content/uploads/2023/06/651000232.png (1000x1000)
--   브라운 https://www.etude.com/wp-content/uploads/2023/06/651000233.png (1000x1000)
-- 공식몰 옵션 이름이 '# 블랙' · '#브라운' 이라 호수 번호가 없다. code 는 비워 둔다.
INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 3010, NULL, v.name, v.family, 'liner', v.hex, '종이발색:etude.com', v.note, 'ok', 0
FROM (
  SELECT 3039 id, '블랙' name, '블랙' family, '#2e2b2b' hex,
         '651000232.png 흰 바탕 획 (상자 600,420,820,640) · 가장 어두운 10% 평균 · L*17.8 C1.4 · 2%~30% 로 바꾸면 L* 13.0~22.4' note UNION ALL
  SELECT 3040, '브라운', '브라운', '#695a4a',
         '651000233.png 흰 바탕 획 (상자 620,420,820,640) · 가장 어두운 10% 평균 · L*39.3 C12.0 h73.6 · 2%~30% 로 바꾸면 L* 30.1~45.8 · 왼쪽에 펜 몸통과 분홍 글씨가 있어 상자를 오른쪽으로 밀었다'
) v;

-- 반짝 눈물 라이너 — 3호수 (공식몰 옵션은 1호·3호·4호다. 2호는 옵션에 없다)
-- 그림 http://191981945491ece1.kinxzone.com/webcatalogue/2011/12/tearLiner/images/1_img2.jpg (1000x6708)
--   y 1450~1800 에 호수 이름이 붙은 발색 세 덩이가 나란히 있다 (흰 면 위에 두껍게 바른 것).
--
-- **셋 다 doubt 다.** 글리터 제품이라 반짝이 조각과 그 그림자가 섞여 패치 안 표준편차가
--   9~46 까지 나온다 (롬앤 색상칩은 0 이었다). 게다가 1호와 3호가 사실상 같은 값으로 읽힌다
--   (#ddd9db ↔ #dedede, Lab 거리 1.9) — 눈으로도 둘 다 '반짝이는 흰색' 이라 가릴 수 없다.
--   패치를 20→60 으로 키워도 값은 거의 안 움직였으니 읽기를 잘못한 것은 아니다.
--   **이 제품은 hex 한 값으로 담기 어려운 종류다.** 쓸 때 조심할 것.
INSERT INTO shade(id, product_id, code, name, family, part, hex, hex_source, hex_note, trust, checked)
SELECT v.id, 3011, v.code, v.name, v.family, 'liner', v.hex, '종이발색:etude.com', v.note, 'doubt', 0
FROM (
  SELECT 3041 id, '1' code, '청순한 눈물' name, '그레이' family, '#ddd9db' hex,
         '1_img2.jpg 발색 패널 패치 중앙값 20x20 (x=230,y=1620) · L*87.1 C1.8 · 패치 안 표준편차 13~16(글리터) · 60x60 으로 키우면 #e0dede · **3호와 Lab 거리 1.9 로 사실상 같다**' note UNION ALL
  SELECT 3042, '3', '진주빛 눈물', '그레이', '#dedede',
         '1_img2.jpg 발색 패널 패치 중앙값 20x20 (x=515,y=1620) · L*88.5 C0.0 · 패치 안 표준편차 8~9(글리터) · 60x60 으로 키우면 #dedfde · **1호와 Lab 거리 1.9 로 사실상 같다**' UNION ALL
  SELECT 3043, '4', '태양빛 눈물', '베이지', '#ca947b',
         '1_img2.jpg 발색 패널 패치 중앙값 20x20 (x=755,y=1620) · L*65.9 C27.2 h51.1 · **패치 안 표준편차가 23~46 으로 가장 심하다** (구리빛 반짝이) · 60x60 으로 키우면 #c78d71'
) v;
