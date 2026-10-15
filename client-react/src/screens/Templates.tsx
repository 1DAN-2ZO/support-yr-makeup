/**
 * 화면 4 — 화장 템플릿 고르기.
 *
 * 본 앱 `client/src/screens/flow-slots.ts` 의 `templatesSlot` 자리다. 참고 사진을 올리지
 * 않아도 미리 만들어 둔 템플릿 10종에서 고를 수 있다 — 고른 썸네일이 곧 참고 사진이다.
 *
 * ── 2026-10-14: 배포본(nudy.shelldocs.cloud)과 맞췄다 ──
 *
 * 전에는 카드를 누르는 순간 바로 다음 화면으로 갔다. 배포본은 그러지 않는다:
 * 고른 카드를 **테두리로 표시**(`.tpl-card.is-on`)하고, **안내 한 줄**(`.tpl-note`)을 띄우고,
 * **「적용하기」**를 눌러야 넘어간다. 고르기 전에는 「적용하기」가 눌리지 않는다.
 * 잘못 눌러도 되돌릴 틈이 있어야 한다는 뜻이라 그대로 가져왔다.
 *
 * 코치 말풍선·제목·설명도 배포본 글 그대로다 ("화장 템플릿" / "사진을 올리지 않아도
 * 여기서 고를 수 있어요"). 전에는 이 버전에 참고 사진을 올리는 길이 없어서 글을 바꿔
 * 뒀는데, 올리는 길이 생긴 뒤로는 바꿔 둘 까닭이 없어졌다.
 *
 * 뒤로 가는 길은 **맨 위 로고 줄의 화살표**다 (App.tsx `LogoRow`) — 배포본도 같은 자리다.
 */

import { useState } from "react";
import { TEMPLATES, type MakeupTemplate } from "@core/templates";
import { useLang } from "../i18n/useLang";
import { templateText } from "../lib/core-text";

/**
 * 받침이 있으면 "을", 없으면 "를" — 본 앱 flow-slots 의 `eul` 그대로.
 * "을(를)" 로 적으면 화면 읽어 주는 기기가 괄호째 읽어 어색하다.
 *
 * 영어에는 이런 조사가 없다. 그래서 **한국어일 때만** 글자를 돌려주고 영어면 빈 글자를 준다 —
 * 글(`tpl.note`)은 두 벌 다 `{eul}` 자리를 그대로 두니 문장 하나로 둘 다 맞는다.
 */
function eul(word: string, lang: string): string {
  if (lang !== "ko") return "";
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return "를";
  return c % 28 === 0 ? "를" : "을";
}

export default function Templates({ onPick }: { onPick: (t: MakeupTemplate) => void }) {
  const { lang, t } = useLang();
  const [chosen, setChosen] = useState<MakeupTemplate | null>(null);

  /*
   * 템플릿 이름·설명은 코어(`@core/templates`)에서 한국어로 온다. 코어는 본 앱과 같이 쓰는
   * 폴더라 고치지 않고, **여기서 화면 말로 싸서** 쓴다 (`lib/core-text` 의 `templateText`).
   * 싼 것을 그대로 `onPick` 으로 넘기니 뒤 화면(팔레트 · 저장 · 피드백)도 같은 말로 나온다 —
   * 번호(`id`)와 사진(`thumb`)은 건드리지 않아서 서버로 가는 것은 전과 같다.
   */
  const list = TEMPLATES.map((tpl) => templateText(t, tpl));

  return (
    <section className="screen">
      {/* 코치 말풍선 — 배포본은 거의 모든 화면에 이 줄이 있다 */}
      <div className="coach">
        <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
        <p>
          {t("tpl.coach")}
          <i aria-hidden="true" />
        </p>
      </div>

      {/* 제목 앞머리를 분홍으로 두는 것은 배포본 방식이다 (본 앱 `title()`) */}
      <h1 className="title">
        <em>{t("tpl.titleEm")}</em>
        {t("tpl.titleRest")}
      </h1>
      <p className="sub">{t("tpl.sub")}</p>

      <ul className="tpl-grid">
        {list.map((tpl) => (
          <li key={tpl.id}>
            {/* 카드 전체가 버튼이다 — 손가락으로 누르는 화면에서 글자만 누르게 하면 자꾸 빗나간다 */}
            <button
              type="button"
              className={chosen?.id === tpl.id ? "tpl-card is-on" : "tpl-card"}
              aria-pressed={chosen?.id === tpl.id}
              onClick={() => setChosen(tpl)}
            >
              <img src={tpl.thumb} alt="" aria-hidden="true" loading="lazy" />
              <strong>{tpl.name}</strong>
              <em>{tpl.about}</em>
            </button>
          </li>
        ))}
      </ul>

      {/* 무엇을 골랐는지 글로도 한 번 — 테두리만으로는 색을 못 가리는 사람이 알 수 없다 */}
      {chosen && (
        <p className="tpl-note" role="status">
          {t("tpl.note", { name: chosen.name, eul: eul(chosen.name, lang) })}
        </p>
      )}

      <button
        type="button"
        className="go"
        disabled={!chosen}
        onClick={() => {
          if (chosen) onPick(chosen);
        }}
      >
        {t("tpl.apply")}
      </button>
    </section>
  );
}
