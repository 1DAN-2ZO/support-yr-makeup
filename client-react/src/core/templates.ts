/**
 * 화장 템플릿 10종 (#420) — 참고 사진을 올리는 대신 고르는 화장.
 *
 * 고르고 "적용하기" 를 누르면 그 사진을 올린 참고 사진처럼 다뤄 예상 메이크업을 만든다 (#433).
 * **서버로 가는 참고 사진이 이 썸네일이다** — 업로드 규격의 큰 사진으로 바꾸는 일이 남았다 (#420).
 * 썸네일은 AI 로 만든 사진을 300×400 webp 로 줄인 것이다 (원본 22MB → 128KB).
 * 파일 이름의 `hair-clear` 는 머리카락이 눈썹·눈을 가리지 않게 만들었다는 뜻이다.
 *
 * 이름과 설명은 사용자가 고를 때 읽는 말이다 — 화장 용어보다 "어떤 자리에 어울리나" 로 적는다.
 */

export interface MakeupTemplate {
  /** 01~10. 기록에 남길 때 쓴다 — 템플릿을 나중에 바꿔도 번호로 가른다 (#420 열린 질문) */
  id: string;
  name: string;
  /** 한 줄 설명 — 이름만으로는 어떤 화장인지 알기 어렵다 */
  about: string;
  thumb: string;
}

export const TEMPLATES: readonly MakeupTemplate[] = [
  { id: "01", name: "어른 여자",   about: "또렷한 눈매에 차분한 입술",       thumb: "/templates/01-chic-elegant.webp" },
  { id: "02", name: "세미 스모키", about: "눈가를 부드럽게 감싸는 음영",     thumb: "/templates/02-semi-smoky.webp" },
  { id: "03", name: "가을",        about: "붉은 기 도는 따뜻한 색",          thumb: "/templates/03-autumn-mute.webp" },
  { id: "04", name: "청순",        about: "연하게, 피부 결을 살려서",        thumb: "/templates/04-pure-clean.webp" },
  { id: "05", name: "아이돌",      about: "반짝이는 눈과 또렷한 입술",       thumb: "/templates/05-idol-sparkle.webp" },
  { id: "06", name: "미소녀",      about: "시원한 눈매에 맑은 피부",         thumb: "/templates/06-j-girl-cool.webp" },
  { id: "07", name: "러블리",      about: "분홍빛 볼과 촉촉한 입술",         thumb: "/templates/07-soft-romantic.webp" },
  { id: "08", name: "데일리",      about: "매일 하기 좋은 옅은 화장",        thumb: "/templates/08-daily-quick.webp" },
  { id: "09", name: "하이틴",      about: "생기 있는 볼과 글로시한 입술",    thumb: "/templates/09-kitsch-highteen.webp" },
  { id: "10", name: "누드",        about: "색을 거의 쓰지 않은 민낯 느낌",   thumb: "/templates/10-clean-nude.webp" },
];

export function templateById(id: string): MakeupTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}
