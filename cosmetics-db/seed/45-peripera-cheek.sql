-- 페리페라 퓨어 블러시드 선샤인 치크 — 호수와 색 (2026-10-14)
--
-- 이 제품도 DB 에 호수가 하나도 없었다. 호수부터 넣는다.
-- 공식몰에서는 이름이 "맑게 물든 선샤인 치크" 다 (영문 Pure Blushed Sunshine Cheek — 같은 제품).
--
-- 출처: 클럽클리오(페리페라 공식몰) 상품 페이지와 상세 이미지
--   https://clubclio.co.kr/shop/goodsView/0000002795
--   그림: /data/mall_data/ckeditor/test/5efa5586e2d0fde859b56430b986950f.jpg (1000x29855)
--         계열 묶음마다 끝에 **호수를 나란히 피부에 바른 띠**가 있다. 그 띠에서 뽑았다.
--
-- **뽑은 규칙**: 본 앱 client/src/core/ref-colors.ts 와 같다. 띠 안 호수 한 칸을 상자로
-- 감싸고 Lab 밝기 cheek 구간 [30,80](가운데 밝기 — 주근깨·하이라이트를 뺀다)만 남겨 RGB 평균.
--
-- **계열은 브랜드가 묶어 둔 이름을 그대로 썼다.** 상세가 CORAL / PINK / MAUVE / BEIGE 로
-- 묶어 놓았고, 호수 이름(집밖은위험해 · 날씨요정등극해 …)만으로는 색을 알 수 없어서다.
--   BEIGE 묶음(16 도토리좋아해 · 36 토스트굽굽해 · 37 시나몬노릇해 · 31 라떼달달해 ·
--   25 반달입떡해)은 cheek 계열에 그냥 "베이지" 가 없다(그레이베이지 / 베이지핑크뿐).
--   어느 쪽인지 확실하지 않아 **넣지 않았다** — 사람이 정할 것.
--
-- **믿기 어려운 점**: 뽑은 색을 본 앱의 describeColor 에 넣으면 브랜드 묶음과 다른 이름이
-- 나온다. 예를 들어 CORAL 묶음의 11·01 은 "라이트 모브", 30 은 "베이지핑크" 로 불린다.
-- 볼터치는 얇게 발려 피부 밑색이 그대로 비치는데, 본 앱은 이마를 기준으로 피부를
-- 걷어내고(unmixSkin) 이름을 짓지만 여기서는 기준이 될 이마가 없어 못 걷어냈기 때문이다.
-- 그래서 **값은 실제 제품보다 연하다.** checked=0.

-- CORAL 묶음
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'011','피크닉같이해','코랄','cheek','#fab5b3','발색사진','클럽클리오(페리페라) 공식몰 상세 CORAL 발색띠 · cheek [30,80] · 피부 걷어내기 없음','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='퓨어 블러시드 선샤인 치크';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'001','집밖은위험해','코랄','cheek','#f3aaa8','발색사진','클럽클리오(페리페라) 공식몰 상세 CORAL 발색띠 · cheek [30,80] · 피부 걷어내기 없음','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='퓨어 블러시드 선샤인 치크';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'030','장미멀멀해','코랄','cheek','#ecb2aa','발색사진','클럽클리오(페리페라) 공식몰 상세 CORAL 발색띠 · cheek [30,80] · describeColor 는 베이지핑크라고 부른다','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='퓨어 블러시드 선샤인 치크';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'028','케미팡팡해','코랄','cheek','#eba5a9','발색사진','클럽클리오(페리페라) 공식몰 상세 CORAL 발색띠 · cheek [30,80] · 영문명 ROMANTIC ROSE 라 로즈일 수도 있다','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='퓨어 블러시드 선샤인 치크';

-- PINK 묶음
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'012','날씨요정등극해','핑크','cheek','#f8cbd0','발색사진','클럽클리오(페리페라) 공식몰 상세 PINK 발색띠 · cheek [30,80] · 피부 걷어내기 없음','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='퓨어 블러시드 선샤인 치크';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'026','달달베리해','핑크','cheek','#f5c2c1','발색사진','클럽클리오(페리페라) 공식몰 상세 PINK 발색띠 · cheek [30,80] · 피부 걷어내기 없음','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='퓨어 블러시드 선샤인 치크';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'039','로즈쿠키해','핑크','cheek','#f2c1c3','발색사진','클럽클리오(페리페라) 공식몰 상세 PINK 발색띠 · cheek [30,80] · 피부 걷어내기 없음','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='퓨어 블러시드 선샤인 치크';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'027','딸기수확해','핑크','cheek','#fbbcc4','발색사진','클럽클리오(페리페라) 공식몰 상세 PINK 발색띠 · cheek [30,80] · 피부 걷어내기 없음','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='퓨어 블러시드 선샤인 치크';

-- MAUVE 묶음
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'038','타로추가해','모브','cheek','#edbcbf','발색사진','클럽클리오(페리페라) 공식몰 상세 MAUVE 발색띠 · cheek [30,80] · 피부 걷어내기 없음','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='퓨어 블러시드 선샤인 치크';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'024','달방아콩콩해','모브','cheek','#e9b3bb','발색사진','클럽클리오(페리페라) 공식몰 상세 MAUVE 발색띠 · cheek [30,80] · 피부 걷어내기 없음','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='퓨어 블러시드 선샤인 치크';
INSERT INTO shade(product_id,code,name,family,part,hex,hex_source,hex_note,checked) SELECT p.id,'029','모브낭낭해','모브','cheek','#e8b0b0','발색사진','클럽클리오(페리페라) 공식몰 상세 MAUVE 발색띠 · cheek [30,80] · 피부 걷어내기 없음','0' FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='페리페라' AND p.name='퓨어 블러시드 선샤인 치크';
