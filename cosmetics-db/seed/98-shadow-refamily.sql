-- 섀도우 계열을 **칸 색에서 다시 나눈 것** (2026-10-14)
--
-- 왜: 섀도우 96칸 중 41칸(43%)이 '베이지' 한 계열에 쏠려 있었다. 계열이 색을 못 담는다는 뜻이고,
-- 실제로 재 보니 그랬다 — 아주 연한 칸(#e5c6cf '잔느')은 가장 가까운 계열이어도 ΔE 15.2,
-- 아주 진한 칸(#682a3f '메를로')은 ΔE 17.3 이었다. 그 계열 색으로는 그 칸을 설명할 수 없다.
--
-- 어떻게 나눴나 — **손으로 금을 긋지 않았다.**
--   ① trust='ok' 65칸만 쓴다. doubt 31칸은 글리터가 섞여 색이 밝은 쪽으로 끌려 금을 흐린다
--   ② Lab 공간에서 색이 몰린 자리를 찾는다 (Ward 묶음, 거리는 유클리드=ΔE76 — 앱이 쓰는 거리와 같은 식)
--   ③ 계열 수는 데이터가 정했다. 묶음 수를 4~12 로 다 돌려 보고 세 숫자(되찾기·애매·쏠림)를 견줬다.
--      실루엣은 k=2 에서 0.52 로 가장 높고 그 뒤로는 0.32~0.35 로 납작하다 — 섀도우 색은
--      또렷한 덩어리가 아니라 **밝기를 따라 이어진 띠**다. 그래서 "몇 개가 맞다" 를 실루엣으로는 못 정한다.
--      대신 칸 3개 미만 묶음을 가장 가까운 묶음에 합치고 나서 숫자가 가장 좋은 자리를 골랐다 → **7계열**
--   ④ 금이 어느 축에서 그어진 것인지는 팀의 core/skin-threshold (AUC·금·애매)로 되짚었다
--      (tools/split-shadow.ts). 축은 셋으로 갈린다:
--        밝기 L*  — 진한 쪽을 가른다 (딥브라운 41.9 · 로즈브라운 57.9, AUC 0.00/0.05)
--        채도 C*  — 아주 연한 쪽을 가른다 (페일핑크 15.2, AUC 0.01)
--        노란기 b*·색상각 h° — 같은 밝기에서 따뜻/차가움을 가른다 (코랄 b* 15.7 AUC 0.95 · 피치베이지 h° 33.3 AUC 0.81)
--      **색상각만으로 먼저 가르던 것이 틀렸다** — 섀도우 칸은 h° 가 0~49 에 다 몰려 있어서(96칸 전부)
--      색상각으로는 두 갈래밖에 안 갈린다. 밝기와 채도가 먼저다.
--
-- 기준색은 90-family-ref-from-shades.sql 과 같은 방식 — 그 계열 trust='ok' 칸의 **Lab 중앙값**이다.
-- 지어낸 값이 없다. 계열마다 ok 칸이 3개 이상이다.
--
-- 전/후 (칸을 빼고 기준색을 다시 뽑은 뒤 가장 가까운 계열로 되찾기 = LOO):
--             되찾기      애매(1·2위차<3)        쏠림
--   전 10계열  84.4%   26.0%(ok칸만 29.2%)   41/96 = 43%
--   후  7계열  95.8%   31.2%(ok칸만 29.2%)   19/96 = 20%
--   칸→기준색 ΔE 중앙 6.0→4.9 · ΔE 10 넘는 칸 9개→6개
--   애매가 전체로는 5칸 늘었는데 **늘어난 5칸이 전부 doubt(글리터) 칸**이다. 금을 그은 ok 칸에서는
--   29.2% 그대로다. 계열이 촘촘해지면 이웃 계열과 가까워져 경계 칸이 느는 것은 피할 수 없고,
--   대신 틀리는 칸이 15칸에서 4칸으로 줄었다.

-- ① 새 계열을 먼저 넣는다 (칸이 가리키므로 순서가 뒤집히면 FOREIGN KEY 에 걸린다)
INSERT INTO family(part,name,ref_hex) VALUES ('shadow','페일핑크','#e2c3c6');  -- 새 이름 · 칸 16개(ok 5) · 채도 C* 15.2 밑 (AUC 0.01 · 정확도 99%) — 밝기로도 L* 79.3 넘음 (AUC 0.98)
INSERT INTO family(part,name,ref_hex) VALUES ('shadow','로즈베이지','#e4b3b5');  -- 새 이름 · 칸 19개(ok 15) · 네 금 사이에 남는 자리 — 밝고(L* 69~81) 노란기 b* 9.4 밑 (AUC 0.17 · 89%)
INSERT INTO family(part,name,ref_hex) VALUES ('shadow','피치베이지','#e5b3a4');  -- 새 이름 · 칸 16개(ok 9) · 색상각 h° 33.3 넘음 (AUC 0.81 · 82%) — 같은 밝기에서 로즈베이지와 갈린다
UPDATE family SET ref_hex='#d89798' WHERE part='shadow' AND name='핑크';  -- 칸 14개(ok 13) · 붉은기 a* 22.2 넘음 (AUC 0.88 · 84%) · h° 33.3 밑
UPDATE family SET ref_hex='#cf9180' WHERE part='shadow' AND name='코랄';  -- 칸 15개(ok 12) · 노란기 b* 15.7 넘음 (AUC 0.95 · 92%)
INSERT INTO family(part,name,ref_hex) VALUES ('shadow','로즈브라운','#a16d69');  -- 새 이름 · 칸 11개(ok 8) · 밝기 L* 57.9 밑 (AUC 0.05 · 97%)
UPDATE family SET ref_hex='#704d48' WHERE part='shadow' AND name='딥브라운';  -- 칸 5개(ok 3) · 밝기 L* 41.9 밑 (AUC 0.00 · 정확도 100%)

-- ② 칸 96개를 옮긴다. hex 로 집는다 — 섀도우 96칸의 hex 는 서로 겹치지 않고, 번호(id)는 seed 순서가
--    바뀌면 달라지기 때문이다. 옮긴 뒤 아래 ④ 에서 96개가 다 옮겨졌는지 센다.

-- 페일핑크 — 16칸 (ok 5 · doubt 11) · 기준색 #e2c3c6
--   L* 79~87 · C* 10~16 · h° -2~45   전에는 베이지 16
UPDATE shade SET family='페일핑크' WHERE part='shadow' AND hex IN (
  '#f8d0cb', -- 달콤 조청  (doubt)  ← 베이지
  '#eececc', -- 쿨샘추위  (doubt)  ← 베이지
  '#f2cdc6', -- 얼린 벚꽃잎  (doubt)  ← 베이지
  '#efcec3', -- 글린트 라이트  (doubt)  ← 베이지
  '#f0cacf', -- 핑만팔로워  (doubt)  ← 베이지
  '#f1c8d3', -- 팔로우언서  (doubt)  ← 베이지
  '#e6ccc7', -- 라이트 블레싱  (doubt)  ← 베이지
  '#f0c7c9', -- 고백적중률 100%  (doubt)  ← 베이지
  '#efc8bf', -- 봄업스토어  (doubt)  ← 베이지
  '#ebc9bf', -- 프렌치 바닐라  ← 베이지
  '#eac6c3', -- 페일 뷰  (doubt)  ← 베이지
  '#e5c6cf', -- 잔느  ← 베이지
  '#e7c4bb', -- 데일리 블룸  (doubt)  ← 베이지
  '#e2c3c6', -- 아이스 와인  ← 베이지
  '#e0c1c5', -- 시넨시스  ← 베이지
  '#e1bcba'  -- 크레페 피스  ← 베이지
);

-- 로즈베이지 — 19칸 (ok 15 · doubt 4) · 기준색 #e4b3b5
--   L* 69~81 · C* 16~24 · h° -7~36   전에는 베이지 9, 핑크 10
UPDATE shade SET family='로즈베이지' WHERE part='shadow' AND hex IN (
  '#eebdb8', -- 벚꽃시그널  ← 베이지
  '#edbbc0', -- 핑크선팔 쿨토맞팔  ← 베이지
  '#edbbba', -- 복숭아 정과  ← 베이지
  '#ecbbbc', -- 반짝이는 오간자  (doubt)  ← 베이지
  '#ebb5bb', -- 오색찬란  (doubt)  ← 핑크
  '#e7b6b2', -- 음영 과식  ← 베이지
  '#e8b5b5', -- 나 제법 핑크해요  ← 베이지
  '#ebb2ae', -- 럭키어텀이잔앙  (doubt)  ← 베이지
  '#edb0b6', -- 애정만땅  ← 핑크
  '#e6b3a9', -- 벚꽃잎 휘날리며  ← 베이지
  '#eab0b6', -- 쿨톤협찬  ← 핑크
  '#e4b3ae', -- 퍼스널 핑크  ← 베이지
  '#deb3c3', -- 라일락 알파  ← 핑크
  '#ebafaf', -- 직진 핑크  (doubt)  ← 핑크
  '#ddb3b8', -- 모디파이  ← 핑크
  '#e0adaf', -- 크리미 버디  ← 핑크
  '#d9abad', -- 페어링  ← 핑크
  '#d0a1a9', -- 인퓨전  ← 핑크
  '#cc9ca5'  -- 스모키 모브  ← 핑크
);

-- 피치베이지 — 16칸 (ok 9 · doubt 7) · 기준색 #e5b3a4
--   L* 74~83 · C* 17~25 · h° 31~49   전에는 베이지 16
UPDATE shade SET family='피치베이지' WHERE part='shadow' AND hex IN (
  '#efc6bb', -- 2시의 햇살  (doubt)  ← 베이지
  '#ebc2b4', -- 봄의 데모곡  (doubt)  ← 베이지
  '#efbba5', -- 피치 베이스  ← 베이지
  '#ebbbac', -- 코지 네스트  (doubt)  ← 베이지
  '#efb8a8', -- 시크릿 어텐션  (doubt)  ← 베이지
  '#eabaa6', -- 누디 베이지  ← 베이지
  '#e6b7a7', -- 내 맘속 별로  ← 베이지
  '#e8b5ae', -- 튤립아 망고해  (doubt)  ← 베이지
  '#e6b4ac', -- 라벤더 브리즈  (doubt)  ← 베이지
  '#e6b4a3', -- 호두주의보  ← 베이지
  '#e5b3a5', -- 꽃되는 꿀팁  ← 베이지
  '#ebaea3', -- 꽃 한소절  ← 베이지
  '#e8ada3', -- 드리밍 샤워  ← 베이지
  '#e8aba1', -- 봄기운 가득  ← 베이지
  '#dcac99', -- 뮤트 쉐이드  (doubt)  ← 베이지
  '#dbaa9b'  -- 트렌치 노트  ← 베이지
);

-- 핑크 — 14칸 (ok 13 · doubt 1) · 기준색 #d89798
--   L* 64~72 · C* 22~35 · h° 8~33   전에는 핑크 12, 코랄 2
UPDATE shade SET family='핑크' WHERE part='shadow' AND hex IN (
  '#dfa099', -- 마이트 러브  ← 핑크
  '#e09d9e', -- 핑크빛 권태기  ← 핑크
  '#de9b9d', -- 핑크 못 잃어  ← 핑크
  '#db9ba2', -- 투게더 베리  ← 핑크
  '#db9a90', -- 가을 종결자  ← 코랄
  '#dc9995', -- 로즈 어페어  ← 핑크
  '#e291a1', -- 파워 쿨로거  ← 핑크
  '#d6979b', -- 가든 플레이  ← 핑크
  '#d09a96', -- 브링크 코드  ← 핑크
  '#d19894', -- 스윗 먼데이  ← 핑크
  '#d5959d', -- 모브였다  ← 핑크
  '#e28f8a', -- 핑존주의  (doubt)  ← 코랄
  '#d39399', -- 피노누아  ← 핑크
  '#ce8a8d'  -- 쿨리티컬  ← 핑크
);

-- 코랄 — 15칸 (ok 12 · doubt 3) · 기준색 #cf9180
--   L* 59~76 · C* 19~33 · h° 31~46   전에는 코랄 11, 누드핑크 4
UPDATE shade SET family='코랄' WHERE part='shadow' AND hex IN (
  '#edab93', -- 세이버 모먼트  ← 코랄
  '#eb9d90', -- 코랄 부심  ← 코랄
  '#e29f8f', -- 코랄찐팬  ← 코랄
  '#dc9f8c', -- 폴링 시즌  ← 코랄
  '#e19990', -- 어바웃 토프  (doubt)  ← 코랄
  '#dd9783', -- 어텀 메이플  ← 코랄
  '#cc9489', -- 덴스 나잇  (doubt)  ← 코랄
  '#d09180', -- 저스트 이너프  ← 코랄
  '#ce917e', -- 노릇한 호구마  ← 코랄
  '#c98b7a', -- 블렌딩 우드  ← 코랄
  '#cb8a7a', -- 봄 산책길  ← 코랄
  '#bd8c7c', -- 봄타는 브라운  ← 누드핑크
  '#b68c80', -- 뉴트럴 센스  ← 누드핑크
  '#bd847b', -- 환승 모브  (doubt)  ← 누드핑크
  '#c27a71'  -- 머츄어 레터  ← 누드핑크
);

-- 로즈브라운 — 11칸 (ok 8 · doubt 3) · 기준색 #a16d69
--   L* 45~57 · C* 19~28 · h° 16~47   전에는 골드 1, 카키브라운 1, 딥브라운 1, 브라운 2, 버건디 2, 로즈 4
UPDATE shade SET family='로즈브라운' WHERE part='shadow' AND hex IN (
  '#b9787a', -- 분위기 있을게  ← 로즈
  '#ae7478', -- 코르크  ← 로즈
  '#ab7579', -- 오르간  ← 로즈
  '#a7715c', -- 로스트 웨이  ← 골드
  '#a56a68', -- 쫀득한 브라우니  (doubt)  ← 로즈
  '#956e62', -- 봄밤  ← 브라운
  '#9e6a59', -- 크런치 모카  ← 카키브라운
  '#96655c', -- 생초콜릿  (doubt)  ← 브라운
  '#99625e', -- 왕밤빵왕밤빵  ← 버건디
  '#8d605d', -- 타임 스위치  ← 딥브라운
  '#8f5d59'  -- 시루시루떡  (doubt)  ← 버건디
);

-- 딥브라운 — 5칸 (ok 3 · doubt 2) · 기준색 #704d48
--   L* 27~42 · C* 14~30 · h° 1~44   전에는 딥브라운 4, 버건디 1
UPDATE shade SET family='딥브라운' WHERE part='shadow' AND hex IN (
  '#815857', -- 당당한 솔로  (doubt)  ← 딥브라운
  '#7c5353', -- 음영박제  (doubt)  ← 딥브라운
  '#785144', -- 웬지 브라운  ← 딥브라운
  '#6b4f48', -- 라스트 토크  ← 딥브라운
  '#682a3f'  -- 메를로  ← 버건디
);

-- ③ 칸이 0개가 된 옛 계열의 기준색을 비운다.
--
-- **지우는 것이 아니라 비우는 것이다** (줄은 그대로 둔다 — color-name.ts 가 아직 이 이름들을 짓는다).
-- 까닭: 저 기준색은 **지금 다른 계열로 옮겨 간 칸들의 중앙값**이다. 칸이 0개인데 기준색이 남아 있으면
-- 앱의 '가까운 색 채우기' 가 그 계열을 후보로 잡고, 뽑히면 제품이 0개라 추천이 빈다.
-- 그대로 두고 재 보니 **96칸 중 14칸**이 칸 0개 계열로 끌려갔다 (베이지 7 · 누드핑크 3 · 로즈 2 · 브라운 1 · 버건디 1).
-- 되찾기 95.8% 가 그만큼 되돌아간다.
--
-- 이 블록을 지우면 옛 기준색이 되살아난다 (되돌리기 쉽게 따로 묶어 둔다).
-- 섀도우에서 '기준색 없는 계열' 이 2개(모브·차콜)에서 14개로 는다 — 숨기는 것이 아니라,
-- **칸이 0개인 계열은 기준색을 뽑을 근거가 없다**는 사실을 그대로 적은 것이다.
-- 앱 쪽(color-name.ts)에서 이 이름들을 섀도우에 안 짓게 하거나, 그 색 칸을 더 모아야 닫힌다.
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='골드';  -- 칸 0개
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='그레이';  -- 칸 0개
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='누드핑크';  -- 칸 0개
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='로즈';  -- 칸 0개
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='버건디';  -- 칸 0개
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='베이지';  -- 칸 0개
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='브라운';  -- 칸 0개
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='오렌지';  -- 칸 0개
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='올리브';  -- 칸 0개
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='카키브라운';  -- 칸 0개
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='퍼플';  -- 칸 0개
UPDATE family SET ref_hex=NULL WHERE part='shadow' AND name='플럼';  -- 칸 0개

-- ④ 다 옮겨졌는지 센다. 96칸이 7계열에만 들어가야 한다 — 하나라도 옛 계열에 남아 있으면 여기서 보인다.
INSERT INTO shade(product_id,code,name,family,part)
SELECT 0,'ZZ','__옮기기 빠진 칸이 있다__','없는계열','shadow'
WHERE (SELECT count(*) FROM shade s JOIN product p ON p.id=s.product_id
       WHERE p.part='shadow' AND s.family IN ('페일핑크','로즈베이지','피치베이지','핑크','코랄','로즈브라운','딥브라운')) <> 96;
-- ↑ 96칸이 아니면 '없는계열' 때문에 FOREIGN KEY 에서 걸려 build.py 가 멈춘다 (일부러 그렇게 뒀다)
