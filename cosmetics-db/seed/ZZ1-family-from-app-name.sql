-- 계열을 **앱이 짓는 이름**으로 붙인다 (2026-10-15 다시 뽑음)
--
-- 앱은 제품을 고를 때 `core/color-name.ts` 의 `describeColor` 가 **지어낸 이름**으로만 찾는다
-- (`core/product-picks.ts` 머리글: "color-name.ts 의 base 이름과 같은 말을 쓴다").
-- 그래서 호수 색을 **앱이 쓰는 그 함수에 그대로 넣어** 나온 이름을 계열로 삼는다.
-- 사람이 금을 긋지 않으므로 **안 맞을 일이 구조적으로 없다.**
--
-- 이 파일은 **맨 뒤에 들어와야 한다** (그래서 이름이 ZZ1 이다). 앞의 어느 파일이 호수를
-- 더하든 여기서 다 덮어쓴다 — 계열 이름을 짓는 길이 **여기 하나뿐**이어야 한다.
-- 2026-10-15 에 볼터치 호수 80개가 들어오면서 이 규칙이 실제로 쓰였다: 그 파일들이
-- 제 나름대로 계열을 적어 뒀는데(한쪽은 앱 규칙을 파이썬으로 옮겨 적고, 한쪽은 '미정'),
-- 여기서 전부 덮어써서 길을 다시 하나로 모았다.
--
-- 입술 규칙이 2026-10-15 에 바뀌었다 (붉은 구역을 밝기·채도로 네 칸으로). 그래서 이 파일도
-- 같이 다시 뽑았다 — **color-name.ts 를 고치면 이 파일도 반드시 다시 뽑아야 한다.**
--
-- ref_hex 는 trust='ok' 호수가 3개 이상인 계열만 다시 뽑는다 (Lab 중앙값).
-- 1~2개로 뽑으면 그 호수 하나가 계열을 대표해 버린다. 못 뽑은 계열은 ZZ2 가 메꾼다.

-- ① 앱 이름 계열을 먼저 넣는다 (호수가 계열을 가리키므로 차례가 중요하다)
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '그레이브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '라이트브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '레드브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '로즈브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '밀크브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '소프트블랙');
INSERT OR IGNORE INTO family(part, name) VALUES ('brow', '애쉬브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '로즈');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '모브');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '베이지핑크');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '코랄');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '피치');
INSERT OR IGNORE INTO family(part, name) VALUES ('cheek', '핑크');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '그레이');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '네이비');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '다크브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '로즈');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '밀크브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '베이지');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '블랙');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '소프트블랙');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '카키');
INSERT OR IGNORE INTO family(part, name) VALUES ('liner', '코랄');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '레드');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '로즈');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '브릭');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '체리');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '코랄');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '플럼');
INSERT OR IGNORE INTO family(part, name) VALUES ('lip', '피치');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '누드핑크');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '딥브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '로즈');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '모브');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '버건디');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '브라운');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '코랄');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '플럼');
INSERT OR IGNORE INTO family(part, name) VALUES ('shadow', '핑크');

-- ② 호수의 계열을 앱 이름으로 (49개가 바뀐다)
UPDATE shade SET family='로즈' WHERE id=1;
UPDATE shade SET family='로즈' WHERE id=2;
UPDATE shade SET family='로즈' WHERE id=3;
UPDATE shade SET family='레드' WHERE id=4;
UPDATE shade SET family='베이지' WHERE id=10;
UPDATE shade SET family='카키' WHERE id=11;
UPDATE shade SET family='베이지' WHERE id=12;
UPDATE shade SET family='베이지' WHERE id=13;
UPDATE shade SET family='베이지' WHERE id=14;
UPDATE shade SET family='베이지' WHERE id=15;
UPDATE shade SET family='코랄' WHERE id=16;
UPDATE shade SET family='코랄' WHERE id=17;
UPDATE shade SET family='로즈' WHERE id=18;
UPDATE shade SET family='베이지' WHERE id=19;
UPDATE shade SET family='베이지' WHERE id=20;
UPDATE shade SET family='브라운' WHERE id=21;
UPDATE shade SET family='밀크브라운' WHERE id=22;
UPDATE shade SET family='그레이' WHERE id=23;
UPDATE shade SET family='밀크브라운' WHERE id=24;
UPDATE shade SET family='소프트블랙' WHERE id=25;
UPDATE shade SET family='브라운' WHERE id=26;
UPDATE shade SET family='블랙' WHERE id=27;
UPDATE shade SET family='브라운' WHERE id=28;
UPDATE shade SET family='브라운' WHERE id=29;
UPDATE shade SET family='브라운' WHERE id=30;
UPDATE shade SET family='밀크브라운' WHERE id=31;
UPDATE shade SET family='밀크브라운' WHERE id=32;
UPDATE shade SET family='피치' WHERE id=33;
UPDATE shade SET family='피치' WHERE id=34;
UPDATE shade SET family='피치' WHERE id=35;
UPDATE shade SET family='플럼' WHERE id=36;
UPDATE shade SET family='로즈브라운' WHERE id=41;
UPDATE shade SET family='그레이브라운' WHERE id=42;
UPDATE shade SET family='애쉬브라운' WHERE id=43;
UPDATE shade SET family='그레이브라운' WHERE id=44;
UPDATE shade SET family='애쉬브라운' WHERE id=45;
UPDATE shade SET family='애쉬브라운' WHERE id=46;
UPDATE shade SET family='레드브라운' WHERE id=47;
UPDATE shade SET family='그레이브라운' WHERE id=48;
UPDATE shade SET family='밀크브라운' WHERE id=49;
UPDATE shade SET family='라이트브라운' WHERE id=50;
UPDATE shade SET family='레드브라운' WHERE id=51;
UPDATE shade SET family='코랄' WHERE id=52;
UPDATE shade SET family='코랄' WHERE id=53;
UPDATE shade SET family='코랄' WHERE id=54;
UPDATE shade SET family='로즈' WHERE id=55;
UPDATE shade SET family='핑크' WHERE id=56;
UPDATE shade SET family='모브' WHERE id=57;
UPDATE shade SET family='핑크' WHERE id=58;
UPDATE shade SET family='핑크' WHERE id=59;
UPDATE shade SET family='로즈' WHERE id=60;
UPDATE shade SET family='로즈' WHERE id=61;
UPDATE shade SET family='모브' WHERE id=62;
UPDATE shade SET family='소프트블랙' WHERE id=63;
UPDATE shade SET family='브라운' WHERE id=64;
UPDATE shade SET family='브라운' WHERE id=65;
UPDATE shade SET family='베이지' WHERE id=66;
UPDATE shade SET family='베이지' WHERE id=67;
UPDATE shade SET family='피치' WHERE id=68;
UPDATE shade SET family='레드' WHERE id=69;
UPDATE shade SET family='피치' WHERE id=70;
UPDATE shade SET family='레드' WHERE id=71;
UPDATE shade SET family='코랄' WHERE id=72;
UPDATE shade SET family='체리' WHERE id=73;
UPDATE shade SET family='코랄' WHERE id=74;
UPDATE shade SET family='레드' WHERE id=75;
UPDATE shade SET family='레드' WHERE id=76;
UPDATE shade SET family='코랄' WHERE id=77;
UPDATE shade SET family='피치' WHERE id=78;
UPDATE shade SET family='코랄' WHERE id=79;
UPDATE shade SET family='로즈' WHERE id=80;
UPDATE shade SET family='로즈' WHERE id=81;
UPDATE shade SET family='코랄' WHERE id=82;
UPDATE shade SET family='코랄' WHERE id=83;
UPDATE shade SET family='로즈' WHERE id=84;
UPDATE shade SET family='로즈' WHERE id=85;
UPDATE shade SET family='브릭' WHERE id=86;
UPDATE shade SET family='로즈' WHERE id=87;
UPDATE shade SET family='레드' WHERE id=88;
UPDATE shade SET family='베이지핑크' WHERE id=89;
UPDATE shade SET family='코랄' WHERE id=90;
UPDATE shade SET family='베이지핑크' WHERE id=91;
UPDATE shade SET family='베이지핑크' WHERE id=92;
UPDATE shade SET family='브라운' WHERE id=93;
UPDATE shade SET family='브라운' WHERE id=94;
UPDATE shade SET family='코랄' WHERE id=95;
UPDATE shade SET family='브라운' WHERE id=96;
UPDATE shade SET family='코랄' WHERE id=97;
UPDATE shade SET family='브라운' WHERE id=98;
UPDATE shade SET family='브라운' WHERE id=99;
UPDATE shade SET family='브라운' WHERE id=100;
UPDATE shade SET family='브라운' WHERE id=101;
UPDATE shade SET family='브라운' WHERE id=102;
UPDATE shade SET family='브라운' WHERE id=103;
UPDATE shade SET family='딥브라운' WHERE id=104;
UPDATE shade SET family='브라운' WHERE id=105;
UPDATE shade SET family='브라운' WHERE id=106;
UPDATE shade SET family='브라운' WHERE id=107;
UPDATE shade SET family='브라운' WHERE id=108;
UPDATE shade SET family='브라운' WHERE id=109;
UPDATE shade SET family='코랄' WHERE id=110;
UPDATE shade SET family='누드핑크' WHERE id=111;
UPDATE shade SET family='로즈' WHERE id=112;
UPDATE shade SET family='로즈' WHERE id=113;
UPDATE shade SET family='코랄' WHERE id=114;
UPDATE shade SET family='딥브라운' WHERE id=115;
UPDATE shade SET family='브라운' WHERE id=116;
UPDATE shade SET family='누드핑크' WHERE id=117;
UPDATE shade SET family='브라운' WHERE id=118;
UPDATE shade SET family='브라운' WHERE id=119;
UPDATE shade SET family='로즈' WHERE id=120;
UPDATE shade SET family='브라운' WHERE id=121;
UPDATE shade SET family='딥브라운' WHERE id=122;
UPDATE shade SET family='누드핑크' WHERE id=123;
UPDATE shade SET family='누드핑크' WHERE id=124;
UPDATE shade SET family='핑크' WHERE id=125;
UPDATE shade SET family='핑크' WHERE id=126;
UPDATE shade SET family='로즈' WHERE id=127;
UPDATE shade SET family='모브' WHERE id=128;
UPDATE shade SET family='브라운' WHERE id=129;
UPDATE shade SET family='브라운' WHERE id=130;
UPDATE shade SET family='브라운' WHERE id=131;
UPDATE shade SET family='브라운' WHERE id=132;
UPDATE shade SET family='브라운' WHERE id=133;
UPDATE shade SET family='브라운' WHERE id=134;
UPDATE shade SET family='브라운' WHERE id=135;
UPDATE shade SET family='딥브라운' WHERE id=136;
UPDATE shade SET family='브라운' WHERE id=137;
UPDATE shade SET family='누드핑크' WHERE id=138;
UPDATE shade SET family='로즈' WHERE id=139;
UPDATE shade SET family='핑크' WHERE id=140;
UPDATE shade SET family='핑크' WHERE id=141;
UPDATE shade SET family='로즈' WHERE id=142;
UPDATE shade SET family='브라운' WHERE id=143;
UPDATE shade SET family='모브' WHERE id=144;
UPDATE shade SET family='브라운' WHERE id=145;
UPDATE shade SET family='브라운' WHERE id=146;
UPDATE shade SET family='브라운' WHERE id=147;
UPDATE shade SET family='브라운' WHERE id=148;
UPDATE shade SET family='코랄' WHERE id=149;
UPDATE shade SET family='로즈' WHERE id=150;
UPDATE shade SET family='브라운' WHERE id=151;
UPDATE shade SET family='딥브라운' WHERE id=152;
UPDATE shade SET family='누드핑크' WHERE id=153;
UPDATE shade SET family='핑크' WHERE id=154;
UPDATE shade SET family='핑크' WHERE id=155;
UPDATE shade SET family='핑크' WHERE id=156;
UPDATE shade SET family='핑크' WHERE id=157;
UPDATE shade SET family='핑크' WHERE id=158;
UPDATE shade SET family='로즈' WHERE id=159;
UPDATE shade SET family='모브' WHERE id=160;
UPDATE shade SET family='브라운' WHERE id=161;
UPDATE shade SET family='브라운' WHERE id=162;
UPDATE shade SET family='누드핑크' WHERE id=163;
UPDATE shade SET family='브라운' WHERE id=164;
UPDATE shade SET family='로즈' WHERE id=165;
UPDATE shade SET family='브라운' WHERE id=166;
UPDATE shade SET family='버건디' WHERE id=167;
UPDATE shade SET family='버건디' WHERE id=168;
UPDATE shade SET family='레드브라운' WHERE id=169;
UPDATE shade SET family='애쉬브라운' WHERE id=170;
UPDATE shade SET family='브라운' WHERE id=171;
UPDATE shade SET family='그레이브라운' WHERE id=172;
UPDATE shade SET family='그레이브라운' WHERE id=173;
UPDATE shade SET family='소프트블랙' WHERE id=174;
UPDATE shade SET family='누드핑크' WHERE id=175;
UPDATE shade SET family='누드핑크' WHERE id=176;
UPDATE shade SET family='누드핑크' WHERE id=177;
UPDATE shade SET family='핑크' WHERE id=178;
UPDATE shade SET family='로즈' WHERE id=179;
UPDATE shade SET family='핑크' WHERE id=180;
UPDATE shade SET family='로즈' WHERE id=181;
UPDATE shade SET family='버건디' WHERE id=182;
UPDATE shade SET family='핑크' WHERE id=183;
UPDATE shade SET family='핑크' WHERE id=184;
UPDATE shade SET family='핑크' WHERE id=185;
UPDATE shade SET family='플럼' WHERE id=186;
UPDATE shade SET family='핑크' WHERE id=187;
UPDATE shade SET family='로즈' WHERE id=188;
UPDATE shade SET family='핑크' WHERE id=189;
UPDATE shade SET family='핑크' WHERE id=190;
UPDATE shade SET family='핑크' WHERE id=191;
UPDATE shade SET family='핑크' WHERE id=192;
UPDATE shade SET family='로즈' WHERE id=193;
UPDATE shade SET family='로즈' WHERE id=194;
UPDATE shade SET family='그레이브라운' WHERE id=195;
UPDATE shade SET family='라이트브라운' WHERE id=196;
UPDATE shade SET family='라이트브라운' WHERE id=197;
UPDATE shade SET family='라이트브라운' WHERE id=198;
UPDATE shade SET family='애쉬브라운' WHERE id=199;
UPDATE shade SET family='라이트브라운' WHERE id=200;
UPDATE shade SET family='레드브라운' WHERE id=201;
UPDATE shade SET family='라이트브라운' WHERE id=202;
UPDATE shade SET family='밀크브라운' WHERE id=203;
UPDATE shade SET family='라이트브라운' WHERE id=204;
UPDATE shade SET family='라이트브라운' WHERE id=205;
UPDATE shade SET family='레드브라운' WHERE id=206;
UPDATE shade SET family='라이트브라운' WHERE id=207;
UPDATE shade SET family='라이트브라운' WHERE id=208;
UPDATE shade SET family='피치' WHERE id=1001;
UPDATE shade SET family='모브' WHERE id=1002;
UPDATE shade SET family='모브' WHERE id=1003;
UPDATE shade SET family='모브' WHERE id=1004;
UPDATE shade SET family='베이지핑크' WHERE id=1005;
UPDATE shade SET family='베이지핑크' WHERE id=1006;
UPDATE shade SET family='모브' WHERE id=1007;
UPDATE shade SET family='베이지핑크' WHERE id=1008;
UPDATE shade SET family='베이지핑크' WHERE id=1009;
UPDATE shade SET family='베이지핑크' WHERE id=1010;
UPDATE shade SET family='핑크' WHERE id=1011;
UPDATE shade SET family='핑크' WHERE id=1012;
UPDATE shade SET family='핑크' WHERE id=1013;
UPDATE shade SET family='핑크' WHERE id=1014;
UPDATE shade SET family='핑크' WHERE id=1015;
UPDATE shade SET family='모브' WHERE id=1016;
UPDATE shade SET family='코랄' WHERE id=1017;
UPDATE shade SET family='코랄' WHERE id=2001;
UPDATE shade SET family='로즈' WHERE id=2002;
UPDATE shade SET family='로즈' WHERE id=2003;
UPDATE shade SET family='로즈' WHERE id=2004;
UPDATE shade SET family='코랄' WHERE id=2005;
UPDATE shade SET family='로즈' WHERE id=2006;
UPDATE shade SET family='코랄' WHERE id=2007;
UPDATE shade SET family='코랄' WHERE id=2008;
UPDATE shade SET family='로즈' WHERE id=2009;
UPDATE shade SET family='모브' WHERE id=2011;
UPDATE shade SET family='핑크' WHERE id=2012;
UPDATE shade SET family='로즈' WHERE id=2013;
UPDATE shade SET family='코랄' WHERE id=2014;
UPDATE shade SET family='코랄' WHERE id=2015;
UPDATE shade SET family='모브' WHERE id=2016;
UPDATE shade SET family='로즈' WHERE id=2017;
UPDATE shade SET family='코랄' WHERE id=2021;
UPDATE shade SET family='핑크' WHERE id=2022;
UPDATE shade SET family='로즈' WHERE id=2023;
UPDATE shade SET family='로즈' WHERE id=2024;
UPDATE shade SET family='핑크' WHERE id=2025;
UPDATE shade SET family='모브' WHERE id=2026;
UPDATE shade SET family='코랄' WHERE id=2027;
UPDATE shade SET family='핑크' WHERE id=2028;
UPDATE shade SET family='모브' WHERE id=2029;
UPDATE shade SET family='모브' WHERE id=2030;
UPDATE shade SET family='모브' WHERE id=2031;
UPDATE shade SET family='코랄' WHERE id=2032;
UPDATE shade SET family='코랄' WHERE id=2033;
UPDATE shade SET family='모브' WHERE id=2034;
UPDATE shade SET family='로즈' WHERE id=2035;
UPDATE shade SET family='핑크' WHERE id=2036;
UPDATE shade SET family='핑크' WHERE id=2037;
UPDATE shade SET family='로즈' WHERE id=2038;
UPDATE shade SET family='핑크' WHERE id=2039;
UPDATE shade SET family='코랄' WHERE id=2041;
UPDATE shade SET family='모브' WHERE id=2042;
UPDATE shade SET family='코랄' WHERE id=2043;
UPDATE shade SET family='코랄' WHERE id=2044;
UPDATE shade SET family='로즈' WHERE id=2045;
UPDATE shade SET family='로즈' WHERE id=2046;
UPDATE shade SET family='모브' WHERE id=2047;
UPDATE shade SET family='핑크' WHERE id=2048;
UPDATE shade SET family='코랄' WHERE id=2049;
UPDATE shade SET family='베이지핑크' WHERE id=2050;
UPDATE shade SET family='모브' WHERE id=2051;
UPDATE shade SET family='코랄' WHERE id=2052;
UPDATE shade SET family='코랄' WHERE id=2053;
UPDATE shade SET family='베이지핑크' WHERE id=2054;
UPDATE shade SET family='코랄' WHERE id=2055;
UPDATE shade SET family='베이지핑크' WHERE id=2056;
UPDATE shade SET family='코랄' WHERE id=2057;
UPDATE shade SET family='베이지핑크' WHERE id=2058;
UPDATE shade SET family='베이지핑크' WHERE id=2059;
UPDATE shade SET family='베이지핑크' WHERE id=2060;
UPDATE shade SET family='베이지핑크' WHERE id=2071;
UPDATE shade SET family='모브' WHERE id=2072;
UPDATE shade SET family='모브' WHERE id=2073;
UPDATE shade SET family='베이지핑크' WHERE id=2074;
UPDATE shade SET family='모브' WHERE id=2075;
UPDATE shade SET family='피치' WHERE id=2076;
UPDATE shade SET family='모브' WHERE id=2077;
UPDATE shade SET family='모브' WHERE id=2078;
UPDATE shade SET family='그레이' WHERE id=3001;
UPDATE shade SET family='밀크브라운' WHERE id=3002;  -- 브라운 → 밀크브라운
UPDATE shade SET family='밀크브라운' WHERE id=3003;  -- 브라운 → 밀크브라운
UPDATE shade SET family='브라운' WHERE id=3004;  -- 로즈 → 브라운
UPDATE shade SET family='베이지' WHERE id=3005;
UPDATE shade SET family='베이지' WHERE id=3006;
UPDATE shade SET family='브라운' WHERE id=3007;  -- 베이지 → 브라운
UPDATE shade SET family='베이지' WHERE id=3011;
UPDATE shade SET family='밀크브라운' WHERE id=3012;
UPDATE shade SET family='밀크브라운' WHERE id=3013;  -- 브라운 → 밀크브라운
UPDATE shade SET family='브라운' WHERE id=3014;
UPDATE shade SET family='브라운' WHERE id=3015;  -- 로즈 → 브라운
UPDATE shade SET family='브라운' WHERE id=3016;  -- 로즈 → 브라운
UPDATE shade SET family='브라운' WHERE id=3017;  -- 로즈 → 브라운
UPDATE shade SET family='로즈' WHERE id=3018;  -- 그레이 → 로즈
UPDATE shade SET family='베이지' WHERE id=3019;
UPDATE shade SET family='베이지' WHERE id=3020;  -- 코랄 → 베이지
UPDATE shade SET family='베이지' WHERE id=3021;  -- 코랄 → 베이지
UPDATE shade SET family='밀크브라운' WHERE id=3022;
UPDATE shade SET family='베이지' WHERE id=3023;  -- 밀크브라운 → 베이지
UPDATE shade SET family='베이지' WHERE id=3024;  -- 밀크브라운 → 베이지
UPDATE shade SET family='밀크브라운' WHERE id=3025;  -- 브라운 → 밀크브라운
UPDATE shade SET family='소프트블랙' WHERE id=3026;  -- 블랙 → 소프트블랙
UPDATE shade SET family='브라운' WHERE id=3027;  -- 로즈 → 브라운
UPDATE shade SET family='코랄' WHERE id=3028;  -- 로즈 → 코랄
UPDATE shade SET family='로즈' WHERE id=3029;
UPDATE shade SET family='네이비' WHERE id=3030;  -- 블랙 → 네이비
UPDATE shade SET family='베이지' WHERE id=3031;  -- 코랄 → 베이지
UPDATE shade SET family='베이지' WHERE id=3032;  -- 코랄 → 베이지
UPDATE shade SET family='밀크브라운' WHERE id=3033;  -- 코랄 → 밀크브라운
UPDATE shade SET family='다크브라운' WHERE id=3034;  -- 브라운 → 다크브라운
UPDATE shade SET family='밀크브라운' WHERE id=3035;  -- 브라운 → 밀크브라운
UPDATE shade SET family='베이지' WHERE id=3036;  -- 밀크브라운 → 베이지
UPDATE shade SET family='소프트블랙' WHERE id=3037;  -- 블랙 → 소프트블랙
UPDATE shade SET family='브라운' WHERE id=3038;
UPDATE shade SET family='소프트블랙' WHERE id=3039;  -- 블랙 → 소프트블랙
UPDATE shade SET family='브라운' WHERE id=3040;
UPDATE shade SET family='그레이' WHERE id=3041;
UPDATE shade SET family='그레이' WHERE id=3042;
UPDATE shade SET family='베이지' WHERE id=3043;
UPDATE shade SET family='베이지' WHERE id=4001;  -- 코랄 → 베이지
UPDATE shade SET family='브라운' WHERE id=4002;  -- 로즈 → 브라운
UPDATE shade SET family='베이지' WHERE id=4003;
UPDATE shade SET family='코랄' WHERE id=4004;
UPDATE shade SET family='로즈' WHERE id=4005;
UPDATE shade SET family='베이지' WHERE id=4006;  -- 밀크브라운 → 베이지
UPDATE shade SET family='코랄' WHERE id=4007;  -- 로즈 → 코랄
UPDATE shade SET family='코랄' WHERE id=4008;  -- 로즈 → 코랄
UPDATE shade SET family='코랄' WHERE id=4009;
UPDATE shade SET family='로즈' WHERE id=4010;
UPDATE shade SET family='브라운' WHERE id=4011;  -- 로즈 → 브라운
UPDATE shade SET family='로즈' WHERE id=4012;
UPDATE shade SET family='브라운' WHERE id=4013;  -- 밀크브라운 → 브라운
UPDATE shade SET family='그레이' WHERE id=4014;
UPDATE shade SET family='카키' WHERE id=4015;  -- 브라운 → 카키
UPDATE shade SET family='카키' WHERE id=4016;  -- 밀크브라운 → 카키
UPDATE shade SET family='블랙' WHERE id=4017;
UPDATE shade SET family='다크브라운' WHERE id=4018;  -- 브라운 → 다크브라운
UPDATE shade SET family='다크브라운' WHERE id=4019;  -- 소프트블랙 → 다크브라운
UPDATE shade SET family='다크브라운' WHERE id=4020;  -- 브라운 → 다크브라운
UPDATE shade SET family='브라운' WHERE id=4021;
UPDATE shade SET family='브라운' WHERE id=4022;
UPDATE shade SET family='블랙' WHERE id=4023;
UPDATE shade SET family='다크브라운' WHERE id=4024;  -- 브라운 → 다크브라운
UPDATE shade SET family='밀크브라운' WHERE id=4025;  -- 브라운 → 밀크브라운
UPDATE shade SET family='소프트블랙' WHERE id=4026;  -- 블랙 → 소프트블랙
UPDATE shade SET family='로즈' WHERE id=4027;
UPDATE shade SET family='브라운' WHERE id=4028;
UPDATE shade SET family='밀크브라운' WHERE id=4029;
UPDATE shade SET family='브라운' WHERE id=4030;  -- 로즈 → 브라운
UPDATE shade SET family='베이지' WHERE id=4031;
UPDATE shade SET family='베이지' WHERE id=4032;  -- 로즈 → 베이지
UPDATE shade SET family='베이지' WHERE id=4033;
UPDATE shade SET family='밀크브라운' WHERE id=4034;
UPDATE shade SET family='브라운' WHERE id=4035;
UPDATE shade SET family='브라운' WHERE id=4036;
UPDATE shade SET family='다크브라운' WHERE id=4037;  -- 소프트블랙 → 다크브라운
UPDATE shade SET family='소프트블랙' WHERE id=4038;
UPDATE shade SET family='브라운' WHERE id=4039;
UPDATE shade SET family='밀크브라운' WHERE id=4040;  -- 브라운 → 밀크브라운
UPDATE shade SET family='브라운' WHERE id=4041;  -- 로즈 → 브라운
UPDATE shade SET family='밀크브라운' WHERE id=4042;
UPDATE shade SET family='베이지' WHERE id=4043;  -- 코랄 → 베이지
UPDATE shade SET family='코랄' WHERE id=4044;  -- 로즈 → 코랄
UPDATE shade SET family='블랙' WHERE id=4045;
UPDATE shade SET family='다크브라운' WHERE id=4046;  -- 브라운 → 다크브라운

-- ③ 계열 기준색을 호수에서 다시 뽑는다 (trust='ok' 3개 이상)
UPDATE family SET ref_hex='#433d3b' WHERE part='brow' AND name='그레이브라운';  -- 호수 5개
UPDATE family SET ref_hex='#9d8171' WHERE part='brow' AND name='라이트브라운';  -- 호수 9개
UPDATE family SET ref_hex='#a1776f' WHERE part='brow' AND name='레드브라운';  -- 호수 5개
-- brow 로즈브라운: trust='ok' 가 0개뿐이라 안 뽑는다 (호수 1개) — ZZ2 가 메꾼다
-- brow 밀크브라운: trust='ok' 가 2개뿐이라 안 뽑는다 (호수 2개) — ZZ2 가 메꾼다
-- brow 브라운: trust='ok' 가 1개뿐이라 안 뽑는다 (호수 1개) — ZZ2 가 메꾼다
-- brow 소프트블랙: trust='ok' 가 1개뿐이라 안 뽑는다 (호수 1개) — ZZ2 가 메꾼다
UPDATE family SET ref_hex='#604f49' WHERE part='brow' AND name='애쉬브라운';  -- 호수 5개
UPDATE family SET ref_hex='#efb6bb' WHERE part='cheek' AND name='로즈';  -- 호수 14개
UPDATE family SET ref_hex='#efbcb8' WHERE part='cheek' AND name='모브';  -- 호수 13개
UPDATE family SET ref_hex='#f2b8a9' WHERE part='cheek' AND name='베이지핑크';  -- 호수 9개
UPDATE family SET ref_hex='#f4b7b3' WHERE part='cheek' AND name='코랄';  -- 호수 18개
-- cheek 피치: trust='ok' 가 0개뿐이라 안 뽑는다 (호수 2개) — ZZ2 가 메꾼다
UPDATE family SET ref_hex='#f7c1c8' WHERE part='cheek' AND name='핑크';  -- 호수 9개
UPDATE family SET ref_hex='#6c6562' WHERE part='liner' AND name='그레이';  -- 호수 3개
-- liner 네이비: trust='ok' 가 1개뿐이라 안 뽑는다 (호수 1개) — ZZ2 가 메꾼다
UPDATE family SET ref_hex='#3a261e' WHERE part='liner' AND name='다크브라운';  -- 호수 6개
UPDATE family SET ref_hex='#a5717f' WHERE part='liner' AND name='로즈';  -- 호수 7개
UPDATE family SET ref_hex='#885d49' WHERE part='liner' AND name='밀크브라운';  -- 호수 13개
UPDATE family SET ref_hex='#ddb1a1' WHERE part='liner' AND name='베이지';  -- 호수 23개
UPDATE family SET ref_hex='#72534f' WHERE part='liner' AND name='브라운';  -- 호수 25개
-- liner 블랙: trust='ok' 가 1개뿐이라 안 뽑는다 (호수 4개) — ZZ2 가 메꾼다
UPDATE family SET ref_hex='#201e1f' WHERE part='liner' AND name='소프트블랙';  -- 호수 6개
UPDATE family SET ref_hex='#96816d' WHERE part='liner' AND name='카키';  -- 호수 3개
UPDATE family SET ref_hex='#d78989' WHERE part='liner' AND name='코랄';  -- 호수 6개
UPDATE family SET ref_hex='#c9595a' WHERE part='lip' AND name='레드';  -- 호수 6개
UPDATE family SET ref_hex='#c56a6d' WHERE part='lip' AND name='로즈';  -- 호수 8개
-- lip 브릭: trust='ok' 가 1개뿐이라 안 뽑는다 (호수 1개) — ZZ2 가 메꾼다
-- lip 체리: trust='ok' 가 1개뿐이라 안 뽑는다 (호수 1개) — ZZ2 가 메꾼다
UPDATE family SET ref_hex='#e46f6a' WHERE part='lip' AND name='코랄';  -- 호수 6개
-- lip 플럼: trust='ok' 가 0개뿐이라 안 뽑는다 (호수 1개) — ZZ2 가 메꾼다
UPDATE family SET ref_hex='#e18481' WHERE part='lip' AND name='피치';  -- 호수 6개
UPDATE family SET ref_hex='#e6b6b5' WHERE part='shadow' AND name='누드핑크';  -- 호수 7개
UPDATE family SET ref_hex='#865f53' WHERE part='shadow' AND name='딥브라운';  -- 호수 4개
UPDATE family SET ref_hex='#d69596' WHERE part='shadow' AND name='로즈';  -- 호수 11개
-- shadow 모브: trust='ok' 가 1개뿐이라 안 뽑는다 (호수 3개) — ZZ2 가 메꾼다
-- shadow 버건디: trust='ok' 가 1개뿐이라 안 뽑는다 (호수 3개) — ZZ2 가 메꾼다
UPDATE family SET ref_hex='#e0a899' WHERE part='shadow' AND name='브라운';  -- 호수 21개
UPDATE family SET ref_hex='#e49a89' WHERE part='shadow' AND name='코랄';  -- 호수 4개
-- shadow 플럼: trust='ok' 가 1개뿐이라 안 뽑는다 (호수 1개) — ZZ2 가 메꾼다
UPDATE family SET ref_hex='#dcaaaf' WHERE part='shadow' AND name='핑크';  -- 호수 15개

-- ④ 호수가 하나도 없는 계열은 지운다 — 앱이 안 만드는 이름이라 영영 안 쓰인다
DELETE FROM family WHERE NOT EXISTS (SELECT 1 FROM shade s WHERE s.part=family.part AND s.family=family.name);
