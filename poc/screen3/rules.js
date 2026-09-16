// 화면 3 POC — 데이터. 로직 없음.
// 부위 id·이름은 poc/screen6/core.js 와 철자까지 같게 유지한다.

export const PART_IDS = ['brow', 'liner', 'shadow', 'lip', 'cheek', 'contour'];

export const PART_NAME = {
  brow: '눈썹', liner: '아이라이너', shadow: '섀도우',
  lip: '입술', cheek: '볼터치', contour: '쉐딩·하이라이트',
};

export const STATUS_LABEL = {
  not_started: '미시작', in_progress: '진행 중',
  check_only: '확인만', passed: '완료', skipped: '건너뜀',
};

// 눈썹·아이라이너·섀도우는 양쪽 눈을 한 화면에 담아야 해서 가로(브리프 A절·F-06).
export const ORIENTATION = {
  brow: 'landscape', liner: 'landscape', shadow: 'landscape',
  lip: 'portrait', cheek: 'portrait', contour: 'portrait',
};

// 폰 화면 비율. 세로 9:19.5, 가로 19.5:9.
// ⚠️ 이건 "폰 화면 전체" 비율이다. 실제 사진이 보이는 영역(.shot)은 진행 칩과
// 카드를 뺀 일부라 이보다 좁다 — 목표 종횡비가 사진 영역 실제 비율과 다르다는
// 뜻이고, 이게 모델링 한계다(README "범위 한계" 참고).
export const ASPECT = { landscape: 19.5 / 9, portrait: 9 / 19.5 };

// 가정값. 실측으로 고친다 (스펙 13절).
export const SIDE_MARGIN = 0.15;    // 가로 부위 좌우 여백 (문서값 "여백 15%")
export const PORTRAIT_ZOOM = 2.5;   // 세로 부위 목표 확대율 (문서값 "2~3배"의 중앙)

export const SMOKY = {
  id: 'smoky',
  name: '스모키',
  products: {
    brow: '브라운 아이브로 펜슬',
    liner: '블랙 젤 라이너 + 각진 브러시',
    shadow: '다크 브라운 섀도우 (매트) + 블렌딩 브러시',
    lip: 'MLBB 립',
    cheek: '핑크 파우더 블러셔 + 블러셔 브러시',
    contour: '컨투어 파우더 + 하이라이터 + 브러시',
  },
  // 숫자 없는 근거 한 줄 (F-06, 브리프 화면 3)
  rationale: {
    brow: '눈썹 산을 살짝 낮추고 꼬리를 또렷하게 그리세요',
    liner: '눈꼬리를 살짝 올려 짧게 빼세요. 양쪽 꼬리 높이를 맞추세요',
    shadow: '눈꼬리 쪽으로 갈수록 진하게, 눈두덩 안쪽은 옅게 펴 바르세요',
    lip: '입술 경계를 또렷하게, 안쪽부터 채우세요',
    cheek: '광대 위에서 관자놀이 쪽으로 비스듬히 올려 바르세요',
  },
};

export const FACE_SHAPES = ['oval', 'round', 'square', 'oblong', 'heart'];
export const FACE_SHAPE_NAME = {
  oval: '계란형', round: '둥근 얼굴형', square: '각진 얼굴형',
  oblong: '긴 얼굴형', heart: '하트형',
};

// ⚠️ 전문가 검증 전 가정값이다.
// docs/README.md "이후 확정할 것"의 "얼굴형별 쉐딩·하이라이트 규칙 5종"에 대한 초안.
// region 이름은 core.js 의 REGION_BUILDERS 키다. widthMm 은 밴드 폭.
export const CONTOUR_RULES = {
  oval: {
    shading: [{ region: 'underCheek', widthMm: 10 }],
    highlight: [{ region: 'cheekTop', widthMm: 10 }, { region: 'noseBridge', widthMm: 7 }],
    rationale: '계란형이라 광대 아래만 얕게 쉐딩하고, 광대 위에 하이라이트를 넣었어요',
  },
  round: {
    shading: [{ region: 'jawline', widthMm: 12 }, { region: 'underCheek', widthMm: 14 }],
    highlight: [{ region: 'cheekTop', widthMm: 10 }, { region: 'tZone', widthMm: 9 }],
    rationale: '둥근 얼굴형이라 턱선과 광대 아래에 쉐딩을, 광대 위에 하이라이트를 넣었어요',
  },
  square: {
    shading: [{ region: 'jawCorner', widthMm: 13 }, { region: 'foreheadSide', widthMm: 11 }],
    highlight: [{ region: 'cheekTop', widthMm: 10 }, { region: 'chinTip', widthMm: 8 }],
    rationale: '각진 얼굴형이라 턱 모서리와 이마 양옆에 쉐딩을, 광대 위와 턱 가운데에 하이라이트를 넣었어요',
  },
  oblong: {
    shading: [{ region: 'foreheadTop', widthMm: 12 }, { region: 'chinTip', widthMm: 12 }],
    highlight: [{ region: 'cheekTop', widthMm: 14 }],
    rationale: '긴 얼굴형이라 이마 위와 턱 끝에 쉐딩을, 광대 위에 가로로 넓게 하이라이트를 넣었어요',
  },
  heart: {
    shading: [{ region: 'foreheadSide', widthMm: 12 }, { region: 'chinTip', widthMm: 10 }],
    highlight: [{ region: 'cheekTop', widthMm: 10 }, { region: 'underEye', widthMm: 8 }],
    rationale: '하트형이라 이마 양옆과 턱 끝에 쉐딩을, 광대 위와 눈 밑에 하이라이트를 넣었어요',
  },
};
