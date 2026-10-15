-- 지금 코드(product-picks.ts)에서 옮긴 제품 (2026-10-14, migrate.py 가 만듦)
-- 손으로 고치지 말 것 — migrate.py 를 고치고 다시 돌려라

INSERT OR IGNORE INTO brand(name) VALUES ('3CE');
INSERT OR IGNORE INTO brand(name) VALUES ('라카');
INSERT OR IGNORE INTO brand(name) VALUES ('롬앤');
INSERT OR IGNORE INTO brand(name) VALUES ('릴리바이레드');
INSERT OR IGNORE INTO brand(name) VALUES ('머지');
INSERT OR IGNORE INTO brand(name) VALUES ('모렛');
INSERT OR IGNORE INTO brand(name) VALUES ('삐아');
INSERT OR IGNORE INTO brand(name) VALUES ('에뛰드');
INSERT OR IGNORE INTO brand(name) VALUES ('에스쁘아');
INSERT OR IGNORE INTO brand(name) VALUES ('웨이크메이크');
INSERT OR IGNORE INTO brand(name) VALUES ('이니스프리');
INSERT OR IGNORE INTO brand(name) VALUES ('클리오');
INSERT OR IGNORE INTO brand(name) VALUES ('투에이엔');
INSERT OR IGNORE INTO brand(name) VALUES ('페리페라');
INSERT OR IGNORE INTO brand(name) VALUES ('퓌');
INSERT OR IGNORE INTO brand(name) VALUES ('홀리카홀리카');

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'brow','드로잉 아이 브라우','펜슬 — 무르고 부드러워 넓게 채우기 좋아요',NULL,NULL,'2026-10-14' FROM brand WHERE name='에뛰드';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'brow','납작 아이브로우 펜슬','펜슬 — 납작해서 눕히면 넓게, 세우면 가늘게 그려져요','/products/innisfree-auto-eyebrow-pencil.jpg','https://www.innisfree.com/kr/ko/dp/product/35100','2026-10-14' FROM brand WHERE name='이니스프리';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'brow','스피디 스키니 브로우','펜슬 — 가늘어서 한 올씩 그리기 좋아요','/products/peripera-speedy-skinny-brow.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000138671','2026-10-14' FROM brand WHERE name='페리페라';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'cheek','듀얼 치크','한 통에 두 색 — 따로 써도, 섞어 써도 돼요','/products/2an-dual-cheek-violet.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000181230','2026-10-14' FROM brand WHERE name='투에이엔';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'cheek','퓨어 블러시드 선샤인 치크','파우더 — 얇게 올라가 뭉치지 않아요',NULL,NULL,'2026-10-14' FROM brand WHERE name='페리페라';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'cheek','치크칩','파우더·베이크드·크림 세 가지라 원하는 느낌으로 고를 수 있어요','/products/fwee-cheek-chip.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000001001750','2026-10-14' FROM brand WHERE name='퓌';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'liner','더 퍼스트 슬림 젤 아이라이너','젤 펜슬 — 심이 얇아 속눈썹 사이를 메우기 좋아요','/products/merzy-the-first-slim-gel-liner.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000119523','2026-10-14' FROM brand WHERE name='머지';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'GS1','블랙 오닉스','블랙','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='머지' AND p.name='더 퍼스트 슬림 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'GS4','브라운 쿼츠','브라운','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='머지' AND p.name='더 퍼스트 슬림 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'GS5','버건디 베릴','버건디','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='머지' AND p.name='더 퍼스트 슬림 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'GS6','모브 로즈','로즈','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='머지' AND p.name='더 퍼스트 슬림 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'GS7','모브 팬시','플럼','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='머지' AND p.name='더 퍼스트 슬림 젤 아이라이너';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'liner','라스트 오토 젤 아이라이너','젤 펜슬 — 가늘고 부드러워 애교살·음영에 좋아요','/products/bbia-last-auto-gel-liner.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000162672','2026-10-14' FROM brand WHERE name='삐아';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'11','리넨베이지','베이지','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'12','크림베이지','베이지','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'13','피넛베이지','베이지','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'14','아몬드베이지','베이지','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'16','쿨베이지','베이지','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'25','밀크 베이지','베이지','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'03','로즈브라운','로즈','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'07','로즈번','로즈','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'24','로지 파스텔','로즈','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'15','살몬베이지','코랄','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'22','피치 파스텔','코랄','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'20','모브번','플럼','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'04','멜로우브라운','브라운','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'21','뮤트 브라운','브라운','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'05','소울브라운','브라운','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='삐아' AND p.name='라스트 오토 젤 아이라이너';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'liner','철벽 펜 아이라이너','펜 — 선이 또렷하고 잘 안 번져요','/products/wakemake-pen-eyeliner.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000136300','2026-10-14' FROM brand WHERE name='웨이크메이크';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'01','블랙','블랙','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='웨이크메이크' AND p.name='철벽 펜 아이라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'02','브라운','브라운','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='웨이크메이크' AND p.name='철벽 펜 아이라이너';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'liner','샤프 쏘 심플 워터프루프 펜슬 라이너','펜슬 — 부드럽게 그려지고 색이 13가지라 고르기 좋아요','/products/clio-sharp-so-simple-pencil-liner.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000198343','2026-10-14' FROM brand WHERE name='클리오';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'001','블랙','블랙','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'002','브라운','브라운','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'003','블랙브라운','브라운','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'004','다크브라운','다크브라운','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'005','애쉬브라운','브라운','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'010','코코아브라운','브라운','liner',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='샤프 쏘 심플 워터프루프 펜슬 라이너';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'lip','블러 워터 틴트','틴트 — 뿌옇게 번지는 느낌',NULL,NULL,'2026-10-14' FROM brand WHERE name='3CE';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'lip','퍼펙트 트윈 립','틴트 + 글로스 — 매트로도, 광으로도 쓸 수 있어요','/products/laka-perfect-twin-lip.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000255256','2026-10-14' FROM brand WHERE name='라카';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'901','트루 피치','피치','lip',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='라카' AND p.name='퍼펙트 트윈 립';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'902','비지 코랄','코랄','lip',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='라카' AND p.name='퍼펙트 트윈 립';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'904','시티 핑크','핑크','lip',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='라카' AND p.name='퍼펙트 트윈 립';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'907','젠틀 로즈','로즈','lip',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='라카' AND p.name='퍼펙트 트윈 립';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'lip','쥬시 래스팅 틴트','틴트 — 촉촉하고 오래가요','/products/romand-juicy-lasting-tint.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000241210','2026-10-14' FROM brand WHERE name='롬앤';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'lip','꾸뛰르 립 틴트 글레이즈','틴트 — 광이 돌아요',NULL,NULL,'2026-10-14' FROM brand WHERE name='에스쁘아';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'shadow','무드 잇 팔레트','팔레트 — 따뜻한 계열',NULL,NULL,'2026-10-14' FROM brand WHERE name='릴리바이레드';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'shadow','뷰파인더 섀도우 팔레트','팔레트 — 뮤트한 중성 톤이라 과하지 않게 발려요','/products/molette-viewfinder-palette.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000249560','2026-10-14' FROM brand WHERE name='모렛';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'shadow','프로 아이 팔레트 에어','팔레트 — 한 판에 12색이라 한 통으로 눈 화장이 끝나요','/products/clio-pro-eye-palette-air.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000188988','2026-10-14' FROM brand WHERE name='클리오';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'1','코랄 스튜디오','코랄','shadow',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='프로 아이 팔레트 에어';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'2','로즈 커넥트','로즈','shadow',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='프로 아이 팔레트 에어';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'4','핑크 페어링','핑크','shadow',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='프로 아이 팔레트 에어';
INSERT INTO shade(product_id,code,name,family,part,checked) SELECT p.id,'10','플럼 플럼 인 시즌','플럼','shadow',0 FROM product p JOIN brand b ON b.id=p.brand_id WHERE b.name='클리오' AND p.name='프로 아이 팔레트 에어';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'shadow','올 테이크 무드 팔레트','팔레트 — 분홍·자주 계열',NULL,NULL,'2026-10-14' FROM brand WHERE name='페리페라';

INSERT INTO product(brand_id,part,name,kind,photo,source_url,checked_at) SELECT id,'shadow','마이페이브 피스 아이섀도우','낱개 — 필요한 색만 하나씩 골라 모을 수 있어요','/products/holika-my-fave-piece-shadow.jpg','https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000174309','2026-10-14' FROM brand WHERE name='홀리카홀리카';

