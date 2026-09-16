// 룩 템플릿 10개 (POC용 초안 — 팀에서 확정 예정). 각 룩은 눈썹·아이라이너·섀도우·입술·볼터치 5부위만 담고, 쉐딩·하이라이트는 얼굴형 규칙(faceShape.js)으로 만든다.
// parts: 가상 화장(synth) 파라미터. products: 화면 2 제품 목록(접기 없음). rationale: 화면 3 근거 한 줄(숫자 없음).

const P = (id, name, parts, products, rationale) => ({ id, name, parts, products, rationale });
const CLR = { black: [22, 14, 14], brown: [70, 42, 30], rose: [200, 80, 100], red: [185, 35, 55], coral: [230, 110, 90], mlbb: [190, 110, 110], peach: [240, 150, 120], pink: [235, 90, 120], plum: [150, 60, 100], taupe: [150, 120, 105], bronze: [160, 105, 70], mauve: [170, 110, 130], warm: [200, 150, 110], gray: [110, 100, 100] };

export const LOOKS = [
  P('daily', '데일리 내추럴', { brow: { alpha: 0.45 }, liner: { thick: 0.8, alpha: 0.75, color: CLR.brown }, shadow: { alphaR: 0.4, alphaL: 0.4, color: CLR.taupe }, lip: { alpha: 0.5, color: CLR.mlbb }, cheek: { alphaR: 0.3, alphaL: 0.3, color: CLR.peach } },
    ['눈썹 · 브라운 펜슬', '눈 · 브라운 젤 라이너', '눈 · 토프 섀도우 (매트)', '입술 · MLBB 립', '볼 · 피치 블러셔'],
    { brow: '원래 결을 따라 빈 곳만 채우세요', liner: '속눈썹 사이만 채우고 꼬리는 짧게', shadow: '눈두덩 전체에 옅게, 눈꼬리 쪽만 조금 더', lip: '입술 선 안쪽으로만 채우세요', cheek: '광대 가운데에 둥글게 옅게' }),
  P('smoky', '스모키', { brow: { alpha: 0.55 }, liner: { thick: 1.4, alpha: 0.95, color: CLR.black }, shadow: { alphaR: 0.55, alphaL: 0.55, color: CLR.gray }, lip: { alpha: 0.45, color: CLR.mlbb }, cheek: { alphaR: 0.3, alphaL: 0.3, color: CLR.peach } },
    ['눈썹 · 다크 브라운 펜슬', '눈 · 블랙 젤 라이너 + 각진 브러시', '눈 · 다크 그레이 섀도우 (매트)', '입술 · 누드 립', '볼 · 피치 블러셔'],
    { brow: '눈썹 산을 살짝 각지게', liner: '눈꼬리를 살짝 올려 짧게 빼세요', shadow: '눈꼬리 쪽으로 갈수록 진하게', lip: '입술은 옅게, 눈이 주인공', cheek: '볼은 아주 옅게만' }),
  P('coral', '코랄 데이트', { brow: { alpha: 0.45 }, liner: { thick: 1.0, alpha: 0.85, color: CLR.brown }, shadow: { alphaR: 0.4, alphaL: 0.4, color: CLR.warm }, lip: { alpha: 0.55, color: CLR.coral }, cheek: { alphaR: 0.4, alphaL: 0.4, color: CLR.coral } },
    ['눈썹 · 브라운 펜슬', '눈 · 브라운 라이너', '눈 · 웜 오렌지 섀도우', '입술 · 코랄 틴트', '볼 · 코랄 블러셔'],
    { brow: '결을 따라 자연스럽게', liner: '꼬리를 눈매 따라 살짝만', shadow: '눈두덩 안쪽은 밝게, 바깥쪽은 따뜻하게', lip: '입술 중앙부터 바깥으로 번지듯', cheek: '광대 위에서 관자놀이 쪽으로' }),
  P('rose', '로즈 포멀', { brow: { alpha: 0.5 }, liner: { thick: 1.1, alpha: 0.9, color: CLR.black }, shadow: { alphaR: 0.42, alphaL: 0.42, color: CLR.mauve }, lip: { alpha: 0.6, color: CLR.rose }, cheek: { alphaR: 0.35, alphaL: 0.35, color: CLR.pink } },
    ['눈썹 · 브라운 펜슬', '눈 · 블랙 리퀴드 라이너', '눈 · 모브 섀도우', '입술 · 로즈 립스틱', '볼 · 핑크 블러셔'],
    { brow: '눈썹 앞머리는 옅게, 꼬리는 또렷하게', liner: '눈 앞머리부터 꼬리까지 얇게 이어서', shadow: '쌍꺼풀 라인 위로 부드럽게', lip: '입술 선을 또렷하게', cheek: '광대 위에 둥글게' }),
  P('red', '레드 립 클래식', { brow: { alpha: 0.5 }, liner: { thick: 1.2, alpha: 0.95, color: CLR.black }, shadow: { alphaR: 0.4, alphaL: 0.4, color: CLR.taupe }, lip: { alpha: 0.75, color: CLR.red }, cheek: { alphaR: 0.3, alphaL: 0.3, color: CLR.pink } },
    ['눈썹 · 다크 브라운 펜슬', '눈 · 블랙 리퀴드 라이너', '눈 · 토프 섀도우', '입술 · 레드 립스틱 + 립 브러시', '볼 · 핑크 블러셔'],
    { brow: '눈썹은 단정하게', liner: '얇고 길게, 꼬리는 수평에 가깝게', shadow: '섀도우는 최소한으로', lip: '입술 선을 정확히, 경계 밖으로 나가지 않게', cheek: '볼은 옅게' }),
  P('peach', '피치 글로우', { brow: { alpha: 0.4 }, liner: { thick: 0.8, alpha: 0.7, color: CLR.brown }, shadow: { alphaR: 0.4, alphaL: 0.4, color: CLR.peach }, lip: { alpha: 0.45, color: CLR.peach }, cheek: { alphaR: 0.42, alphaL: 0.42, color: CLR.peach } },
    ['눈썹 · 라이트 브라운 펜슬', '눈 · 브라운 라이너', '눈 · 피치 섀도우 (시머)', '입술 · 피치 틴트', '볼 · 피치 블러셔'],
    { brow: '가볍게 결만 정리', liner: '속눈썹 사이만', shadow: '눈두덩 전체에 은은하게', lip: '입술 안쪽 위주로', cheek: '광대에서 눈 밑까지 넓게 옅게' }),
  P('bronze', '브론즈 선셋', { brow: { alpha: 0.5 }, liner: { thick: 1.1, alpha: 0.9, color: CLR.brown }, shadow: { alphaR: 0.5, alphaL: 0.5, color: CLR.bronze }, lip: { alpha: 0.45, color: CLR.warm }, cheek: { alphaR: 0.35, alphaL: 0.35, color: CLR.bronze } },
    ['눈썹 · 브라운 펜슬', '눈 · 브라운 젤 라이너', '눈 · 브론즈 섀도우 (시머)', '입술 · 브라운 누드 립', '볼 · 브론저'],
    { brow: '눈썹 꼬리를 조금 길게', liner: '눈꼬리를 따라 자연스럽게', shadow: '눈꼬리 쪽 진하게, 안쪽은 밝게', lip: '입술 전체에 고르게', cheek: '광대 아래에서 위로 쓸어 올리듯' }),
  P('plum', '플럼 이브닝', { brow: { alpha: 0.55 }, liner: { thick: 1.3, alpha: 0.95, color: CLR.black }, shadow: { alphaR: 0.5, alphaL: 0.5, color: CLR.plum }, lip: { alpha: 0.65, color: CLR.plum }, cheek: { alphaR: 0.3, alphaL: 0.3, color: CLR.mauve } },
    ['눈썹 · 다크 브라운 펜슬', '눈 · 블랙 젤 라이너', '눈 · 플럼 섀도우', '입술 · 플럼 립스틱', '볼 · 모브 블러셔'],
    { brow: '눈썹을 또렷하게', liner: '꼬리를 조금 길게 위로', shadow: '눈꼬리 쪽으로 깊게', lip: '입술 선까지 꽉 채우세요', cheek: '광대 위에 옅게' }),
  P('clean', '클린 오피스', { brow: { alpha: 0.45 }, liner: { thick: 0.9, alpha: 0.8, color: CLR.brown }, shadow: { alphaR: 0.4, alphaL: 0.4, color: CLR.taupe }, lip: { alpha: 0.5, color: CLR.mlbb }, cheek: { alphaR: 0.3, alphaL: 0.3, color: CLR.pink } },
    ['눈썹 · 브라운 펜슬', '눈 · 브라운 라이너', '눈 · 토프 섀도우 (매트)', '입술 · MLBB 립', '볼 · 핑크 블러셔'],
    { brow: '눈썹 결 정리 위주', liner: '속눈썹 사이 채우고 꼬리는 아주 짧게', shadow: '옅게 한 톤만', lip: '입술 선 안쪽으로', cheek: '광대 가운데 옅게' }),
  P('doll', '돌리 핑크', { brow: { alpha: 0.4 }, liner: { thick: 1.0, alpha: 0.9, color: CLR.brown, angleR: 5, angleL: 5 }, shadow: { alphaR: 0.4, alphaL: 0.4, color: CLR.pink }, lip: { alpha: 0.5, color: CLR.pink }, cheek: { alphaR: 0.45, alphaL: 0.45, color: CLR.pink } },
    ['눈썹 · 라이트 브라운 펜슬', '눈 · 브라운 라이너', '눈 · 핑크 섀도우 (시머)', '입술 · 핑크 틴트', '볼 · 핑크 블러셔'],
    { brow: '눈썹은 둥글고 옅게', liner: '꼬리를 아래로 살짝 내려 순하게', shadow: '눈두덩과 애교살에 핑크', lip: '입술 중앙에 진하게, 바깥은 번지듯', cheek: '눈 밑 가까이 둥글게 진하게' }),
];
export const LOOK_PART_ORDER = ['brow', 'liner', 'shadow', 'lip', 'cheek'];
export function lookById(id) { return LOOKS.find((l) => l.id === id) || LOOKS[0]; }

/** 쉐딩·하이라이트: 룩과 무관, 얼굴형 규칙. 완성본 멘트 한 줄(얼굴형이 드러나는 유일한 곳) + 제품 */
export const CONTOUR_PRODUCTS = ['쉐딩 · 컨투어 파우더', '하이라이트 · 하이라이터', '브러시 · 사선 브러시'];
export const CONTOUR_RATIONALE = {
  round: '둥근 얼굴형이라 턱선과 광대 아래에 쉐딩을, 광대 위에 하이라이트를 넣었어요',
  oval: '계란형이라 광대 아래에만 살짝 쉐딩을, 광대 위와 콧대에 하이라이트를 넣었어요',
  square: '각진 얼굴형이라 턱 모서리와 광대 아래에 쉐딩을, 이마 가운데와 광대 위에 하이라이트를 넣었어요',
  oblong: '긴 얼굴형이라 이마 위와 턱 끝에 쉐딩을, 광대 위에 가로로 하이라이트를 넣었어요',
  heart: '하트형이라 이마 양옆에 쉐딩을, 턱 끝과 광대 위에 하이라이트를 넣었어요',
};
/** 랜드마크 비율로 얼굴형 근사 (F-02, POC 초안: 서버 법선 맵 없이 2D 비율만) */
export function estimateFaceShape(lm) {
  const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const faceW = d(234, 454), faceH = d(10, 152), jawW = d(172, 397), foreW = d(103, 332);
  const ratio = faceH / faceW, jaw = jawW / faceW, fore = foreW / faceW;
  let label = 'oval';
  if (ratio > 1.55) label = 'oblong';
  else if (jaw > 0.78) label = 'square';
  else if (fore > 0.95 && jaw < 0.62) label = 'heart';
  else if (ratio < 1.32) label = 'round';
  return { label, ratio, jaw, fore };
}
