/*
 * 제품 이름·설명의 영어판 — **nudy-db 의 export.py 가 만든다. 손으로 고치지 마라.**
 *
 * 고치려면 디비 쪽을 고친다:
 *   1. cosmetics-db/seed/ZZ5-brand-en.sql · ZZ6-product-en.sql · ZZ7-kind-en.sql
 *   2. cd cosmetics-db && python3 build.py && python3 export.py
 *   3. cosmetics-db/out/product-en.ts 를 이 자리로 복사한다
 *
 * 열쇠는 「브랜드|제품이름」 한국어 그대로다 — 앱(`core/product-picks.data.ts`)이 들고 있는
 * 값이 그것이라 번호를 따로 맞출 필요가 없다.
 *
 * **여기 없는 제품은 한국어 이름이 그대로 나간다.** 영어 이름을 못 찾은 제품이 그렇다
 * (없는 제품 이름을 지어내는 것보다 낫다 — ZZ6 머리글 참고).
 */

export interface ProductEn {
  brand?: string;
  name?: string;
  kind?: string;
}

export const PRODUCT_EN: Readonly<Record<string, ProductEn>> = {
  ["에뛰드|드로잉 아이 브라우"]: { brand: "ETUDE", name: "Drawing Eye Brow", kind: "Pencil — soft and giving, good for filling a wide area" },
  ["이니스프리|납작 아이브로우 펜슬"]: { brand: "innisfree", name: "Auto Eyebrow Pencil", kind: "Pencil — flat, so it draws wide on its side and fine on its edge" },
  ["클리오|킬브로우 오토 하드 브로우 펜슬"]: { brand: "CLIO", name: "Kill Brow Auto Hard Brow Pencil", kind: "Pencil — a six-sided tip, so it draws wide on its side and fine on its edge" },
  ["페리페라|스피디 스키니 브로우"]: { brand: "peripera", name: "Speedy Skinny Brow", kind: "Pencil — thin enough to draw hair by hair" },
  ["페리페라|스피디 스키니 브로우 마스카라"]: { brand: "peripera", name: "Speedy Skinny Brow Mascara", kind: "Brow mascara — sweep it through to change your brow colour all at once" },
  ["3CE|마이 링 아이 라이너"]: { brand: "3CE", name: "My Ring Eye Liner", kind: "Brush pen — a colour liner meant to be matched to your iris" },
  ["3CE|소프트 뮤트 펜슬 라이너"]: { brand: "3CE", name: "Soft Mute Pencil Liner", kind: "Pencil — seven low-saturation muted shades, good for the under eye" },
  ["롬앤|한올 쉐이드 라이너"]: { brand: "rom&nd", name: "Han All Shade Liner", kind: "Pencil — a shadow-like tone, so the line never reads harsh" },
  ["롬앤|한올 아이팟 라이너 01 브라운 토프 팟"]: { brand: "rom&nd", name: "Han All Eye Pot Liner 01 Brown Taupe", kind: "Gel pot — four wells in one case, so you get the shading too" },
  ["롬앤|한올 아이팟 라이너 02 더스티 로즈 팟"]: { brand: "rom&nd", name: "Han All Eye Pot Liner 02 Dusty Rose", kind: "Gel pot — four wells in one case, so you get the shading too" },
  ["롬앤|한올 아이팟 라이너 03 피오니 크림 팟"]: { brand: "rom&nd", name: "Han All Eye Pot Liner 03 Peony Cream", kind: "Gel pot — four wells in one case, so you get the shading too" },
  ["롬앤|한올 아이팟 라이너 04 카라멜 브라운 팟"]: { brand: "rom&nd", name: "Han All Eye Pot Liner 04 Caramel Brown", kind: "Gel pot — four wells in one case, so you get the shading too" },
  ["롬앤|한올 아이팟 라이너 05 그레이 핑크 팟"]: { brand: "rom&nd", name: "Han All Eye Pot Liner 05 Grey Pink", kind: "Gel pot — four wells in one case, so you get the shading too" },
  ["롬앤|한올 아이팟 라이너 06 번트 코랄 팟"]: { brand: "rom&nd", name: "Han All Eye Pot Liner 06 Burnt Coral", kind: "Gel pot — four wells in one case, so you get the shading too" },
  ["릴리바이레드|스태리아이즈 나인투나인 슬림 젤 아이라이너"]: { brand: "lilybyred", name: "Starry Eyes AM9 To PM9 Slim Gel Eyeliner", kind: "Gel pencil — an ultra-slim 2mm tip, good for the waterline" },
  ["머지|더 퍼스트 슬림 젤 아이라이너"]: { brand: "MERZY", name: "The First Slim Gel Eyeliner", kind: "Gel pencil — a thin tip, good for filling between lashes" },
  ["삐아|라스트 오토 젤 아이라이너"]: { brand: "BBIA", name: "Last Auto Gel Eyeliner", kind: "Gel pencil — fine and soft, good for the lower lash line and shading" },
  ["에뛰드|2X 쌩얼 라이너"]: { brand: "ETUDE", name: "2X Bare Liner", kind: "Pen liner — sheer enough that it does not look drawn on" },
  ["에뛰드|드로잉쇼 브러쉬 라이너"]: { brand: "ETUDE", name: "Drawing Show Brush Liner", kind: "Brush pen — draws thick or thin as you like" },
  ["에뛰드|라인 픽스 브러쉬 라이너"]: { brand: "ETUDE", name: "Line Fix Brush Liner", kind: "Brush pen — on the smudge-resistant side" },
  ["에뛰드|반짝 눈물 라이너"]: { brand: "ETUDE", name: "Tear Eye Liner", kind: "Glitter liner — for dotting teardrop sparkle on the lid" },
  ["에스쁘아|노머징 브러쉬 라이너"]: { brand: "espoir", name: "Nomudging Brush Liner", kind: "Brush pen — a 0.07mm brush, good for filling between lashes" },
  ["웨이크메이크|철벽 펜 아이라이너"]: { brand: "WAKEMAKE", name: "Any-Proof Pen Eyeliner", kind: "Pen — a crisp line that resists smudging" },
  ["클리오|샤프 쏘 심플 워터프루프 펜슬 라이너"]: { brand: "CLIO", name: "Sharp So Simple Waterproof Pencil Liner", kind: "Pencil — draws smoothly, and 13 shades to choose from" },
  ["투쿨포스쿨|아트클래스 무드 펜 라이너"]: { brand: "too cool for school", name: "Artclass Mood Pen Liner", kind: "Pen — a 1mm brush tip, so the line is fine and crisp" },
  ["투쿨포스쿨|아트클래스 스머징 엣지라이너"]: { brand: "too cool for school", name: "Artclass Smudging Edge Liner", kind: "Gel pencil + blending brush — draw it on, then smudge it out like shadow" },
  ["투쿨포스쿨|아트클래스 스머징 트임 라이너"]: { brand: "too cool for school", name: "Artclass Smudging Under Liner", kind: "Gel pencil — made to be smudged for inner corner and under eye, in 13 shades" },
  ["투쿨포스쿨|아트클래스 픽싱 젤 라이너"]: { brand: "too cool for school", name: "Artclass Fixing Gel Liner", kind: "Gel pencil — a 2mm tip, thin and smudge-resistant" },
  ["릴리바이레드|무드 잇 팔레트 01 프레쉬잇"]: { brand: "lilybyred", name: "Mood It Palette 01 Fresh It", kind: "Palette — warm shades" },
  ["모렛|뷰파인더 섀도우 팔레트 와인클래스"]: { brand: "MOLETTE", name: "Viewfinder Shadow Palette Wine Class", kind: "Palette — muted neutral tones, so it never goes overboard" },
  ["모렛|뷰파인더 섀도우 팔레트 티클래스"]: { brand: "MOLETTE", name: "Viewfinder Shadow Palette Tea Class", kind: "Palette — muted neutral tones, so it never goes overboard" },
  ["모렛|뷰파인더 섀도우 팔레트 퍼퓸클래스"]: { brand: "MOLETTE", name: "Viewfinder Shadow Palette Perfume Class", kind: "Palette — muted neutral tones, so it never goes overboard" },
  ["클리오|프로 아이 팔레트 에어 1 코랄 스튜디오"]: { brand: "CLIO", name: "Pro Eye Palette Air 01 Coral Studio", kind: "Palette — 12 shades in one case, enough for the whole eye look" },
  ["클리오|프로 아이 팔레트 에어 10 플럼 플럼 인 시즌"]: { brand: "CLIO", name: "Pro Eye Palette Air 10 Season Plum", kind: "Palette — 12 shades in one case, enough for the whole eye look" },
  ["클리오|프로 아이 팔레트 에어 2 로즈 커넥트"]: { brand: "CLIO", name: "Pro Eye Palette Air 02 Rose Connect", kind: "Palette — 12 shades in one case, enough for the whole eye look" },
  ["클리오|프로 아이 팔레트 에어 4 핑크 페어링"]: { brand: "CLIO", name: "Pro Eye Palette Air 04 Pink Pairing", kind: "Palette — 12 shades in one case, enough for the whole eye look" },
  ["클리오|프로 아이 팔레트 에어 5 오키드 클라우드"]: { brand: "CLIO", name: "Pro Eye Palette Air 05 Orchid Cloud", kind: "Palette — 12 shades in one case, enough for the whole eye look" },
  ["클리오|프로 아이 팔레트 에어 7 라벤더 뉴커머"]: { brand: "CLIO", name: "Pro Eye Palette Air 07 Lavender Staff", kind: "Palette — 12 shades in one case, enough for the whole eye look" },
  ["클리오|프로 아이 팔레트 에어 8 라떼 이즈 시니어"]: { brand: "CLIO", name: "Pro Eye Palette Air 08 Latte Senior", kind: "Palette — 12 shades in one case, enough for the whole eye look" },
  ["페리페라|올 테이크 무드 팔레트 001 봄바람이 부는걸 보니 봄이 왔나봄"]: { brand: "peripera", name: "All Take Mood Palette 001", kind: "Palette — pink and plum shades" },
  ["페리페라|올 테이크 무드 팔레트 002 봄과 여름의 서사"]: { brand: "peripera", name: "All Take Mood Palette 002", kind: "Palette — pink and plum shades" },
  ["페리페라|올 테이크 무드 팔레트 003 꽃이라고 불러도 돼?"]: { brand: "peripera", name: "All Take Mood Palette 003", kind: "Palette — pink and plum shades" },
  ["페리페라|올 테이크 무드 팔레트 004 쿨톤이셔서 그런데 DM 확인 부탁드려요"]: { brand: "peripera", name: "All Take Mood Palette 004", kind: "Palette — pink and plum shades" },
  ["페리페라|올 테이크 무드 팔레트 005 나가을인데!나랑밤먹을래?"]: { brand: "peripera", name: "All Take Mood Palette 005", kind: "Palette — pink and plum shades" },
  ["페리페라|올 테이크 무드 팔레트 006 너는무슨뮤트하겠다는말을여름에하니"]: { brand: "peripera", name: "All Take Mood Palette 006", kind: "Palette — pink and plum shades" },
  ["페리페라|올 테이크 무드 팔레트 007 우리집에복숭아보러갈래?"]: { brand: "peripera", name: "All Take Mood Palette 007", kind: "Palette — pink and plum shades" },
  ["홀리카홀리카|마이페이브 피스 아이섀도우"]: { brand: "HOLIKA HOLIKA", name: "My Fave Piece Eyeshadow", kind: "Singles — collect just the shades you want, one at a time" },
  ["3CE|페이스 블러쉬"]: { brand: "3CE", name: "Face Blush", kind: "Powder" },
  ["데이지크|소프트 블러 치크"]: { brand: "dasique", name: "Soft Blur Cheek", kind: "Powder blusher" },
  ["롬앤|베러 댄 치크"]: { brand: "rom&nd", name: "Better Than Cheek", kind: "Powder blusher" },
  ["릴리바이레드|러브빔 치크밤"]: { brand: "lilybyred", name: "Love Beam Cheek Balm", kind: "Balm — a cream type in a heart-shaped case" },
  ["어뮤즈|듀 세럼 리퀴드 블러쉬"]: { brand: "AMUSE", name: "Dew Serum Liquid Blusher", kind: "Liquid — runny like a serum, spreads thin" },
  ["투에이엔|듀얼 치크"]: { brand: "2AN", name: "Dual Cheek", kind: "Two shades in one case — use them apart or mixed" },
  ["페리페라|퓨어 블러시드 선샤인 치크"]: { brand: "peripera", name: "Pure Blushed Sunshine Cheek", kind: "Powder — goes on thin without clumping" },
  ["퓌|치크칩"]: { brand: "fwee", name: "Cheek Chip", kind: "Powder, baked and cream — three finishes to pick from" },
  ["힌스|하프 문 치크"]: { brand: "hince", name: "Half Moon Cheek", kind: "A cheek that turns from cream to powder" },
  ["힌스|허그 레이어 치크"]: { brand: "hince", name: "Hug Layer Cheek", kind: "Powder — two wells in one case, layered over each other" },
  ["3CE|블러 워터 틴트"]: { brand: "3CE", name: "Blur Water Tint", kind: "Tint — a soft, blurred finish" },
  ["라카|퍼펙트 트윈 립"]: { brand: "LAKA", name: "Perfect Twin Lip", kind: "Tint + gloss — wear it matte or glossy" },
  ["롬앤|쥬시 래스팅 틴트"]: { brand: "rom&nd", name: "Juicy Lasting Tint", kind: "Tint — moist and long-wearing" },
  ["얼터너티브스테레오|립 포션"]: { brand: "ALTERNATIVE STEREO", name: "Lip Potion", kind: "Dewy tint — a light wash of colour from nude through rose" },
  ["에스쁘아|꾸뛰르 립 틴트 글레이즈"]: { brand: "espoir", name: "Couture Lip Tint Glaze", kind: "Tint — leaves a shine" },
};
