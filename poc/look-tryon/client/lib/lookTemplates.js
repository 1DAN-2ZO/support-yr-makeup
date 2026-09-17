// poc/look-tryon/client/lib/lookTemplates.js
// 룩 템플릿 — 부위별 기본 색상·투명도·블렌드 모드. 서버 생성(diffusion) 의존 없이 라이브
// 프리뷰에 바로 쓴다. POC 표본 2개 — 정식 서비스에서는 화면 2 룩 10개 데이터로 교체.

export const LOOK_TEMPLATES = [
  {
    id: "natural",
    name: "내추럴",
    regions: {
      browR: { color: "#8B5A3C", opacity: 0.35, blend: "multiply" },
      browL: { color: "#8B5A3C", opacity: 0.35, blend: "multiply" },
      eyeR: { color: "#C68B5D", opacity: 0.30, blend: "multiply" },
      eyeL: { color: "#C68B5D", opacity: 0.30, blend: "multiply" },
      lips: { color: "#C96A5E", opacity: 0.45, blend: "multiply+overlay" },
      cheekR: { color: "#E8A0A0", opacity: 0.25, blend: "multiply" },
      cheekL: { color: "#E8A0A0", opacity: 0.25, blend: "multiply" },
    },
  },
  {
    id: "coral",
    name: "코랄 포인트",
    regions: {
      browR: { color: "#7A4A2E", opacity: 0.40, blend: "multiply" },
      browL: { color: "#7A4A2E", opacity: 0.40, blend: "multiply" },
      eyeR: { color: "#D9784F", opacity: 0.35, blend: "multiply" },
      eyeL: { color: "#D9784F", opacity: 0.35, blend: "multiply" },
      lips: { color: "#E8593F", opacity: 0.55, blend: "multiply+overlay" },
      cheekR: { color: "#F0876A", opacity: 0.35, blend: "multiply" },
      cheekL: { color: "#F0876A", opacity: 0.35, blend: "multiply" },
    },
  },
];
