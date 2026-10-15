-- 앱이 제품 줄에 손으로 적어 둔 계열 (2026-10-15)
--
-- C1-from-app-picks.sql 의 짝이다. 거기 ⑥ 에 적어 둔 까닭으로 **ZZ1 뒤**에 와야 한다 —
-- ZZ1 ④ 가 "호수가 하나도 없는 계열은 지운다" 를 하므로, 호수 없이 계열만 가리키는
-- 줄을 ZZ1 앞에 두면 그 계열이 지워지면서 외래키에서 깨진다. ZZ1 은 고치지 말라고 했다.
--
-- 왜 shade 가 아니라 product_family 인가:
-- 앱의 계열 목록은 **호수 이름을 읽어서** 적은 것이다 ("호수에 그레이브라운·다크브라운·
-- 내추럴브라운·베이지애쉬·토프애쉬·밀키토프가 있어"). 그래서 계열은 아는데 **그 계열이
-- 어느 호수인지, 그 색이 무엇인지는 모른다.** shade 표에 넣으려면 호수 이름을 지어내야 한다.
-- 호수 색을 재서 shade 에 넣으면 여기 줄을 지우면 된다.
--
-- 팔레트처럼 디비가 **통 단위로 쪼개 놓은** 제품은, 앱이 줄 하나에 적어 둔 계열이
-- 어느 통 것인지 앱에도 안 적혀 있다. 통 이름에 색 낱말이 든 것(「10 플럼 플럼 인 시즌」)은
-- 그 통에 붙였고, 아닌 것은 **호수가 아직 없는 첫 통**에 붙이고 note 에 그렇게 적었다.
-- 그 통이라고 확인한 것이 아니다 — 호수 색을 재면 맞는 통으로 옮겨야 한다.

-- ① 쓰는 계열을 먼저 만든다. ZZ1 ④ 가 지나간 뒤라 여기서 만든 것은 남는다.
--    전부 color-name.ts 가 짓는 이름이다. 기준색(ref_hex)은 뽑을 호수가 없어 비워 둔다 —
--    비면 앱이 48색 팔레트를 보고 거리를 잰다 (product-picks.ts 의 familyLab)
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '다크브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '라이트브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '밀크브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '소프트블랙');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '애쉬브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '그레이베이지');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '라벤더');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '레드');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '로즈');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '모브');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '베이지핑크');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '브릭');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '코랄');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '피치');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '핑크');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '그레이');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '다크브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '로즈');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '밀크브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '버건디');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '블랙');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '소프트블랙');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '플럼');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', 'MLBB');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '누드베이지');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '딥레드');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '로즈');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '버건디');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '오렌지');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '브릭');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '체리');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '코랄');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '플럼');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '핑크');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '딥브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '로즈');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '베이지');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '오렌지');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '코랄');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '퍼플');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '플럼');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '핑크');

-- ⑥ 앱이 적어 둔 계열 가운데 디비 호수로 안 덮이는 것.
--    note 에 **앱이 왜 그 계열을 적었는지**를 남긴다 — 호수 색을 재서 옮길 때 단서가 된다

-- 눈썹
INSERT OR IGNORE INTO product_family(product_id, part, family, note) VALUES
 (4, 'brow', '다크브라운',   '앱: 호수 이름에 다크브라운이 있다 (8색)'),
 (4, 'brow', '브라운',       '앱: 호수 이름에 내추럴브라운이 있다 (8색)'),
 (4, 'brow', '애쉬브라운',   '앱: 호수 이름에 베이지애쉬·토프애쉬가 있다 (8색)'),
 (3, 'brow', '다크브라운',   '앱: 공식 색상에 에스프레소 브라운·어반 브라운이 있다 (7색)'),
 (3, 'brow', '라이트브라운', '앱: 공식 색상에 허니 브라운이 있다 (7색)'),
 (3, 'brow', '밀크브라운',   '앱: 공식 색상에 허니 브라운이 있다 (7색)'),
 (3, 'brow', '브라운',       '앱: 공식 색상에 애쉬 브라운·어반 브라운이 있다 (7색)'),
 (3, 'brow', '소프트블랙',   '앱: 공식 색상에 블랙이 있다 (7색)'),
 (2, 'brow', '다크브라운',   '앱: 에뛰드 드로잉 아이 브라우 줄에 다크브라운이 적혀 있었다');

-- 아이라이너
INSERT OR IGNORE INTO product_family(product_id, part, family, note) VALUES
 (9, 'liner', '다크브라운', '앱: 05 소울브라운 · 06 초코무스 · 27 모카번 호수 (26색)'),
 (9, 'liner', '블랙',       '앱: 01 느와르 · 02 재즈 호수 (26색)'),
 (9, 'liner', '소프트블랙', '앱: 01 느와르 · 02 재즈 호수 (26색)'),
 (9, 'liner', '플럼',       '앱: 20 모브번 호수 (26색)'),
 (8, 'liner', '다크브라운', '앱: GS3 브론즈 오팔 · GS4 브라운 쿼츠 호수 (7색)'),
 (8, 'liner', '로즈',       '앱: GS6 모브 로즈 호수 (7색)'),
 (8, 'liner', '밀크브라운', '앱: GS3 브론즈 오팔 · GS4 브라운 쿼츠 호수 (7색)'),
 (8, 'liner', '버건디',     '앱: GS5 버건디 베릴 호수 (7색)'),
 (8, 'liner', '블랙',       '앱: GS1 블랙 오닉스 · GS2 블랙 스피넬 호수 (7색)'),
 (8, 'liner', '플럼',       '앱: GS7 모브 팬시 호수 (7색)'),
 (10, 'liner', '다크브라운', '앱: 03 다크브라운 호수 (3색)'),
 (10, 'liner', '블랙',       '앱: 01 블랙 호수 (3색)'),
 (11, 'liner', '그레이',     '앱: 011 뮤트그레이 호수 (13색)'),
 (11, 'liner', '다크브라운', '앱: 004 다크브라운 호수 (13색)'),
 (11, 'liner', '버건디',     '앱: 클리오 샤프 쏘 심플 줄에 버건디가 적혀 있었다 (13색)'),
 (11, 'liner', '소프트블랙', '앱: 001 블랙 · 003 블랙브라운 호수 (13색)');

-- 섀도우
INSERT OR IGNORE INTO product_family(product_id, part, family, note) VALUES
 (24, 'shadow', '플럼', '앱: 통 이름이 「10 플럼 플럼 인 시즌」 이다'),
 (5001, 'shadow', '퍼플', '앱: 통 이름이 「5 오키드 클라우드」 다. 섀도우에는 라벤더 계열 이름이 없어 퍼플로 둔다'),
 (5002, 'shadow', '퍼플', '앱: 통 이름이 「7 라벤더 뉴커머」 다. 섀도우에는 라벤더 계열 이름이 없어 퍼플로 둔다'),
 (5003, 'shadow', '베이지', '앱: 통 이름이 「8 라떼 이즈 시니어」 다'),
 (20, 'shadow', '로즈',   '앱: 전지원이 보낸 사진에서 눈으로 본 것 (낱개 20색). 자동 추출은 케이스가 투명해 못 썼다'),
 (20, 'shadow', '베이지', '앱: 전지원이 보낸 사진에서 눈으로 본 것 (낱개 20색). 자동 추출은 케이스가 투명해 못 썼다'),
 (20, 'shadow', '코랄',   '앱: 전지원이 보낸 사진에서 눈으로 본 것 (낱개 20색). 자동 추출은 케이스가 투명해 못 썼다'),
 (20, 'shadow', '핑크',   '앱: 전지원이 보낸 사진에서 눈으로 본 것 (낱개 20색). 자동 추출은 케이스가 투명해 못 썼다'),
 (31, 'shadow', '퍼플', '앱: 「분홍·자주 계열」 이라고 줄 하나에 적혀 있었다 — 어느 통인지는 앱에도 없다. 호수가 없는 첫 통에 붙였다'),
 (31, 'shadow', '플럼', '앱: 「분홍·자주 계열」 이라고 줄 하나에 적혀 있었다 — 어느 통인지는 앱에도 없다. 호수가 없는 첫 통에 붙였다'),
 (40, 'shadow', '딥브라운', '앱: 사진 두 장 중 「베이지~갈색 한 줄기」(색상각 15~48도) — 어느 클래스인지는 앱에도 없다. 호수가 없는 첫 통에 붙였다'),
 (40, 'shadow', '베이지',   '앱: 사진 두 장 중 「베이지~갈색 한 줄기」(색상각 15~48도) — 어느 클래스인지는 앱에도 없다. 호수가 없는 첫 통에 붙였다'),
 (40, 'shadow', '브라운',   '앱: 사진 두 장 중 「베이지~갈색 한 줄기」(색상각 15~48도) — 어느 클래스인지는 앱에도 없다. 호수가 없는 첫 통에 붙였다'),
 (43, 'shadow', '오렌지', '앱: 「따뜻한 계열」 이라고 줄 하나에 적혀 있었다 — 어느 통인지는 앱에도 없다. 호수가 없는 첫 통에 붙였다'),
 (43, 'shadow', '코랄',   '앱: 「따뜻한 계열」 이라고 줄 하나에 적혀 있었다 — 어느 통인지는 앱에도 없다. 호수가 없는 첫 통에 붙였다');

-- 볼터치
INSERT OR IGNORE INTO product_family(product_id, part, family, note) VALUES
 (7, 'cheek', '코랄', '앱: 15색 × 3제형 중 네 색만 쟀다. 나머지 11색은 앱에서도 못 본 것이다'),
 (7, 'cheek', '피치', '앱: 15색 × 3제형 중 네 색만 쟀다. 나머지 11색은 앱에서도 못 본 것이다'),
 (5, 'cheek', '로즈',       '앱: 러브 로지 · 디어 로즈 · 크리미 로지 호수 (19색)'),
 (5, 'cheek', '모브',       '앱: 러브 로지 · 디어 로즈 · 크리미 로지 호수 (19색)'),
 (5, 'cheek', '핑크',       '앱: 핑크 페탈 · 핑크 텐션 · 버블 하트 · 누드 헤이즈 호수 (19색)'),
 (5, 'cheek', '레드',       '앱: 베리 큐피드 · 망고 베리 · 러브 포션 호수 (19색)'),
 (5, 'cheek', '브릭',       '앱: 베리 큐피드 · 망고 베리 · 러브 포션 호수 (19색)'),
 (5, 'cheek', '피치',       '앱: 코코 코랄 · 핫 리빙 코랄 · 피치 피즈 · 쥬시 피치 호수 (19색)'),
 (6, 'cheek', '베이지핑크', '앱: 페리페라 퓨어 블러시드 선샤인 치크 줄에 적혀 있었다'),
 (6, 'cheek', '피치',       '앱: 페리페라 퓨어 블러시드 선샤인 치크 줄에 적혀 있었다');

-- 입술
INSERT OR IGNORE INTO product_family(product_id, part, family, note) VALUES
 (13, 'lip', 'MLBB', '앱: 908 인 카페인(커피빛) · 909 길티 모브 호수 (12색)'),
 (13, 'lip', '로즈', '앱: 905 로지 하이 · 907 젠틀 로즈 호수 (12색)'),
 (13, 'lip', '브릭', '앱: 906 솔티 피그(무화과) 호수 (12색)'),
 (13, 'lip', '체리', '앱: 910 보스 체리 호수 (12색)'),
 (13, 'lip', '코랄', '앱: 902 비지 코랄 호수 (12색)'),
 (13, 'lip', '핑크', '앱: 904 시티 핑크 호수 (12색)'),
 (14, 'lip', 'MLBB',     '앱: 사진에 보이는 것만으로도 누드가 있다 (30색 가까이)'),
 (14, 'lip', '누드베이지', '앱: 사진에 보이는 것만으로도 누드가 있다 (30색 가까이)'),
 (14, 'lip', '오렌지',   '앱: 사진에 보이는 것만으로도 오렌지가 있다 (30색 가까이)'),
 (14, 'lip', '플럼',     '앱: 사진에 보이는 것만으로도 자주가 있다 (30색 가까이)'),
 (14, 'lip', '핑크',     '앱: 사진에 보이는 것만으로도 분홍이 있다 (30색 가까이)'),
 (15, 'lip', '오렌지', '앱: 에스쁘아 꾸뛰르 립 틴트 글레이즈 줄에 적혀 있었다'),
 (12, 'lip', '딥레드', '앱: 3CE 블러 워터 틴트 줄에 적혀 있었다'),
 (12, 'lip', '로즈',   '앱: 3CE 블러 워터 틴트 줄에 적혀 있었다'),
 (12, 'lip', '버건디', '앱: 3CE 블러 워터 틴트 줄에 적혀 있었다'),
 (12, 'lip', '체리',   '앱: 3CE 블러 워터 틴트 줄에 적혀 있었다'),
 (12, 'lip', '플럼',   '앱: 3CE 블러 워터 틴트 줄에 적혀 있었다'),
 (12, 'lip', '핑크',   '앱: 3CE 블러 워터 틴트 줄에 적혀 있었다');
