-- 제품 설명(`kind`)의 영어판 (2026-10-16).
--
-- 제품 **이름**(ZZ6)과 성격이 다르다. 이름은 브랜드가 지은 것이라 찾아서 그대로 옮겨야 하지만,
-- 이 설명은 **우리가 쓴 글**이다 ("틴트 — 촉촉하고 오래가요"). 그래서 옮겨 적는 것이 맞다.
--
-- 적는 규칙은 한국어판과 같다:
--  · 제형·도구를 먼저 적고, 줄표(—) 뒤에 "왜 이것인지" 를 한 줄로.
--  · 광고 문구처럼 쓰지 않는다. 쓰는 사람이 고를 때 판단할 거리를 준다.
--  · 한국어판에 없는 말을 영어판에 더하지 않는다 (두 벌이 같은 말이어야 한다).

UPDATE product SET kind_en = 'Glitter liner — for dotting teardrop sparkle on the lid' WHERE kind = '글리터 라이너 — 눈물 모양 반짝이를 얹는 용이에요';
UPDATE product SET kind_en = 'Singles — collect just the shades you want, one at a time' WHERE kind = '낱개 — 필요한 색만 하나씩 골라 모을 수 있어요';
UPDATE product SET kind_en = 'Liquid — runny like a serum, spreads thin' WHERE kind = '리퀴드 — 세럼처럼 묽어 얇게 퍼져요';
UPDATE product SET kind_en = 'Balm — a cream type in a heart-shaped case' WHERE kind = '밤 — 하트 모양 통에 담긴 크림 타입';
UPDATE product SET kind_en = 'Brush pen — a 0.07mm brush, good for filling between lashes' WHERE kind = '붓펜 — 0.07mm 붓이라 속눈썹 사이를 메우기 좋아요';
UPDATE product SET kind_en = 'Brush pen — a colour liner meant to be matched to your iris' WHERE kind = '붓펜 — 눈동자 색에 맞춰 고르라고 나온 컬러 라이너예요';
UPDATE product SET kind_en = 'Brush pen — on the smudge-resistant side' WHERE kind = '붓펜 — 잘 안 번지는 쪽이에요';
UPDATE product SET kind_en = 'Brush pen — draws thick or thin as you like' WHERE kind = '붓펜 — 획이 굵게도 가늘게도 나와요';
UPDATE product SET kind_en = 'Brow mascara — sweep it through to change your brow colour all at once' WHERE kind = '브로우 마스카라 — 솔로 쓸어 눈썹 색을 통째로 바꿔요';
UPDATE product SET kind_en = 'Gel pot — four wells in one case, so you get the shading too' WHERE kind = '젤 팟 — 한 통에 칸 4개라 음영까지 같이 돼요';
UPDATE product SET kind_en = 'Gel pencil + blending brush — draw it on, then smudge it out like shadow' WHERE kind = '젤 펜슬 + 블렌딩 브러쉬 — 그어 놓고 문질러 음영처럼 쓸 수 있어요';
UPDATE product SET kind_en = 'Gel pencil — fine and soft, good for the lower lash line and shading' WHERE kind = '젤 펜슬 — 가늘고 부드러워 애교살·음영에 좋아요';
UPDATE product SET kind_en = 'Gel pencil — made to be smudged for inner corner and under eye, in 13 shades' WHERE kind = '젤 펜슬 — 뭉개서 쓰는 트임·애교살 전용이라 색이 13가지예요';
UPDATE product SET kind_en = 'Gel pencil — a 2mm tip, thin and smudge-resistant' WHERE kind = '젤 펜슬 — 심이 2mm로 얇고 잘 안 번져요';
UPDATE product SET kind_en = 'Gel pencil — an ultra-slim 2mm tip, good for the waterline' WHERE kind = '젤 펜슬 — 심이 2mm로 초슬림이라 점막에 쓰기 좋아요';
UPDATE product SET kind_en = 'Gel pencil — a thin tip, good for filling between lashes' WHERE kind = '젤 펜슬 — 심이 얇아 속눈썹 사이를 메우기 좋아요';
UPDATE product SET kind_en = 'Dewy tint — a light wash of colour from nude through rose' WHERE kind = '촉촉한 틴트 — 누드부터 로즈까지 음영이 옅게 깔려요';
UPDATE product SET kind_en = 'A cheek that turns from cream to powder' WHERE kind = '크림에서 파우더로 바뀌는 치크';
UPDATE product SET kind_en = 'Tint + gloss — wear it matte or glossy' WHERE kind = '틴트 + 글로스 — 매트로도, 광으로도 쓸 수 있어요';
UPDATE product SET kind_en = 'Tint — leaves a shine' WHERE kind = '틴트 — 광이 돌아요';
UPDATE product SET kind_en = 'Tint — a soft, blurred finish' WHERE kind = '틴트 — 뿌옇게 번지는 느낌';
UPDATE product SET kind_en = 'Tint — moist and long-wearing' WHERE kind = '틴트 — 촉촉하고 오래가요';
UPDATE product SET kind_en = 'Powder' WHERE kind = '파우더';
UPDATE product SET kind_en = 'Powder — goes on thin without clumping' WHERE kind = '파우더 — 얇게 올라가 뭉치지 않아요';
UPDATE product SET kind_en = 'Powder — two wells in one case, layered over each other' WHERE kind = '파우더 — 한 통에 두 칸, 겹쳐 발라요';
UPDATE product SET kind_en = 'Powder blusher' WHERE kind = '파우더 블러셔';
UPDATE product SET kind_en = 'Powder, baked and cream — three finishes to pick from' WHERE kind = '파우더·베이크드·크림 세 가지라 원하는 느낌으로 고를 수 있어요';
UPDATE product SET kind_en = 'Palette — warm shades' WHERE kind = '팔레트 — 따뜻한 계열';
UPDATE product SET kind_en = 'Palette — muted neutral tones, so it never goes overboard' WHERE kind = '팔레트 — 뮤트한 중성 톤이라 과하지 않게 발려요';
UPDATE product SET kind_en = 'Palette — pink and plum shades' WHERE kind = '팔레트 — 분홍·자주 계열';
UPDATE product SET kind_en = 'Palette — 12 shades in one case, enough for the whole eye look' WHERE kind = '팔레트 — 한 판에 12색이라 한 통으로 눈 화장이 끝나요';
UPDATE product SET kind_en = 'Pen — a 1mm brush tip, so the line is fine and crisp' WHERE kind = '펜 — 1mm 붓끝이라 선이 가늘고 또렷해요';
UPDATE product SET kind_en = 'Pen — a crisp line that resists smudging' WHERE kind = '펜 — 선이 또렷하고 잘 안 번져요';
UPDATE product SET kind_en = 'Pen liner — sheer enough that it does not look drawn on' WHERE kind = '펜 라이너 — 묽게 비쳐서 그린 티가 덜 나요';
UPDATE product SET kind_en = 'Pencil — thin enough to draw hair by hair' WHERE kind = '펜슬 — 가늘어서 한 올씩 그리기 좋아요';
UPDATE product SET kind_en = 'Pencil — a shadow-like tone, so the line never reads harsh' WHERE kind = '펜슬 — 그림자 같은 음영색이라 선이 세게 안 보여요';
UPDATE product SET kind_en = 'Pencil — flat, so it draws wide on its side and fine on its edge' WHERE kind = '펜슬 — 납작해서 눕히면 넓게, 세우면 가늘게 그려져요';
UPDATE product SET kind_en = 'Pencil — soft and giving, good for filling a wide area' WHERE kind = '펜슬 — 무르고 부드러워 넓게 채우기 좋아요';
UPDATE product SET kind_en = 'Pencil — draws smoothly, and 13 shades to choose from' WHERE kind = '펜슬 — 부드럽게 그려지고 색이 13가지라 고르기 좋아요';
UPDATE product SET kind_en = 'Pencil — a six-sided tip, so it draws wide on its side and fine on its edge' WHERE kind = '펜슬 — 심이 육각이라 눕히면 넓게, 세우면 가늘게 그려져요';
UPDATE product SET kind_en = 'Pencil — seven low-saturation muted shades, good for the under eye' WHERE kind = '펜슬 — 채도를 낮춘 7가지 뮤트 색이라 애교살·언더에 쓰기 좋아요';
UPDATE product SET kind_en = 'Two shades in one case — use them apart or mixed' WHERE kind = '한 통에 두 색 — 따로 써도, 섞어 써도 돼요';
