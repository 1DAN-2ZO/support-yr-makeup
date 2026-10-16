/**
 * 화면 5 — 색조 팔레트.
 *
 * 부위별 화면으로 들어가기 전에 **다섯 색을 한 장에 모아** 보여 준다. 한 부위씩만 보면
 * "이 화장이 전체적으로 어떤 색인가" 가 안 잡혀서, 고른 템플릿이 마음에 안 들어도
 * 다섯 화면을 다 지나야 알게 된다.
 *
 * ── 본 앱과 모양을 맞춘 것 (2026-10-14) ──
 *
 * 전에는 색 동그라미 + 부위 이름 목록이었다. 본 앱(client/src/screens/color-palette.ts)은
 * **질감 그림 + 색 이름 + 부위 이름** 이라 전혀 다르게 보였다 — 지금은 본 앱과 같다.
 *
 * 질감은 **흑백 틀(public/swatch/*.png)에 색을 입히는 방식**이다 (본 앱 그대로). 틀에는
 * "잉크가 얼마나 묻었나" 만 들어 있고 색이 없다 — CSS mask 로 그 모양만 오려 내고 바탕을
 * 뽑은 색(currentColor)으로 칠한다. 사진 같은 질감과 자유로운 색을 둘 다 가져가는 방법이다.
 *
 * 그림은 거드는 것이고 **글자 이름이 본문**이다. 색만으로 줄을 가르면 색약인 사람에게는
 * 다섯 줄이 다 같아 보인다.
 *
 * 본 앱과 다르게 둔 것 둘 —
 *  - 줄 차례는 이 버전의 `PART_ORDER`(눈썹·아이라이너·아이섀도우·입술·볼터치)를 따른다.
 *    실제로 화장하는 차례라 다음 화면(부위 가이드)과 어긋나면 안 된다.
 *  - 제목 설명은 배포본의 "올려 주신 사진에서" 를 "참고 사진에서" 로 둔다. 배포본은 늘
 *    올린 사진에서 읽지만, 이 버전은 **템플릿으로 들어온 길**도 있어서 "올려 주신" 이
 *    한쪽 길에서는 거짓이 된다. 템플릿도 썸네일이 곧 참고 사진이라 "참고 사진" 은 두 길 다 맞다.
 *    (2026-10-14: 전에는 "고른 템플릿에서 읽어 둔 색이에요" 였는데, 사진을 올려 들어오면
 *    고른 템플릿이 없어서 거짓이었다)
 *
 * 2026-10-14: 아래에 있던 「이전」을 뺐다. 뒤로 가는 길은 **맨 위 로고 줄의 화살표**다
 * (App.tsx `LogoRow`) — 본 앱과 같은 자리이고, 아래에는 큰 버튼 하나만 둔다.
 */

import type { CSSProperties } from "react";
import type { PartColors } from "../api";
import { PART_NAME, PART_ORDER } from "../parts";
import type { MakeupTemplate } from "@core/templates";
import { useLang } from "../i18n/useLang";
import { colorText } from "../lib/core-text";

/** 부위별 질감 틀. 알파만 있는 흑백 PNG — CSS mask 로 모양만 오려 쓴다 (본 앱 `SWATCH`) */
const SWATCH: Record<(typeof PART_ORDER)[number], string> = {
  brow: "brow",      // 가는 털이 여러 갈래로 쓸린 결
  liner: "liner",    // 펜으로 그은 가는 획 셋
  shadow: "shadow",  // 브러시로 쓸어 바른 파우더. 덩어리와 날린 가루
  lip: "lip",        // 눌러 쓸어 바른 크림
  cheek: "cheek",    // 틀에 눌러 담은 압축 파우더
};

export default function Palette({
  template,
  colors,
  onNext,
}: {
  template: MakeupTemplate;
  colors: PartColors;
  onNext: () => void;
}) {
  const { t } = useLang();
  return (
    <section className="screen">
      <div className="coach">
        <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
        <p>
          {t("pal.coach")}
          <i aria-hidden="true" />
        </p>
      </div>

      <h1 className="title">
        <em>{template.name}</em>
        {t("pal.titleRest")}
      </h1>
      <p className="sub">{t("pal.sub")}</p>

      <section className="color-palette">
        <div className="color-palette-head">
          {/* 차례 번호를 분홍으로 두는 것은 본 앱 방식이다 (본 앱은 "2." 를 붙인다) */}
          <h2>
            <em>2.</em> {t("pal.head")}
          </h2>
          <p>{t("pal.headSub")}</p>
        </div>

        <ul className="color-palette-list">
          {PART_ORDER.map((part) => {
            const color = colors[part];
            return (
              /* 질감 그림 색은 줄의 `color` 로 내려간다 — 그림이 `currentColor` 로 칠해진다 */
              <li key={part} style={{ color: color.hex }}>
                <span className="palette-ink" aria-hidden="true">
                  <i style={{ "--sw": `url('/swatch/${SWATCH[part]}.png')` } as CSSProperties} />
                </span>
                <span className="palette-text">
                  <strong>{colorText(t, color.name)}</strong>
                  <em>{t(PART_NAME[part])}</em>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 아래에는 큰 버튼 하나만 — 뒤로 가는 길은 맨 위 로고 줄의 화살표다 (본 앱과 같은 자리) */}
      <button type="button" className="go" onClick={onNext}>
        {t("pal.next")}
      </button>
    </section>
  );
}
