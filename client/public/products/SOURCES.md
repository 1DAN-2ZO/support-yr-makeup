# 제품 사진 출처

`client/public/products/` 의 사진이 어디서 온 것인지 적는다 (#338 ①).

사진은 **제품을 알아보게 하려고** 쓴다 — 앱의 "이런 제품이면 돼요" 줄에 작게 나간다.
새 사진을 넣을 때는 **이 표에 한 줄을 같이 더한다.** 출처를 못 적는 사진은 넣지 않는다
(그 제품은 사진 없이 색 네모 `slot-product-dot` 로 나간다 — `core/product-picks.ts` 에서 `photo` 를 비우면 된다).

확인한 날: **2026-10-08**

| 파일 | 브랜드 | 제품 | 출처 |
|---|---|---|---|
| `peripera-speedy-skinny-brow.jpg` | 페리페라 | 스피디 스키니 브로우 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000138671) |
| `innisfree-auto-eyebrow-pencil.jpg` | 이니스프리 | 납작 아이브로우 펜슬 0.3g | [이니스프리 공식몰](https://www.innisfree.com/kr/ko/dp/product/35100) |
| `wakemake-pen-eyeliner.jpg` | 웨이크메이크 | 철벽 펜 아이라이너 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000136300) |
| `clio-sharp-so-simple-pencil-liner.jpg` | 클리오 | 샤프 쏘 심플 워터프루프 펜슬라이너 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000198343) |
| `bbia-last-auto-gel-liner.jpg` | 삐아 | 라스트 오토 젤 아이라이너 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000162672) |
| `merzy-the-first-slim-gel-liner.jpg` | 머지 | 더 퍼스트 슬림 젤 아이라이너 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000119523) |
| `clio-pro-eye-palette-air.jpg` | 클리오 | 프로 아이 팔레트 에어 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000188988) |
| `holika-my-fave-piece-shadow.jpg` | 홀리카홀리카 | 마이페이브 피스 아이섀도우 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000174309) |
| `molette-viewfinder-palette.jpg` | 모렛 | 뷰파인더 섀도우 팔레트 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000249560) |
| `fwee-cheek-chip.jpg` | 퓌 | 치크칩 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000001001750) |
| `2an-dual-cheek.jpg` | 투에이엔 | 듀얼 치크 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000181230) |
| `2an-dual-cheek-violet.jpg` | 투에이엔 | 듀얼 치크 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000181230) |
| `laka-perfect-twin-lip.jpg` | 라카 | 퍼펙트 트윈 립 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000255256) |
| `romand-juicy-lasting-tint.jpg` | 롬앤 | 더 쥬시 래스팅 틴트 | [올리브영](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000241210) |

## 알아 둘 것

- **사진의 권리는 각 브랜드에 있다.** 우리가 만든 것이 아니다. 화면에 "제품 사진: 각 브랜드" 를 한 줄 적어 둔다
- 투에이엔 듀얼 치크는 호수별로 나눠 넣어서 사진이 두 장이지만 **제품 페이지는 하나**다
- 삐아 라스트 오토 젤 아이라이너는 **26색**이라 계열을 여럿 덮는다. 코드에서는 계열 묶음별로 나눠 넣었지만 사진과 제품 페이지는 하나다 (2026-10-12)
- 올리브영 상품 번호(`goodsNo`)는 기획·한정판이 바뀌면 다른 번호가 생길 수 있다. 위 번호는 2026-10-08 에 그 제품으로 들어가지던 것이다
- 이니스프리는 **올리브영에 들어오지 않는 브랜드**라 공식몰 주소를 적었다

## 2026-10-16 추가 — 화장품 DB(#472)로 늘어난 제품 53개 (전지원)

브랜드 공식몰 제품 페이지의 대표 사진(og:image 또는 상세 첫 사진)을 받아 320×320 JPEG 로 줄였다. 호수가 여러 개인 제품(팔레트 · 팟 라이너)은 같은 사진을 쓴다.

| 파일 | 브랜드 | 제품 | 출처 |
|---|---|---|---|
| `alternative-stereo-lip-potion.jpg` | 얼터너티브스테레오 | 립 포션 | [공식몰](https://alternativestereo.com/product/new-립-포션-카라멜-글레이즈-7-colors/236/category/56/display/1/) · [사진](https://alternativestereo.com/web/product/big/202610/434cf60131c84f8fc42eed4d2d83ee89.jpg) |
| `etude-drawing-eye-brow.jpg` | 에뛰드 | 드로잉 아이 브라우 | [공식몰](https://www.etude.com/shop/category/eye/%eb%93%9c%eb%a1%9c%ec%9e%89-%ec%95%84%ec%9d%b4-%eb%b8%8c%eb%a1%9c%ec%9a%b0-0-25g/) · [사진](https://www.etude.com/wp-content/uploads/2022/07/0146-Drawing_Eyebrow_pro-1.jpg) |
| `3ce-blur-water-tint.jpg` | 3CE | 블러 워터 틴트 | [공식몰](https://www.3cecosmetics.com/all-products/lips/lip-tint/3ce-blur-water-tint) · [사진](https://www.3cecosmetics.com/-/media/project/loreal/brand-sites/tce/apac/int/en-image-assets/all-prouducts/lips/lip-tint/blur-water-tint/dear-march/blur-water-tint_dear-march_pdp_pck.jpg?rev=152fcf340e0341c180b1a12befd03447&cx=0.39&cy=0.5&cw=750&ch=960&hash=AD387226BDB50A3F1E7E53F5A22D675D) |
| `espoir-couture-lip-tint-glaze.jpg` | 에스쁘아 | 꾸뛰르 립 틴트 글레이즈 | [공식몰](https://www.espoir.com/ko/shop/LIP/shop_prd_list.do) · [사진](https://images.espoir.com/UPLOAD/UPLOAD_IMAGE/PRD01/202601/IMG1767GaZ586398016_320.jpg) |
| `peripera-all-take-mood-palette-001.jpg` | 페리페라 | 올 테이크 무드 팔레트 001 봄바람이 부는걸 보니 봄이 왔나봄 | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-002.jpg` | 페리페라 | 올 테이크 무드 팔레트 002 봄과 여름의 서사 | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-003.jpg` | 페리페라 | 올 테이크 무드 팔레트 003 꽃이라고 불러도 돼? | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-004.jpg` | 페리페라 | 올 테이크 무드 팔레트 004 쿨톤이셔서 그런데 DM 확인 부탁드려요 | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-005.jpg` | 페리페라 | 올 테이크 무드 팔레트 005 나가을인데!나랑밤먹을래? | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-006.jpg` | 페리페라 | 올 테이크 무드 팔레트 006 너는무슨뮤트하겠다는말을여름에하니 | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-007.jpg` | 페리페라 | 올 테이크 무드 팔레트 007 우리집에복숭아보러갈래? | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-008.jpg` | 페리페라 | 올 테이크 무드 팔레트 008 버건디근데이제도화를곁들인 | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-009.jpg` | 페리페라 | 올 테이크 무드 팔레트 009 야레야레못말리는복숭아 | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-010.jpg` | 페리페라 | 올 테이크 무드 팔레트 010 그린곳까지가제눈입니다만? | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-011.jpg` | 페리페라 | 올 테이크 무드 팔레트 011 방구석청담샵미지근아티스트 | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-012.jpg` | 페리페라 | 올 테이크 무드 팔레트 012 애교통신 반짝임 감지 가속모드 | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `peripera-all-take-mood-palette-013.jpg` | 페리페라 | 올 테이크 무드 팔레트 013 나됐어요!도도폭스됐어요 | [공식몰](https://clubclio.co.kr/shop/goodsView/0000005300) · [사진](https://clubclio.co.kr/data/mall_data/images/product/00/00/00/53/00/m.gif) |
| `lilybyred-mood-it-palette-01-fresh-it.jpg` | 릴리바이레드 | 무드 잇 팔레트 01 프레쉬잇 | [공식몰](https://lilybyred.co.kr/product/오드라벤더-릴리바이레드-무드-잇-팔레트ad/343/category/25/display/1/) · [사진](https://lilybyred.co.kr/web/product/big/202511/3b5244ddda57051afc23410e36e9206a.jpg) |
| `lilybyred-mood-it-palette-02-like-it.jpg` | 릴리바이레드 | 무드 잇 팔레트 02 라이크잇 | [공식몰](https://lilybyred.co.kr/product/오드라벤더-릴리바이레드-무드-잇-팔레트ad/343/category/25/display/1/) · [사진](https://lilybyred.co.kr/web/product/big/202511/3b5244ddda57051afc23410e36e9206a.jpg) |
| `lilybyred-mood-it-palette-03-neutral-it.jpg` | 릴리바이레드 | 무드 잇 팔레트 03 뉴트럴잇 | [공식몰](https://lilybyred.co.kr/product/오드라벤더-릴리바이레드-무드-잇-팔레트ad/343/category/25/display/1/) · [사진](https://lilybyred.co.kr/web/product/big/202511/3b5244ddda57051afc23410e36e9206a.jpg) |
| `lilybyred-mood-it-palette-04-attention-it.jpg` | 릴리바이레드 | 무드 잇 팔레트 04 어텐션잇 | [공식몰](https://lilybyred.co.kr/product/오드라벤더-릴리바이레드-무드-잇-팔레트ad/343/category/25/display/1/) · [사진](https://lilybyred.co.kr/web/product/big/202511/3b5244ddda57051afc23410e36e9206a.jpg) |
| `lilybyred-mood-it-palette-05-cherish-it.jpg` | 릴리바이레드 | 무드 잇 팔레트 05 체리쉬잇 | [공식몰](https://lilybyred.co.kr/product/오드라벤더-릴리바이레드-무드-잇-팔레트ad/343/category/25/display/1/) · [사진](https://lilybyred.co.kr/web/product/big/202511/3b5244ddda57051afc23410e36e9206a.jpg) |
| `lilybyred-mood-it-palette-06-soft-it.jpg` | 릴리바이레드 | 무드 잇 팔레트 06 소프트잇 | [공식몰](https://lilybyred.co.kr/product/오드라벤더-릴리바이레드-무드-잇-팔레트ad/343/category/25/display/1/) · [사진](https://lilybyred.co.kr/web/product/big/202511/3b5244ddda57051afc23410e36e9206a.jpg) |
| `lilybyred-mood-it-palette-07-romantic-it.jpg` | 릴리바이레드 | 무드 잇 팔레트 07 로맨틱잇 | [공식몰](https://lilybyred.co.kr/product/오드라벤더-릴리바이레드-무드-잇-팔레트ad/343/category/25/display/1/) · [사진](https://lilybyred.co.kr/web/product/big/202511/3b5244ddda57051afc23410e36e9206a.jpg) |
| `lilybyred-mood-it-palette-08-strange-it.jpg` | 릴리바이레드 | 무드 잇 팔레트 08 스트레인지잇 | [공식몰](https://lilybyred.co.kr/product/오드라벤더-릴리바이레드-무드-잇-팔레트ad/343/category/25/display/1/) · [사진](https://lilybyred.co.kr/web/product/big/202511/3b5244ddda57051afc23410e36e9206a.jpg) |
| `clio-kill-brow-auto-hard-brow-pencil.jpg` | 클리오 | 킬브로우 오토 하드 브로우 펜슬 | [공식몰](https://clubclio.co.kr/shop/goodsView/0000001334) · [사진](https://clubclio.co.kr/data/mall_data/ckeditor/test/96b99f9f2dccc3945ddcc4b660b67a9e.jpg) |
| `peripera-speedy-skinny-brow-mascara.jpg` | 페리페라 | 스피디 스키니 브로우 마스카라 | [공식몰](https://clubclio.co.kr/shop/goodsView/0000003705) · [사진](https://clubclio.co.kr/data/mall_data/ckeditor/test/384cdf12ae19a5b5aa9b073be418b38f.jpg) |
| `rom-nd-better-than-cheek.jpg` | 롬앤 | 베러 댄 치크 | [공식몰](https://romand.co.kr/product/롬앤-베러-댄-치크/646/) · [사진](https://cafe24.poxo.com/ec01/romand/6aDrbsrpgztyixM+aENnH1D89vbvN874SJZ0smDxiaa/k9zGF5hClK+Cdcc6Crl70h/a8RobAiR24eeOO4zRMg==/_/web/product/big/202309/9574b7387c8cc5f1ac984acfa2052499.jpg) |
| `dasique-soft-blur-cheek.jpg` | 데이지크 | 소프트 블러 치크 | [공식몰](https://www.dasique.co.kr/product/detail.html?product_no=790) · [사진](https://m.dasique.co.kr/web/product/big/202609/15ac494c92fb4ca3ebe9134f00a5066e.jpg) |
| `hince-half-moon-cheek.jpg` | 힌스 | 하프 문 치크 | [공식몰](https://hince.co.kr/product/하프-문-치크/1191/) · [사진](https://hince.co.kr/web/product/big/202609/d1c7b04d79263d09d1997e4428c11882.jpg) |
| `hince-hug-layer-cheek.jpg` | 힌스 | 허그 레이어 치크 | [공식몰](https://hince.co.kr/product/허그-레이어-치크/1391/) · [사진](https://hince.co.kr/web/product/big/202607/18fb48bf41c684fe0aa939044162cb9a.jpg) |
| `lilybyred-love-beam-cheek-balm.jpg` | 릴리바이레드 | 러브빔 치크밤 | [공식몰](https://lilybyred.co.kr/product/릴리바이레드-러브빔-치크밤/29/) · [사진](https://lilybyred.co.kr/web/product/small/202605/40d5211e553bf348e75600c614d14baa.jpg) |
| `3ce-face-blush.jpg` | 3CE | 페이스 블러쉬 | [공식몰](https://www.3cecosmetics.com/all-products/cheeks/blush/3ce-face-blush) · [사진](https://www.3cecosmetics.com/-/media/project/loreal/brand-sites/tce/apac/int/en-image-assets/all-prouducts/cheeks/blush/face-blush/m-gal-260722/city-mauve/face-blush-city-mauve_pdp_pck.jpg?rev=87e4bba5daf847eda49ee8b26ba50a25&cx=0.5&cy=0.51&cw=750&ch=960&hash=0BDE21170EB6017792869195C4B3C7E4) |
| `amuse-dew-serum-liquid-blusher.jpg` | 어뮤즈 | 듀 세럼 리퀴드 블러쉬 | [공식몰](https://www.amusemakeup.com/product/듀-세럼-리퀴드-블러쉬-8종-택1/1075/) · [사진](https://m.amusemakeup.com/web/product/big/202608/15b16c9711ab9b5e7b181e9cf6d12b61.jpg) |
| `rom-nd-han-all-shade-liner.jpg` | 롬앤 | 한올 쉐이드 라이너 | [공식몰](https://romand.co.kr/product/롬앤-한올-쉐이드-라이너/635/) · [사진](https://cafe24.poxo.com/ec01/romand/6aDrbsrpgztyixM+aENnH1D89vbvN874SJZ0smDxiaa/k9zGF5hClK+Cdcc6Crl70h/a8RobAiR24eeOO4zRMg==/_/web/product/extra/big/202309/881053951ec374dcc8005c6147eae064.jpg) |
| `rom-nd-han-all-eye-pot-liner-01-brown-taupe.jpg` | 롬앤 | 한올 아이팟 라이너 01 브라운 토프 팟 | [공식몰](https://romand.co.kr/product/롬앤-한올-아이팟-라이너/1032/) · [사진](https://cafe24.poxo.com/ec01/romand/6aDrbsrpgztyixM+aENnH1D89vbvN874SJZ0smDxiaa/k9zGF5hClK+Cdcc6Crl70h/a8RobAiR24eeOO4zRMg==/_/web/product/big/202610/4aec5e91014f9dbf877e5d31b7f9d59a.jpg) |
| `rom-nd-han-all-eye-pot-liner-02-dusty-rose.jpg` | 롬앤 | 한올 아이팟 라이너 02 더스티 로즈 팟 | [공식몰](https://romand.co.kr/product/롬앤-한올-아이팟-라이너/1032/) · [사진](https://cafe24.poxo.com/ec01/romand/6aDrbsrpgztyixM+aENnH1D89vbvN874SJZ0smDxiaa/k9zGF5hClK+Cdcc6Crl70h/a8RobAiR24eeOO4zRMg==/_/web/product/big/202610/4aec5e91014f9dbf877e5d31b7f9d59a.jpg) |
| `rom-nd-han-all-eye-pot-liner-03-peony-cream.jpg` | 롬앤 | 한올 아이팟 라이너 03 피오니 크림 팟 | [공식몰](https://romand.co.kr/product/롬앤-한올-아이팟-라이너/1032/) · [사진](https://cafe24.poxo.com/ec01/romand/6aDrbsrpgztyixM+aENnH1D89vbvN874SJZ0smDxiaa/k9zGF5hClK+Cdcc6Crl70h/a8RobAiR24eeOO4zRMg==/_/web/product/big/202610/4aec5e91014f9dbf877e5d31b7f9d59a.jpg) |
| `rom-nd-han-all-eye-pot-liner-04-caramel-brown.jpg` | 롬앤 | 한올 아이팟 라이너 04 카라멜 브라운 팟 | [공식몰](https://romand.co.kr/product/롬앤-한올-아이팟-라이너/1032/) · [사진](https://cafe24.poxo.com/ec01/romand/6aDrbsrpgztyixM+aENnH1D89vbvN874SJZ0smDxiaa/k9zGF5hClK+Cdcc6Crl70h/a8RobAiR24eeOO4zRMg==/_/web/product/big/202610/4aec5e91014f9dbf877e5d31b7f9d59a.jpg) |
| `rom-nd-han-all-eye-pot-liner-05-grey-pink.jpg` | 롬앤 | 한올 아이팟 라이너 05 그레이 핑크 팟 | [공식몰](https://romand.co.kr/product/롬앤-한올-아이팟-라이너/1032/) · [사진](https://cafe24.poxo.com/ec01/romand/6aDrbsrpgztyixM+aENnH1D89vbvN874SJZ0smDxiaa/k9zGF5hClK+Cdcc6Crl70h/a8RobAiR24eeOO4zRMg==/_/web/product/big/202610/4aec5e91014f9dbf877e5d31b7f9d59a.jpg) |
| `rom-nd-han-all-eye-pot-liner-06-burnt-coral.jpg` | 롬앤 | 한올 아이팟 라이너 06 번트 코랄 팟 | [공식몰](https://romand.co.kr/product/롬앤-한올-아이팟-라이너/1032/) · [사진](https://cafe24.poxo.com/ec01/romand/6aDrbsrpgztyixM+aENnH1D89vbvN874SJZ0smDxiaa/k9zGF5hClK+Cdcc6Crl70h/a8RobAiR24eeOO4zRMg==/_/web/product/big/202610/4aec5e91014f9dbf877e5d31b7f9d59a.jpg) |
| `etude-2x-bare-liner.jpg` | 에뛰드 | 2X 쌩얼 라이너 | [공식몰](https://www.etude.com/shop/category/eye/2x-쌩얼-라이너-0-5g/) · [사진](https://www.etude.com/wp-content/uploads/2022/07/0293-2X_eyeliner-1.jpg) |
| `etude-drawing-show-brush-liner.jpg` | 에뛰드 | 드로잉쇼 브러쉬 라이너 | [공식몰](https://www.etude.com/shop/category/eye/드로잉쇼-브러쉬-라이너-0-6g/) · [사진](https://www.etude.com/wp-content/uploads/2022/07/0230-DRAWING_SHOW_BRUSH_LINER-1.jpg) |
| `etude-line-fix-brush-liner.jpg` | 에뛰드 | 라인 픽스 브러쉬 라이너 | [공식몰](https://www.etude.com/shop/category/eye/라인-픽스-브러쉬-라이너-0-5g/) · [사진](https://www.etude.com/wp-content/uploads/2023/06/line_fix_brush_liner_01.jpg) |
| `etude-tear-eye-liner.jpg` | 에뛰드 | 반짝 눈물 라이너 | [공식몰](https://www.etude.com/shop/category/eye/반짝-눈물-라이너-8g/) · [사진](https://www.etude.com/wp-content/uploads/2022/07/PRD_01-5.jpg) |
| `too-cool-for-school-artclass-smudging-under-liner.jpg` | 투쿨포스쿨 | 아트클래스 스머징 트임 라이너 | [공식몰](https://toocoolforschool.com/product/아트클래스-스머징-트임-라이너/702/) · [사진](https://toocoolforschool.com/web/product/big/202608/4d317e84246ae552d10d0fd081c98969.jpg) |
| `too-cool-for-school-artclass-mood-pen-liner.jpg` | 투쿨포스쿨 | 아트클래스 무드 펜 라이너 | [공식몰](https://toocoolforschool.com/product/아트클래스-무드-펜-라이너/613/) · [사진](https://toocoolforschool.com/web/product/big/202508/ea3b875faa5deccbc972e061d630aabd.jpg) |
| `too-cool-for-school-artclass-smudging-edge-liner.jpg` | 투쿨포스쿨 | 아트클래스 스머징 엣지라이너 | [공식몰](https://toocoolforschool.com/product/아트클래스-스머징-엣지라이너/1099/) · [사진](https://toocoolforschool.com/web/product/big/202602/076dcebd67088d85d2eb403f65020479.jpg) |
| `too-cool-for-school-artclass-fixing-gel-liner.jpg` | 투쿨포스쿨 | 아트클래스 픽싱 젤 라이너 | [공식몰](https://toocoolforschool.com/product/아트클래스-픽싱-젤-라이너/438/) · [사진](https://toocoolforschool.com/web/product/big/202508/3d4a4481b956b913f505cddbf4171253.jpg) |
| `3ce-my-ring-eye-liner.jpg` | 3CE | 마이 링 아이 라이너 | [공식몰](https://www.3cecosmetics.com/all-products/eyes/eyeliner/3ce-my-ring-eye-liner) · [사진](https://www.3cecosmetics.com/-/media/project/loreal/brand-sites/tce/apac/int/en-image-assets/all-prouducts/eyes/eyeliner/my-ring-eye-liner/ash-lavender/low/myling-eye-liner_ash-lavender_pdp_pck.jpg?rev=0be52f574a2c4320b26092a001cc2b91&cx=0.5&cy=0.5&cw=750&ch=960&hash=049D31FB61F4D9EB3659BD21A0AFE1D0) |
| `3ce-soft-mute-pencil-liner.jpg` | 3CE | 소프트 뮤트 펜슬 라이너 | [공식몰](https://www.3cecosmetics.com/all-products/eyes/eyeliner/3ce-soft-mute-pencil-liner) · [사진](https://www.3cecosmetics.com/-/media/project/loreal/brand-sites/tce/apac/int/en-image-assets/all-prouducts/eyes/eyeliner/soft-mute-pencil-liner/ash-gray/soft-mute--pencil-liner_ash-gray_pdp_pck.jpg?rev=4c0a478880da40b7aa17bd15b3780c67&cx=0.5&cy=0.5&cw=750&ch=960&hash=515FFA2B45D3B5045D20575F9CFE0800) |
| `lilybyred-starry-eyes-am9-to-pm9-slim-gel-eyeliner.jpg` | 릴리바이레드 | 스태리아이즈 나인투나인 슬림 젤 아이라이너 | [공식몰](https://lilybyred.co.kr/product/릴리바이레드-스태리아이즈-나인투나인-슬림-젤-아이라이너/18/) · [사진](https://lilybyred.co.kr/web/product/big/202410/da5e4e18ba4f7373eab3e4166e67c896.jpg) |
| `espoir-nomudging-brush-liner.jpg` | 에스쁘아 | 노머징 브러쉬 라이너 | [공식몰](https://www.espoir.com/ko/shop/shop_prd_view.do?i_sProductcd=125102484) · [사진](https://images.espoir.com/UPLOAD/UPLOAD_IMAGE/PRD01/202312/IMG1701iAL407696645.jpg) |
