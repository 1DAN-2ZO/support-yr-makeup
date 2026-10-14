/**
 * 화면 6 — 부위 가이드.
 *
 * `PART_ORDER` 순서로 **한 부위씩** 본다. 다섯을 한 화면에 펼치면 폰에서 스크롤이 길어지고
 * "지금 뭘 바르는 차례인가" 가 흐려진다 — 화장은 한 부위씩 하는 일이라 화면도 그 차례를 따른다.
 *
 * 지금 몇 번째 부위인지는 **이 화면이 들고 있는다.** App 은 여덟 단계만 알면 되고, 부위를
 * 옮기는 일로 App 이 다시 그려질 이유가 없다.
 *
 * 2026-10-14: 「실시간 가이드로 보기」가 붙었다 (`onLive`). 실시간 가이드는 **흐름의 한 칸이 아니라
 * 이 화면의 곁 화면**이다 — 본 앱 `core/screens.ts` 의 `SIDE_OF = { live: "partguide" }` 그대로,
 * 들어갔다 「이전」으로 여기 돌아온다 (#334). 곁 화면에 다녀오면 이 화면이 새로 그려지니
 * **보고 있던 부위를 잊지 않으려고** `startPart` 로 되받는다 — 입술을 보다 들어갔는데 돌아와서
 * 눈썹이 떠 있으면 다시 네 번 눌러야 한다.
 *
 * ── 본 앱과 모양을 맞춘 것 (2026-10-14) ──
 *
 * 본 앱(client/src/screens/flow-slots.ts 의 `partGuideSlot`)과 같은 짜임으로 바꿨다 —
 * 코치 말풍선 · 제목 묶음 · **가이드 그림** · 실시간 가이드 버튼 · 색 한 줄 · 제품 묶음.
 * 전에는 색 동그라미가 가운데 박힌 카드 하나였는데, 본 앱과 나란히 놓으면 다른 화면이었다.
 * 「실시간 가이드로 보기」 자리도 본 앱과 같다 — **가이드 그림 바로 아래 · 색 칸 위**,
 * 그림을 보다가 바로 누르는 자리다 (본 앱 #334).
 *
 * ── 진짜 가이드 그림 (2026-10-14) ──
 *
 * 그림 자리는 본 앱 `partGuideSlot` 과 같은 짜임이다 — **정답사진을 이 부위로 잘라 키우고
 * 그 위에 테두리 · 점 · 선을 얹는다** (`lib/guide-source` 의 `drawGuidePage`). 전에는 CSS 로
 * 그린 자리표시뿐이어서 "눈썹 화면에 눈썹 기능이 없다" 는 말을 들었다. 자리표시는 지우지 않고
 * **돌아갈 자리**로 남겨 뒀다 — 내 얼굴이 아닐 때는 본 앱처럼 왼쪽 위에 「예시」 딱지가 붙는다.
 *
 * 정답사진이 없거나(서버 꺼짐 · 실패) 그 부위의 **화장을 못 찾아도 흐름을 막지 않는다.**
 * 본 앱과 같이 — 아예 못 만들면 자리표시로 돌아가고, 화장만 못 찾았으면 자른 그림은 그대로
 * 보여 주면서 한 줄로 밝힌다. 그림을 못 그리는 것이 다음 부위로 못 가는 까닭이 되면 안 된다.
 *
 * **재료는 한 번만 만든다.** 사진을 풀고 화장을 떼는 일은 한 번에 1초 안팎이라 부위를 넘길
 * 때마다 다시 하면 칩을 누를 때마다 화면이 멈춘다. 그래서 만드는 일은 App 이 들고 있는
 * 보관함(`lib/guide-source` 의 `createGuideKeeper`)이 하고 — 같은 정답사진이면 만들어 둔 것을
 * 그대로 준다 — 이 화면은 **받아 온 것을 부위마다 캔버스에 다시 그리기만** 한다 (1ms 안팎).
 * 정답사진 그림(ImageBitmap)을 놓는 것도 보관함 쪽 일이다 (App 의 `clear` · `restart`) —
 * 이 화면이 떠날 때 놓아 버리면 실시간 가이드에 다녀와 돌아왔을 때 그릴 것이 없다.
 *
 * 2026-10-14: 아래에 있던 「이전」을 뺐다 — 본 앱도 아래에는 「다음」 하나뿐이다.
 * **부위를 거슬러 가는 길은 위의 진행 칩**이고(본 앱은 칩을 숨겨서 맨 위 화살표가 그 일을 했다),
 * 화면을 한 칸 나가는 길은 맨 위 로고 줄의 화살표다 (App.tsx `LogoRow` → 팔레트).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PartColors } from "../api";
import type { PalettePart } from "../core/color-family";
import { PART_NAME, PART_ORDER, PART_TIP } from "../parts";
import { pickProducts, pickShadeText } from "../core/product-picks";
import { drawGuidePage, type GuideLoad, type GuideView } from "../lib/guide-source";

/** 진짜 가이드 그림이 떴을 때의 말풍선 — 본 앱 flow-slots 의 `GUIDE_COACH` 그대로 */
const GUIDE_COACH = "예상 메이크업에서 이 부위만 크게 잘라서 보여드릴게요";

/** 자리표시일 때의 말풍선 — 내 얼굴이 아니라 견본이라는 것을 먼저 밝힌다 */
const MOCK_COACH = "예시 그림이에요. 점과 선을 기준으로 따라 해 주세요";

/** 재료를 만드는 동안 그림 자리에 띄우는 한 줄 (본 앱과 같은 말) */
const WAIT_TEXT = "가이드를 준비하고 있어요…";

/** 정답사진은 왔는데 그 부위의 화장만 못 찾았을 때 (본 앱과 같은 말) */
const NOT_FOUND_TEXT = "예상 메이크업에서 이 부위의 화장은 찾지 못했어요. 사진을 보고 따라 해 주세요.";

export default function PartGuide({
  colors,
  startPart,
  getGuide,
  onDone,
  onLive,
}: {
  colors: PartColors;
  /** 곁 화면(실시간 가이드)에 다녀온 뒤 다시 펼칠 부위. 없으면 첫 부위부터 */
  startPart?: PalettePart;
  /**
   * 정답사진으로 만든 가이드 재료 (App 의 보관함 — `lib/guide-source` 의 `createGuideKeeper`).
   * **안 주면 지금까지처럼 자리표시만** 그린다 (서버가 안 붙었거나 정답사진을 못 만든 길).
   * 같은 정답사진이면 늘 같은 것을 돌려줘야 한다 — 이 화면은 들어올 때 한 번만 부른다
   */
  getGuide?: () => Promise<GuideLoad>;
  onDone: () => void;
  /** 「실시간 가이드로 보기」 — 지금 보고 있는 부위를 들고 곁 화면으로. 안 주면 버튼을 안 그린다 */
  onLive?: (part: PalettePart) => void;
}) {
  // 처음 자리만 정한다 — 그 뒤 부위를 옮기는 일은 여전히 이 화면 안에서 끝난다
  const [at, setAt] = useState(() => {
    const i = startPart ? PART_ORDER.indexOf(startPart) : -1;
    return i < 0 ? 0 : i;
  });
  const part = PART_ORDER[at]!;
  const color = colors[part];
  const last = at === PART_ORDER.length - 1;

  /**
   * 받아 온 가이드 재료. `null` 은 아직 안 받았거나 못 받은 것 — 둘을 `waiting` 으로 가른다.
   *
   * 재료를 만드는 일은 **부위와 상관없다** (다섯 부위가 한 번에 나온다). 그래서 이 효과의
   * 의존성에는 `part` 가 없다 — 넣으면 칩을 누를 때마다 다시 부르게 되고, 보관함이 막아 준다
   * 해도 쓸데없는 약속이 다섯 번 생긴다
   */
  const [view, setView] = useState<GuideView | null>(null);
  const [waiting, setWaiting] = useState(!!getGuide);

  useEffect(() => {
    if (!getGuide) return;
    // StrictMode 는 효과를 두 번 돌린다. 무거운 일(사진 풀기 · 화장 떼기)이 두 번 돌지 않는 까닭은
    // 보관함이 **같은 정답사진이면 앞서 만든 약속을 그대로** 돌려주기 때문이다 (useCamera 와 같은 짜임 —
    // 여기 깃발은 "이미 떠난 화면에 값을 넣지 않기" 만 맡는다)
    let alive = true;
    getGuide()
      .then((r) => {
        if (!alive) return;
        setView(r.ok ? r.view : null);
        setWaiting(false);
      })
      // 못 만들어도 흐름은 그대로 — 자리표시로 돌아간다
      .catch(() => {
        if (alive) setWaiting(false);
      });
    // 받아 온 재료(정답사진 그림)는 **보관함 것이다.** 여기서 놓으면 곁 화면에 다녀와
    // 돌아왔을 때 그릴 것이 없다 — 놓는 일은 App 이 정답사진을 버릴 때 한다
    return () => {
      alive = false;
    };
  }, [getGuide]);

  /** 그림 자리에 진짜 그림이 떴나 — 말풍선 글과 「예시」 딱지가 이것으로 갈린다 */
  const real = !!view;
  /** 정답사진은 왔는데 이 부위의 화장만 못 찾았다 — 자른 그림은 보여 주고 한 줄로 밝힌다 */
  const missing = !!view && !view.found.includes(part);

  /**
   * 부위가 바뀌면 캔버스에 **다시 그리기만** 한다. 자르고 테두리를 긋는 일이라 1ms 안팎 —
   * 사진을 다시 풀지 않는다 (그 일은 보관함이 한 번만 한다)
   */
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (view && canvas.current) drawGuidePage(canvas.current, view, part);
  }, [view, part]);

  /**
   * 제품을 찾을 계열 둘.
   *
   * `hex` 는 사진에 보이는 색, `product.hex` 는 피부를 걷어낸 색이라 계열 이름이 다를 수 있다.
   * 어느 쪽이 맞는지 이 버전에서는 가릴 수 없으니 **양쪽을 다 넣고** 제품 쪽에서 고르게 한다.
   * 둘이 같으면 한 개로 줄인다 — 같은 계열을 두 번 넣으면 같은 제품이 두 번 걸린다.
   */
  const families = [...new Set([color.name.base, color.product.name.base])];
  const picks = pickProducts(part, families, 2);
  // 출처 한 줄은 사진이 실제로 나갈 때만 띄운다 (색 네모만 나가는 줄도 있다)
  const hasPhoto = picks.some((p) => p.pick.photo);

  return (
    // 부위 색은 가이드 묶음이 통째로 쓴다 (색 동그라미 · 제품 네모) — 본 앱도 `--slot-color` 하나로 내린다
    <section className="screen" style={{ "--slot-color": color.hex } as CSSProperties}>
      {/* 칩은 차례를 보여 주는 동시에 건너뛰는 길이다 — 입술만 다시 보고 싶은 사람이 다섯 번 누를 이유가 없다 */}
      <nav className="chips" aria-label="부위 고르기">
        {PART_ORDER.map((p, i) => (
          <button
            key={p}
            type="button"
            className="chip"
            aria-current={i === at ? "true" : undefined}
            onClick={() => setAt(i)}
          >
            {PART_NAME[p]}
          </button>
        ))}
      </nav>

      <div className="coach">
        <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
        {/* 진짜 그림이 뜨면 말이 바뀐다 — 「예시」 딱지가 빠지는 것과 같은 때다 (본 앱 #364) */}
        <p>
          {real ? GUIDE_COACH : MOCK_COACH}
          <i aria-hidden="true" />
        </p>
      </div>

      <h1 className="title">
        <em>{PART_NAME[part]}</em>
      </h1>
      <p className="sub">점과 선을 기준으로 거울 앞에서 천천히 따라 해 주세요</p>

      <div className="slot-guide-card">
        {/*
          그림 자리. 셋 중 하나다 (본 앱 `partGuideSlot` 과 같은 갈래) —
            ① 진짜 그림: 정답사진을 이 부위로 자른 캔버스 + 테두리 · 점 · 선. 「예시」 딱지 없음
            ② 기다리는 중: 자리표시 바탕 위에 한 줄
            ③ 자리표시: 그림 파일이 아니라 CSS 로 그린 견본. 내 얼굴이 아니라서 「예시」 딱지를 단다
        */}
        <div className={real ? "slot-guide-photo is-real" : "slot-guide-photo"}>
          {real ? (
            <canvas className="slot-guide-canvas" ref={canvas} aria-label={`${PART_NAME[part]} 가이드 그림`} role="img" />
          ) : waiting ? (
            <p className="slot-guide-wait" role="status">
              {WAIT_TEXT}
            </p>
          ) : (
            <>
              <span className="slot-guide-sample">예시</span>
              <span className="slot-guide-line one" />
              <span className="slot-guide-line two" />
              <span className="slot-guide-dot" />
            </>
          )}
        </div>

        {/*
          그 부위의 화장만 못 찾았을 때 — 자른 그림은 그대로 두고 **글자로** 밝힌다.
          본 앱은 이때 「실시간 가이드로 보기」까지 빼지만 여기서는 두었다 (이 작업의 범위 밖) —
          실시간 가이드는 테두리가 없으면 옛 표준 틀을 「예시」 딱지와 함께 그리니 흐름은 막히지 않는다
        */}
        {missing && <p className="slot-guide-none">{NOT_FOUND_TEXT}</p>}

        {/*
          곁 화면으로 가는 길 — 본 앱과 같은 자리(그림 바로 아래 · 색 칸 위)에 테두리 버튼으로 둔다.
          흐름의 한 칸이 아니라 지금 부위를 카메라로 겹쳐 보는 딴 길이라, 아래 「이전 / 다음」 줄과
          나란히 놓으면 흐름의 한 칸으로 읽힌다
        */}
        {onLive && (
          <button type="button" className="go ghost" onClick={() => onLive(part)}>
            실시간 가이드로 보기
          </button>
        )}

        {/* 색 한 줄 — 동그라미는 거드는 것이고 이름이 본문이다 */}
        <div className="slot-color">
          <span aria-hidden="true" />
          <div>
            {/*
              본 앱과 같은 표기다 — `${read.name.text} 계열` (flow-slots.ts 의 guideMock).
              꾸밈말까지 붙인 이름 뒤에 "계열" 을 **늘** 붙인다: "뮤트 라이트브라운 계열".

              전에는 꾸밈말이 다를 때만 괄호로 "(…계열)" 을 덧붙였는데, 본 앱과 달라
              같은 화면이 다르게 읽혔다. "계열" 이 늘 붙어야 "이 호수" 가 아니라
              "이런 색 무리" 라는 뜻이 전해진다 — 우리는 호수를 집어 주지 않는다
            */}
            <strong>{color.name.text} 계열</strong>
            <p>{PART_TIP[part]}</p>
          </div>
        </div>

        {picks.length === 0 ? (
          /* 비워 두면 "안 불러온 건가" 로 읽힌다 — 못 찾았다는 것을 말로 밝히고 다음 할 일을 알려 준다 */
          <div className="slot-product is-none">
            <b>이런 제품이면 돼요</b>
            <p>이 색에 맞는 제품은 아직 못 찾았어요. 비슷한 색으로 골라 주세요.</p>
          </div>
        ) : (
          <div className="slot-product">
            <b>이런 제품이면 돼요</b>
            {picks.map(({ pick, family }) => {
              /*
               * `pickProducts` 는 딱 맞는 계열이 모자라면 **색이 가까운 계열**에서 채운다.
               * 그래서 부위 색과 다른 계열 이름이 뜨는 줄이 생기는데, 아무 말이 없으면
               * 사용자에게는 잘못 뽑힌 것으로 보인다 — 그 줄에만 왜 다른지 **글자로** 밝힌다.
               * 색만 달리 보여 주면 색을 구별하기 어려운 사람에게는 아무 말도 안 한 것과 같다
               */
              const near = family !== color.name.base;
              return (
                <div className="slot-product-row" key={`${pick.brand} ${pick.name}`}>
                  {pick.photo ? (
                    <img className="slot-product-photo" src={pick.photo} alt="" aria-hidden="true" loading="lazy" />
                  ) : (
                    /* 사진이 없는 제품도 있다 — 자리가 비면 줄이 어긋나 보이니 색 네모로 메운다 */
                    <span className="slot-product-dot" aria-hidden="true" />
                  )}
                  <div>
                    <strong>
                      {pick.brand} {pick.name}
                    </strong>
                    <em>{pickShadeText(pick, family)}</em>
                    {near && <small className="pick-near">부위 색과 가까운 계열이에요</small>}
                    <p>{pick.kind}</p>
                  </div>
                </div>
              );
            })}
            {hasPhoto && <small className="slot-product-credit">제품 사진: 각 브랜드</small>}
          </div>
        )}
      </div>

      {/*
        아래에는 「다음」 하나만 — 본 앱도 그렇다. 부위를 거슬러 가는 길은 **위의 진행 칩**이고,
        화면을 한 칸 나가는 길은 **맨 위 로고 줄의 화살표**다 (App.tsx `LogoRow`)
      */}
      {/*
        마지막 부위의 버튼 글은 **다음에 실제로 가는 화면 이름**이어야 한다. 전에는
        「다음 · 피드백 보기」였는데 다음은 피드백이 아니라 **완성사진 촬영**이다
        (App.tsx 의 `FLOW`: partguide → attempt → feedback). 배포본 글로 고쳤다 (2026-10-14)
      */}
      <button type="button" className="go" onClick={() => (last ? onDone() : setAt(at + 1))}>
        {last ? "다음 · 완성사진 찍기" : `다음 — ${PART_NAME[PART_ORDER[at + 1]!]}`}
      </button>
    </section>
  );
}
