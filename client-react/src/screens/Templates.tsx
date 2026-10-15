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

/**
 * 받침이 있으면 "을", 없으면 "를" — 본 앱 flow-slots 의 `eul` 그대로.
 * "을(를)" 로 적으면 화면 읽어 주는 기기가 괄호째 읽어 어색하다.
 */
function eul(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return "를";
  return c % 28 === 0 ? "를" : "을";
}

export default function Templates({ onPick }: { onPick: (t: MakeupTemplate) => void }) {
  const [chosen, setChosen] = useState<MakeupTemplate | null>(null);

  return (
    <section className="screen">
      {/* 코치 말풍선 — 배포본은 거의 모든 화면에 이 줄이 있다 */}
      <div className="coach">
        <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
        <p>
          따라 하고 싶은 화장을 골라 주세요
          <i aria-hidden="true" />
        </p>
      </div>

      {/* 제목 앞머리를 분홍으로 두는 것은 배포본 방식이다 (본 앱 `title()`) */}
      <h1 className="title">
        <em>화장</em> 템플릿
      </h1>
      <p className="sub">사진을 올리지 않아도 여기서 고를 수 있어요</p>

      <ul className="tpl-grid">
        {TEMPLATES.map((t) => (
          <li key={t.id}>
            {/* 카드 전체가 버튼이다 — 손가락으로 누르는 화면에서 글자만 누르게 하면 자꾸 빗나간다 */}
            <button
              type="button"
              className={chosen?.id === t.id ? "tpl-card is-on" : "tpl-card"}
              aria-pressed={chosen?.id === t.id}
              onClick={() => setChosen(t)}
            >
              <img src={t.thumb} alt="" aria-hidden="true" loading="lazy" />
              <strong>{t.name}</strong>
              <em>{t.about}</em>
            </button>
          </li>
        ))}
      </ul>

      {/* 무엇을 골랐는지 글로도 한 번 — 테두리만으로는 색을 못 가리는 사람이 알 수 없다 */}
      {chosen && (
        <p className="tpl-note" role="status">
          {chosen.name}
          {eul(chosen.name)} 골랐어요. 적용하기를 누르면 내 얼굴에 맞춰 만들어드릴게요.
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
        적용하기
      </button>
    </section>
  );
}
