/**
 * 화면 전환을 들고 있는 곳.
 *
 * 흐름은 **본 앱(support-yr-makeup/client/src/core/screens.ts)의 `SCREEN_ORDER` 가 기준**이다:
 *   consent → capture → answer → partguide → attempt → feedback → save → done
 * 이 버전이 그 자리에 무엇을 놓는지 —
 *   consent   동의. 안내 화면 바탕 + 그 위의 처리 안내 모달 (Intro.tsx + Consent.tsx)
 *   capture   맨얼굴 촬영 (Capture.tsx) — 2026-10-14 에 흐름에 들어왔다
 *   answer    본 앱의 한 화면(참고 사진 올리기 + 템플릿 고르기 + 정답사진 만들기)을
 *             이 버전은 **세 화면**으로 펼친다 (2026-10-14) —
 *               upload    참고 사진 올리기 (Upload.tsx). 고른 사진의 색을 이 폰에서 읽는다
 *               templates 템플릿 고르기 (Templates.tsx) — upload 의 **곁 화면**이다 (아래 Stage 주석)
 *               answer    정답사진(예상 메이크업) (Answer.tsx). 맨얼굴 + 참고 사진을 서버로 보낸다
 *             그 뒤에 palette(읽은 색 다섯을 한 장에)가 붙는다 — 본 앱은 정답사진 화면 안에 들어 있다
 *   partguide 부위 가이드
 *   attempt   완성사진 (Attempt.tsx) — 2026-10-14 에 흐름에 들어왔다
 *   feedback  피드백
 *   save      저장 · 끝내기
 *   done      끝 — "끝났어요" 와 「다시 하기」 (본 앱 screens/done.ts). 2026-10-14 에 끼웠다.
 *             전에는 저장 화면의 버튼이 곧바로 동의로 돌아가서, 본 앱의 마지막 한 칸이 비어 있었다.
 *             후기 설문 칸은 안 가져왔다 — 받을 후기가 없다 (본 앱도 주소가 없으면 그 칸을 안 그린다)
 * 스플래시는 본 앱에 없는 이 버전만의 앞 화면이라 순서 밖에 둔다.
 *
 * **곁 화면은 순서(`FLOW`)에 넣지 않는다.** 실시간 가이드(live)는 본 앱 `SIDE_OF = { live: "partguide" }`
 * 그대로 부위 가이드에서 들어갔다 「이전」으로 돌아오는 딴 길이다 — 흐름의 한 칸이 되면 「다음」을
 * 누를 때마다 카메라가 켜지고, 본 앱에 없는 단계가 하나 생긴다. 거절 뒤의 이용 불가(denied)와 같은 취급이다.
 *
 * 라우터를 쓰지 않는다. 단계가 한 줄로 이어지고 주소로 바로 들어올 자리가 없어서,
 * 주소를 맞추는 코드가 하는 일보다 많아진다. 단계가 갈라지면 그때 넣는다.
 *
 * 색을 받아오는 일은 **여기서만** 한다. 화면들은 이미 받아온 색만 받아 그리니까
 * "색이 없는 동안" 을 화면들이 각자 처리하지 않아도 된다. 색이 오는 길은 둘인데
 * (올린 사진은 `lib/ref-analyze`, 템플릿은 `api.templateColors`) **모양이 같아서**(`PartColors`)
 * 그 뒤 화면들은 어느 길로 왔는지 모른다 — 본 앱도 같은 짜임이다 (`setRefColors` 하나로 모은다).
 *
 * **앞뒤로 다 오갈 수 있다.** 어느 화면에서든 한 칸 앞으로 돌아갈 길을 둔다 — 잘못 골랐을 때
 * 처음부터 다시 하게 만들지 않으려고. 그 길은 2026-10-14 부터 **맨 위 로고 줄의 뒤로 화살표**다
 * (본 앱과 같은 자리 — 아래 `LogoRow`). 전에는 화면마다 아래에 「이전」 버튼이 있었다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isTestClosed } from "@core/test-period";
import { middleShot } from "@core/attempt";
import { createPictureMaker } from "@core/picture-maker";
import { requestTransfer } from "@core/transfer-client";
import { createHairMasker } from "@screens/hair-segmenter";
import { ops } from "./lib/ops";
import Closed from "./screens/Closed";
import { armPhoneBack } from "./lib/phone-back";
import { createMovedJob } from "./lib/moved";
import RestartModal from "./screens/RestartModal";
import { API_BASE, hasAnswerServer, refReadCount, refToPartColors, templateColors, templateNumber, type PartColors } from "./api";
import type { PalettePart } from "@core/color-family";
import type { MakeupTemplate } from "@core/templates";
import type { Baseline } from "@core/types";
import Splash from "./screens/Splash";
import Intro from "./screens/Intro";
import Capture from "./screens/Capture";
import { Denied } from "./screens/Consent";
import Upload from "./screens/Upload";
import Templates from "./screens/Templates";
import Answer from "./screens/Answer";
import Palette from "./screens/Palette";
import PartGuide from "./screens/PartGuide";
import Live from "./screens/Live";
import Attempt, { type AttemptShots } from "./screens/Attempt";
import Feedback from "./screens/Feedback";
import Save from "./screens/Save";
import Done from "./screens/Done";
import { createGuideKeeper, liveOutlineOf, type GuideLoad } from "./lib/guide-source";
import { createFeedbackKeeper, type FeedbackLoad } from "./lib/feedback-source";
import type { Outline } from "@core/overlay";
import "./app.css";

/** 흐름 순서 — 위 표 그대로. 앞뒤로 한 칸 움직이는 길이 이 줄에서 나온다 */
const FLOW = [
  "consent",
  "capture",
  "upload",
  "answer",
  "palette",
  "partguide",
  "attempt",
  "feedback",
  "save",
  "done",
] as const;

/**
 * 순서 밖의 화면 — 스플래시(맨 앞) · 거절 뒤의 이용 불가 · 실시간 가이드(부위 가이드의 곁 화면) ·
 * 템플릿 고르기(참고 사진의 곁 화면). `step()` 이 이 넷을 모르는 채로 둬서 앞뒤로 오갈 때 지나치지 않게 한다.
 *
 * **템플릿 고르기가 2026-10-14 에 순서 밖으로 나왔다.** 본 앱도 그렇다 — `SCREEN_ORDER` 에
 * `templates` 가 없고, `backTarget("templates")` 가 참고 사진(`answer`)으로 돌아간다.
 * 사진을 올리는 길과 템플릿을 고르는 길은 **같은 자리의 두 갈래**라서, 순서의 한 칸이 되면
 * 「다음」을 누를 때마다 사진을 올린 사람도 템플릿 화면을 한 번 지나게 된다
 */
type Stage = (typeof FLOW)[number] | "splash" | "denied" | "live" | "templates";

/**
 * **아직 화면이 없는 단계** — 이제 하나도 없다.
 *
 * 비워 두는 방식: 순서(`FLOW`)에는 이름을 **남겨 두고**, 오갈 때만 건너뛴다. 흐름에서 지워
 * 버리면 나중에 끼울 자리를 다시 찾아야 하고, 그려 버리면 빈 화면이 흐름을 막는다.
 *
 * 촬영(capture)이 2026-10-14 에 빠지고, 같은 날 완성사진(attempt)도 빠졌다 — 화면이 와서 끼웠다.
 * 그때 한 일은 둘뿐이고 앞뒤로 오가는 코드(`step`)는 한 줄도 안 건드렸다. 다음에 자리를 비워 둘 일이
 * 생기면 똑같이 하면 된다 — ① 이 목록에 이름을 넣고 ② 그리는 곳의 한 줄을 뺀다
 */
const NOT_READY: readonly Stage[] = [];

/**
 * 로고 줄 — 본 앱 `.slot-logo-row` (flow-slots.ts 의 `logoRow`). 왼쪽에 뒤로 가는 동그란 화살표,
 * 그 옆에 로고. 돌아갈 곳이 없는 화면에서는 화살표 없이 로고만 그려서 **로고 자리가 그대로**이게 한다.
 *
 * 2026-10-14 에 넣었다. 전에는 로고만 그렸고 뒤로 가는 길이 화면 **아래**의 「이전」 버튼이었다 —
 * 본 앱은 어느 화면에서든 맨 위 화살표가 그 길이라, 나란히 놓으면 버튼 하나가 더 있는 화면으로 보였다.
 * 화살표를 넣으면서 아래의 「이전」은 뺐다 (같은 일을 하는 버튼이 한 화면에 둘이면 어느 쪽이 맞는지 헷갈린다).
 *
 * 화살표에는 글자가 없다 — 어디로 가는지는 `aria-label` 로만 알 수 있어서, 본 앱처럼 **갈 곳을 적는다**.
 */
function LogoRow({ back, onHome }: { back?: { label: string; onBack: () => void }; onHome?: () => void }) {
  const brand = (
    <span className="brand" aria-label="nudy">
      nudy
      <span className="heart" aria-hidden="true">
        ♥
      </span>
    </span>
  );
  return (
    <header className="slot-logo-row">
      {back && (
        <button type="button" className="slot-back" aria-label={back.label} onClick={back.onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
      )}
      {/*
        로고를 누르면 "처음부터 다시 할까요?" 를 묻고 지운 뒤 안내 화면으로 (본 앱 `.slot-home` + restart-modal, #404 · #454 C3).
        어느 화면에서든 처음으로 돌아갈 길이 하나는 있어야 한다 (#369). 지울 것이 없는 화면(동의 · 끝)은 로고만 그린다
      */}
      {onHome ? (
        <button type="button" className="slot-home" aria-label="처음 안내 화면으로" onClick={onHome}>
          {brand}
        </button>
      ) : (
        brand
      )}
    </header>
  );
}

/** 한 칸 앞(1)·뒤(-1) 단계. 아직 없는 단계는 건너뛴다. 더 갈 곳이 없으면 그대로 */
function step(from: Stage, by: 1 | -1): Stage {
  let i: number = FLOW.indexOf(from as (typeof FLOW)[number]);
  if (i < 0) return from;
  do {
    i += by;
  } while (i >= 0 && i < FLOW.length && NOT_READY.includes(FLOW[i]));
  return FLOW[i] ?? from;
}

/**
 * 테스트 기간이 끝났으면 앱을 켜지 않는다 (10월 19일 오후 3시부터, 본 앱 `boot()` 맨 앞 — #454 A1).
 * 주소에 `?team` 을 붙이면 연다. 모듈을 읽을 때 한 번만 본다 — 쓰는 도중에 시각이 지나도 하던 것은 끝낼 수 있게
 */
const CLOSED = isTestClosed(Date.now(), location.search);

export default function App() {
  if (CLOSED) return <Closed />;
  return <Running />;
}

function Running() {
  const [stage, setStage] = useState<Stage>("splash");
  /** 로고를 눌러 "처음부터 다시 할까요?" 를 묻는 중 */
  const [askingRestart, setAskingRestart] = useState(false);
  const [template, setTemplate] = useState<MakeupTemplate | null>(null);
  const [colors, setColors] = useState<PartColors | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * 촬영이 내놓은 것 — 기준(Baseline)과 얼굴형 판단용 정면 연속 사진.
   *
   * 상태(useState)가 아니라 ref 인 까닭: 이 값으로 **그리는 것이 아무것도 없다.**
   * 상태에 넣으면 사진 다섯 장을 담은 채 화면을 한 번 더 그리게 되고, 얻는 것이 없다.
   * 쓰는 쪽에는 `bare.current?.baseline` 을 props 로 내려 준다 — 단계가 바뀔 때 어차피 다시
   * 그리니까, 그때 ref 에는 이미 값이 들어 있다.
   *
   * 2026-10-14 부터 **실시간 가이드가 이것을 쓴다** (얼굴에 테두리를 붙일 기준 얼굴 점).
   * 완성사진(Attempt)은 안 쓴다 — 맨얼굴 대비 밝기 · 색을 일부러 안 보는 장이라 기준이 필요 없다
   * (그 까닭은 `screens/Attempt.tsx` 머리글 1번에 적혀 있다).
   */
  const bare = useRef<{ baseline: Baseline; faceShapeFrames: HTMLCanvasElement[] } | null>(null);

  /**
   * 완성사진이 내놓은 것 — 종류마다 사진 묶음. 맨얼굴과 같은 까닭으로 ref 다 (이 값으로 그리는 것이 없다).
   * 피드백(③)이 맨얼굴 · 정답사진과 맞춰 비교할 때 쓸 것이라, 지금 받는 화면이 없어도 버리지 않는다
   */
  const attempt = useRef<AttemptShots | null>(null);

  /**
   * 실시간 가이드(곁 화면)에 넘길 것 — 어느 부위를 보고 있었나와 그때의 맨얼굴 기준.
   *
   * 부위를 옮기는 일은 여전히 부위 가이드 안에서 끝난다. 여기 들어오는 것은 **곁 화면으로 갈 때 한 번**뿐이고,
   * 돌아온 뒤에도 그대로 둬서 부위 가이드가 보고 있던 부위를 다시 펼친다 (`startPart`).
   *
   * 기준(`bare.current`)을 **그 순간에 읽어 함께 담는** 까닭: ref 는 그릴 때 읽는 물건이 아니다.
   * 그릴 때마다 `bare.current` 를 읽으면 ref 가 늦게 채워졌을 때 화면이 다시 그려지지 않아 조용히 틀린다 —
   * 버튼을 누르는 그 순간(이벤트)에 한 번 읽으면 그런 일이 없다
   */
  const [live, setLive] = useState<{ part: PalettePart; baseline: Baseline | null; outline: Outline | null } | null>(
    null,
  );

  /**
   * 정답사진 화면에 넘길 것 — 서버로 보낼 화장 출처와, 화면에 보여 줄 참고 사진.
   *
   * 두 갈래가 여기서 **하나로 모인다**: 올린 사진이면 그 파일, 템플릿이면 번호 하나다
   * (본 앱 `TransferRef` 와 같은 갈래 — 템플릿 사진은 서버가 들고 있어서 번호만 보낸다).
   * `read` 는 참고 사진에서 몇 부위의 색을 읽었는지다 — 정답사진 화면이 그 수를 글로 말한다.
   *
   * 맨얼굴(`bareImage`)을 **여기 함께 담는** 까닭은 실시간 가이드(`live`)와 같다 — ref 는 그릴 때
   * 읽는 물건이 아니다. 그릴 때마다 `bare.current` 를 읽으면 촬영이 사진을 늦게 채웠을 때
   * (인코딩이 끝난 뒤에 들어온다) 화면이 다시 그려지지 않아 조용히 "맨얼굴이 없어요" 가 된다.
   * 사진을 올리거나 템플릿을 고르는 **그 순간(이벤트)에 한 번** 읽으면 그런 일이 없다
   */
  const [answer, setAnswer] = useState<{
    source: { photo: File } | { template: number };
    preview: string;
    read: number;
    bareImage: Blob | null;
  } | null>(null);

  /**
   * 화면에 들어올 때마다 사용 기록에 적는다 (본 앱 shell.ts 의 `screen_enter`, #454 A3 · A4).
   * 어느 화면으로 적을지는 `lib/ops` 의 표가 정한다 — 이 버전이 펼쳐 놓은 화면도 본 앱 이름으로 적힌다
   */
  useEffect(() => {
    ops().enter(stage);
  }, [stage]);

  /** 맨얼굴 사진 한 장 — 촬영이 인코딩까지 끝낸 뒤 기준에 붙여 둔 것. 아직 없으면 null */
  const bareImage = (): Blob | null => {
    const img = bare.current?.baseline.bareImage;
    return img instanceof Blob ? img : null;
  };

  /**
   * 서버가 만들어 준 정답사진을 보여 줄 주소.
   *
   * 뒤 화면들(피드백 · 저장)이 "참고 그림" 자리에 이것을 쓴다. 본 앱의 원칙은 **정답사진을 만든 뒤
   * 다른 사람 사진(참고 사진)을 바로 놓는 것**이라, 그림이 오면 아래 `refTemplate` 의 그림도
   * 참고 사진에서 이 그림으로 바뀐다. 서버가 안 붙어 있으면 그림이 없어 참고 사진이 그대로 남는데,
   * 그것은 줄여서 메모리에만 든 미리보기고 어디에도 저장하지 않는다
   */
  const [madeUrl, setMadeUrl] = useState<string | null>(null);

  /**
   * 같은 정답사진의 **원본**. 부위 가이드는 보여 줄 주소(`madeUrl`)가 아니라 이것이 필요하다 —
   * 사진을 픽셀로 풀어 맨얼굴과 견주고 부위별 화장을 떼어야 테두리가 나온다 (`lib/guide-source`).
   *
   * ref 인 까닭은 맨얼굴(`bare`)과 같다 — 이 값으로 **그리는 것이 없다** (그리는 것은 `madeUrl` 이다).
   * 상태에 넣으면 사진 한 장을 담은 채 화면을 한 번 더 그리게 되고 얻는 것이 없다
   */
  const madeBlob = useRef<Blob | null>(null);

  /**
   * 부위 가이드 재료 보관함 — 본 앱 `main.ts` 의 `createGuideKeeper` 자리다.
   *
   * **한 번만 만들고 App 이 들고 있는다.** 부위 가이드 화면 안에 두면 실시간 가이드에 다녀올
   * 때마다 화면이 새로 그려져 사진을 다시 풀게 된다 (한 번에 1초 안팎). 보관함은 **같은
   * 정답사진이면 만들어 둔 것을 그대로** 주므로, 부위를 넘기든 곁 화면에 다녀오든 한 번만 만든다.
   * 개발 모드(StrictMode)에서 효과가 두 번 돌아도 같은 약속을 두 번 받을 뿐이다.
   *
   * 들고 있는 정답사진 그림(ImageBitmap)은 `drop()` 으로 놓는다 — 아래 `clear` · `restart` 가
   * 정답사진을 버릴 때 같이 부른다. 안 놓으면 다시 고를 때마다 그림이 쌓인다
   */
  const guides = useRef<ReturnType<typeof createGuideKeeper> | null>(null);
  guides.current ??= createGuideKeeper({
    getBaseline: () => bare.current?.baseline ?? null,
    // 보관함은 `image` 가 **같은 Blob 인지**로 "같은 정답사진" 을 가린다 — 담는 그릇은 새로 만들어도 된다
    getAnswer: () => (madeBlob.current ? { image: madeBlob.current } : null),
  });

  /**
   * 부위 가이드가 부르는 길. **한 번 만들고 바꾸지 않는다** — 그릴 때마다 새로 만들면
   * 부위 가이드의 효과가 다시 돌아 재료를 또 받으러 간다
   */
  const getGuide = useCallback((): Promise<GuideLoad> => guides.current!.get(), []);

  /**
   * 피드백 채점 보관함 — 위 `guides` 와 **같은 자리 · 같은 까닭**이다 (2026-10-14).
   *
   * 피드백 화면 안에 두면 화면을 다시 들어올 때마다 사진 세 장을 풀고 다시 잰다 (한 번에 몇 초).
   * 보관함은 **정답사진과 완성사진 묶음이 그대로면** 재 둔 것을 그대로 주므로, 저장 화면에
   * 다녀오든 개발 모드(StrictMode)에서 효과가 두 번 돌든 한 번만 잰다.
   *
   * 옮긴 그림(`getMoved`)과 머리카락 분할(`getHair`)을 둘 다 넘긴다 (2026-10-15) — 본 앱 `getFeedback` 과 같은 재료다
   */
  /**
   * 옮긴 그림 만들기 — 본 앱 `main.ts` 의 `maker` · `movedJob` · `getMoved` (#454 B1 · B4, 2026-10-15).
   *
   * 시도사진을 찍으면 **가운데 장**(`middleShot`)과 맨얼굴을 서버로 보내 「옮긴 그림」을 만들어 둔다 (`kind: "moved"`).
   * 화면에는 안 보여 주고 피드백이 계산에만 쓴다 — 라이너 줄이 이것으로 나온다 (③ #392 · #394 · #376).
   * 부품은 본 앱 `core/picture-maker` 그대로: 같은 사진이면 한 번만 보내고, `cancel()` 뒤에 온 그림은 버린다.
   * 정답사진은 전처럼 `api.makeAnswerPicture` 가 만든다 — 이 maker 는 옮긴 그림만 맡는다
   */
  const maker = useRef<ReturnType<typeof createPictureMaker> | null>(null);
  maker.current ??= createPictureMaker({
    getBare: async () => bareImage(),
    getAttempt: () => middleShot(attempt.current?.front_open)?.blob ?? null,
    // 테스트 기간 보관 — 옮긴 그림 (본 앱 `put` 의 `keeper.keep(key, picture)`). 폰에는 두지 않는다
    put: async (key, picture) => {
      ops().keeper.keep(key, picture);
    },
    request: (b, ref, kind) => requestTransfer(b, ref, { base: API_BASE, kind }),
  });
  /** 옮긴 그림 작업 — 시도사진을 찍으면 start, 피드백이 get 으로 기다린다 (`lib/moved`). 서버가 없으면 시작하지 않는다 */
  const movedJob = useRef<ReturnType<typeof createMovedJob> | null>(null);
  movedJob.current ??= createMovedJob({ maker: maker.current, enabled: () => hasAnswerServer });
  const getMoved = useCallback((): Promise<Blob | null> => movedJob.current!.get(), []);

  /**
   * 머리카락 분할 (본 앱 `screens/hair-segmenter`, #454 B2) — 피드백이 맨얼굴 · 시도사진에서 머리카락 자리를 빼고 잰다.
   * 모델은 처음 부를 때 한 번 받고(`createHairMasker`), 시도사진을 찍을 때 미리 받기 시작한다 (아래 Attempt `onDone`).
   * 못 받으면 사용 기록에 한 번 남기고 마스크 없이 간다 — 본 앱 `main.ts` 와 같다
   */
  const hairMask = useRef<ReturnType<typeof createHairMasker> | null>(null);
  hairMask.current ??= createHairMasker(undefined, (e) =>
    ops().log.log({ name: "error", where: "hair", msg: (e instanceof Error ? e.message : String(e)).slice(0, 120) }),
  );

  const feedbacks = useRef<ReturnType<typeof createFeedbackKeeper> | null>(null);
  feedbacks.current ??= createFeedbackKeeper({
    getBaseline: () => bare.current?.baseline ?? null,
    getAttempt: () => attempt.current,
    getAnswer: () => (madeBlob.current ? { image: madeBlob.current } : null),
    getMoved,
    getHair: hairMask.current,
  });

  /** 피드백 화면이 부르는 길. 가이드와 같게 **한 번 만들고 바꾸지 않는다** */
  const getFeedback = useCallback((): Promise<FeedbackLoad> => feedbacks.current!.get(), []);

  /**
   * 테스트 기간 보관 — 판정 결과(글)도 같이 둔다 (본 앱 main.ts `keeper.keepFeedback`, #454 A2).
   * 보관함은 같은 재료면 같은 결과를 다시 주므로, **결과 묶음마다 한 번만** 보낸다 (WeakSet 으로 가린다)
   */
  const keptFeedback = useRef(new WeakSet<object>());
  const getFeedbackKept = useCallback(async (): Promise<FeedbackLoad> => {
    const r = await getFeedback();
    if (r.ok && !keptFeedback.current.has(r.view)) {
      keptFeedback.current.add(r.view);
      ops().keeper.keepFeedback(r.view.feedback);
    }
    return r;
  }, [getFeedback]);

  /**
   * 템플릿을 고르면 색을 받아온다. 처음 고를 때와 "다시 시도" 가 **같은 길**을 지난다 —
   * 실패한 뒤 다시 눌렀을 때 화면과 색이 어긋나지 않게.
   *
   * 2026-10-14 부터 색을 받은 뒤 **정답사진 화면으로** 간다 (전에는 곧바로 팔레트였다).
   * 본 앱도 그렇다 — 템플릿을 고르면 참고 사진 화면으로 돌아와 `runTemplate` 이 돌고,
   * 서버에는 사진 대신 템플릿 번호를 보낸다. 사진을 올린 길과 받은 뒤 화면이 똑같다
   */
  const load = async (t: MakeupTemplate): Promise<void> => {
    setTemplate(t);
    setLoading(true);
    setFailed(false);
    try {
      setColors(await templateColors(t.id));
      // 템플릿은 색을 미리 재 둔 것이라 다섯 부위가 늘 다 있다 (public/templates/prep/templates.json)
      setAnswer({ source: { template: templateNumber(t.id) }, preview: t.thumb, read: 5, bareImage: bareImage() });
      setStage("answer");
    } catch {
      // 무엇이 틀렸는지(주소·파일 모양)는 사용자가 어쩔 수 있는 일이 아니다 — 할 수 있는 일만 말한다
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 사진을 올려 색을 읽었을 때 (`Upload.tsx`) — 템플릿을 고른 것과 **같은 자리에 들어간다.**
   * 뒤 화면들은 `MakeupTemplate` 하나를 받아 이름과 그림을 그리므로, 올린 사진도 그 모양으로 싸 둔다
   * (본 앱 `template-store` 주석의 "템플릿 사진을 올린 사진과 똑같이 다룬다" 를 반대 방향으로 한 셈이다)
   */
  const picked = (colors: PartColors, preview: string, photo: File, read: number): void => {
    setTemplate({ id: "ref", name: "올린 사진", about: "올려 주신 참고 사진의 화장", thumb: preview });
    setColors(colors);
    setAnswer({ source: { photo }, preview, read, bareImage: bareImage() });
    setFailed(false);
    setStage("answer");
  };

  /**
   * 정답사진이 왔을 때. 주소를 만들어 들고, 앞에 들고 있던 것은 놓는다.
   *
   * `useCallback` 인 까닭: 이 함수가 매번 새로 만들어지면 `Answer` 안의 "보내기" 가 달라진 것으로
   * 보여 효과(useEffect)가 다시 돈다. 보내기를 한 번만 막아 두긴 했지만, 거기 기대지 않는 편이 낫다
   */
  const keepMade = useCallback((picture: Blob): void => {
    // 원본도 같이 들고 있는다 — 부위 가이드가 이것을 풀어 테두리를 만든다.
    // 앞의 사진으로 만들어 둔 가이드는 보관함이 다음에 부를 때 스스로 놓는다 (사진이 달라졌으니까)
    madeBlob.current = picture;
    // 테스트 기간 보관 — 정답사진 (본 앱 main.ts `put` 의 `keeper.keep(key, picture)`, #454 A2). 참고 사진은 보내지 않는다
    ops().keeper.keep("answer", picture);
    setMadeUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(picture);
    });
  }, []);

  /** 고른 것을 비우고 정해진 화면으로 */
  const clear = (to: Stage): void => {
    setStage(to);
    setTemplate(null);
    setColors(null);
    setAnswer(null);
    // 정답사진을 버리는 자리다 — 보여 주던 주소(objectURL)와 가이드가 붙들고 있던
    // 그림(ImageBitmap)을 **둘 다** 놓는다. 한쪽만 놓으면 다시 고를 때마다 나머지가 쌓인다
    madeBlob.current = null;
    guides.current?.drop();
    // 피드백이 들고 있던 사진 두 장의 주소(objectURL)도 같이 놓는다 — 정답사진을 버리는 자리는 여기 하나다
    feedbacks.current?.drop();
    setMadeUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setFailed(false);
  };

  /**
   * 끝 화면의 「다시 하기」 — **스플래시는 건너뛰고 동의부터** 간다.
   * 다시 할 때마다 2초를 또 기다리게 하면 성가시다. 스플래시는 앱을 켤 때 한 번이면 된다.
   * 동의를 다시 묻는 것은 본 앱과 같다 (세션마다 묻는다).
   */
  const restart = (): void => {
    // 찍은 맨얼굴·완성사진도 같이 버린다 — 처음부터 다시 하는 사람은 다음 사람일 수도 있다.
    // 메모리에만 들고 있던 것이라 비우면 그대로 사라진다 (어디에도 저장하지 않는다)
    bare.current = null;
    attempt.current = null;
    movedJob.current!.cancel();
    setLive(null);
    // 새 세션 — 앞 세션의 보내기를 멈추고 세션 번호를 새로 (본 앱 `clearAll` + `restartSession` 의 이 버전 몫, #454 A6)
    ops().restart();
    clear("consent");
  };

  /**
   * 뒤 화면들(팔레트 · 피드백 · 저장)에 넘길 참고 그림 묶음.
   *
   * 정답사진이 왔으면 **그림을 그것으로 바꿔** 넘긴다. 템플릿 썸네일이든 올린 참고 사진이든,
   * 화장을 다 한 뒤 견주어 볼 그림은 "그 화장을 내 얼굴에 입힌 것" 이어야 한다 (본 앱도 그림 자리에
   * 정답사진을 쓴다). 서버가 없으면 그림이 없어 참고 사진이 그대로 남는다
   */
  const shown = template && madeUrl ? { ...template, thumb: madeUrl } : template;

  /**
   * 폰의 뒤로 버튼 — 맨 위 화살표와 같은 곳으로 (`lib/phone-back`, #454 C4). 화살표는 그릴 때마다 새로 계산되니
   * ref 에 넣어 두고(아래 `backRef.current = …`) 듣는 쪽은 한 번만 건다. 화살표가 없는 화면(동의 · 촬영 · 끝 …)에서는
   * 막지 않고 사이트를 나간다. 훅은 스플래시의 이른 return 앞에 있어야 한다 (훅 순서 규칙)
   */
  const backRef = useRef<{ stage: Stage; onBack: () => void } | null>(null);
  useEffect(
    () =>
      armPhoneBack({
        back: () => backRef.current,
        log: (button) => ops().log.log({ name: "button", button }),
      }),
    [],
  );

  // 스플래시는 폰 화면을 꽉 채우는 그림이라 로고 줄(.brand) 위에 겹치지 않게 혼자 그린다
  if (stage === "splash") return <Splash onDone={() => setStage("consent")} />;

  /**
   * 맨 위 화살표가 갈 곳 — 한 칸 뒤. 없는 화면은 화살표를 안 그린다.
   *
   * 촬영 · 완성사진 · 실시간 가이드는 **여기 넣지 않는다.** 그 셋은 카메라를 쥐고 있어서
   * 화면이 제 안에서 「이전」을 그리고, 그 버튼이 카메라를 못 열었을 때의 길까지 함께 맡는다
   * (`Live` 는 `onBack` 을 받았는지로 **곁 화면인지**까지 가른다 — 빼앗으면 옛 흐름으로 돈다).
   * 거절 뒤의 이용 불가와 끝 화면도 없다 — 본 앱도 그 둘에는 화살표가 없다.
   *
   * 부위 가이드의 화살표는 **한 부위 앞이 아니라 팔레트로** 간다. 부위를 거슬러 가는 길은
   * 위의 진행 칩이 맡는다 (본 앱은 칩이 `display:none` 이라 화살표가 그 일까지 해야 했다)
   *
   * 템플릿 고르기는 순서 밖이라 `step()` 을 쓰지 않고 **참고 사진으로 곧바로** 돌아간다
   * (본 앱 `backTarget("templates") → "answer"`). 실시간 가이드와 같은 짜임이다
   */
  const back = ((): { label: string; onBack: () => void } | undefined => {
    if (stage === "upload") return { label: "사진 촬영으로 돌아가기", onBack: () => clear(step("upload", -1)) };
    if (stage === "templates") return { label: "참고 사진으로 돌아가기", onBack: () => clear("upload") };
    if (stage === "answer") return { label: "참고 사진으로 돌아가기", onBack: () => clear(step("answer", -1)) };
    if (stage === "palette") return { label: "예상 메이크업으로 돌아가기", onBack: () => setStage(step("palette", -1)) };
    if (stage === "partguide") return { label: "색조 팔레트로 돌아가기", onBack: () => setStage(step("partguide", -1)) };
    // 피드백의 한 칸 뒤는 **완성사진**이다 (FLOW: partguide → attempt → feedback).
    // 전에는 "부위 가이드로 돌아가기" 라고 적혀 있어서, 화면을 읽어 주는 기기가 엉뚱한 곳을 알려 줬다
    if (stage === "feedback") return { label: "완성사진으로 돌아가기", onBack: () => setStage(step("feedback", -1)) };
    if (stage === "save") return { label: "피드백으로 돌아가기", onBack: () => setStage(step("save", -1)) };
    return undefined;
  })();

  backRef.current = back ? { stage, onBack: back.onBack } : null;

  /**
   * 로고의 "처음으로" — 지울 것이 생긴 뒤(촬영부터)에만 묻는다. 동의 · 거절 · 끝 화면은 지울 것이 없어 로고만.
   * 묻는 창에서 "지우고 다시 시작" 을 누르면 `restart()`(사진 · 그림 · 세션 번호 전부 새로) 뒤 동의 화면으로
   */
  const onHome = ["consent", "denied", "done"].includes(stage)
    ? undefined
    : () => {
        ops().log.log({ name: "button", button: "home:ask" });
        setAskingRestart(true);
      };

  return (
    <div className="app">
      <LogoRow back={back} onHome={onHome} />
      {askingRestart && (
        <RestartModal
          onRestart={() => {
            ops().log.log({ name: "button", button: "restart_yes" });
            setAskingRestart(false);
            restart();
          }}
          onCancel={() => {
            ops().log.log({ name: "button", button: "restart_no" });
            setAskingRestart(false);
          }}
        />
      )}

      {loading && (
        <p className="notice" role="status">
          색을 불러오고 있어요…
        </p>
      )}

      {/* 실패해도 흐름을 막지 않는다 — "다시 시도" 와 "다른 화장 고르기" 를 둘 다 열어 둔다 */}
      {!loading && failed && (
        <div className="notice card">
          <p>색을 불러오지 못했어요. 잠깐 뒤에 다시 눌러 주세요.</p>
          <div className="row">
            <button type="button" className="go ghost" onClick={() => clear("upload")}>
              다른 화장 고르기
            </button>
            <button type="button" className="go" onClick={() => template && void load(template)}>
              다시 시도
            </button>
          </div>
        </div>
      )}

      {!loading && !failed && (
        <>
          {/*
            동의는 **한 화면**이다 — 안내 화면 위에 처리 안내가 모달로 뜬다 (본 앱과 같은 짜임).
            창을 여닫는 일은 Intro 안에서 끝나고, 여기로는 "동의했다 · 거절했다" 만 올라온다
          */}
          {stage === "consent" && (
            <Intro
              onAgree={() => {
                // 이때부터 사용 기록과 사진이 서버로 간다 (본 앱 `setConsent` + `events.consent`, #454 A3)
                ops().consent(true);
                setStage(step("consent", 1));
              }}
            />
          )}

          {/* 거절하면 여기서 멈춘다. "다시 생각해 볼게요" 로 동의 화면으로 돌아간다 (본 앱 denied) */}
          {stage === "denied" && <Denied onBack={() => setStage("consent")} />}

          {/*
            촬영 — 맨얼굴 한 장. 다 찍으면 기준과 얼굴형 프레임을 받아 들고 템플릿 고르기로 넘어간다.
            `logger` · `events` 는 운영 연결(`lib/ops`)의 것 — 모든 화면이 같은 세션 번호로 적는다 (#454 A4).
            `saveBare` 는 폰 저장이 아니라 **서버 보관**(테스트 기간, `/keep`)으로 간다 — 폰에는 여전히 사진을 두지 않는다
          */}
          {stage === "capture" && (
            <Capture
              logger={ops().log}
              events={ops().events}
              // 테스트 기간 보관 — 맨얼굴 (본 앱 main.ts `saveBare` 의 `keeper.keep("bare", b)`). 폰에는 두지 않는다
              saveBare={(blob) => blob.then((b) => ops().keeper.keep("bare", b))}
              onDone={(baseline, faceShapeFrames) => {
                bare.current = { baseline, faceShapeFrames };
                // 맨얼굴이 바뀌면 옛 맨얼굴로 만들던 옮긴 그림은 버린다 (본 앱 `setBaseline` → `maker.cancel`)
                movedJob.current!.cancel();
                setStage(step("capture", 1));
              }}
              onBack={() => setStage(step("capture", -1))}
            />
          )}

          {/*
            참고 사진 올리기 — 본 앱 참고 사진 화면의 앞칸. 고른 사진의 색은 **이 폰에서** 읽는다
            (`lib/ref-analyze`). 읽은 것은 템플릿을 고른 것과 같은 자리(`picked`)에 들어가서,
            그다음 화면들은 어느 길로 왔는지 모른다
          */}
          {stage === "upload" && (
            <Upload
              onDone={(found, photo) =>
                picked(refToPartColors(found.colors), found.preview, photo, refReadCount(found.colors))
              }
              onTemplates={() => setStage("templates")}
            />
          )}

          {/*
            템플릿 고르기 — **흐름의 한 칸이 아니다.** 사진 올리기와 같은 자리의 두 갈래라서,
            「템플릿 선택」으로 들어왔다 뒤로 화살표로 돌아간다 (본 앱 `backTarget("templates") → "answer"`).
            고르면 색을 받아(`load`) 정답사진 화면으로 간다 — 사진을 올린 길과 그 뒤가 똑같다
          */}
          {stage === "templates" && <Templates onPick={(t) => void load(t)} />}

          {/*
            정답사진(예상 메이크업) — 맨얼굴 + 참고 사진(또는 템플릿 번호)을 서버로 보낸다.
            맨얼굴은 촬영이 내놓은 `baseline.bareImage` 다 (인코딩이 끝난 뒤 채워진다 — 없으면
            Answer 가 `no_bare` 로 안내하고 그래도 다음으로 갈 수 있다).
            서버 주소가 비어 있으면 아예 부르지 않고 참고 사진을 그대로 보여 준다 (본 앱과 같다)
          */}
          {stage === "answer" && answer && (
            <Answer
              source={answer.source}
              preview={answer.preview}
              read={answer.read}
              bare={answer.bareImage}
              made={madeUrl}
              onMade={keepMade}
              onNext={() => setStage(step("answer", 1))}
            />
          )}

          {/*
            끝 — 본 앱 `screens/done.ts` 자리. 템플릿 · 색이 **없어도** 그려야 한다:
            저장 화면에서 「끝내기」를 누르면 고른 것을 버릴 수도 있고, 어차피 보여 줄 것이
            "끝났어요" 한 줄과 「다시 하기」뿐이다. 그래서 아래 묶음(template && colors)이 아니라 여기 둔다
          */}
          {stage === "done" && <Done onRestart={restart} />}
        </>
      )}

      {/*
        팔레트부터는 참고 그림과 색이 둘 다 있어야 그릴 수 있다 — 한쪽만 있는 상태로는 들어오지 않는다.
        참고 그림(`shown`)은 올린 사진으로 왔든 템플릿으로 왔든 같은 모양이라 그 뒤 화면들은 가리지 않는다
      */}
      {!loading && !failed && shown && colors && (
        <>
          {stage === "palette" && (
            <Palette template={shown} colors={colors} onNext={() => setStage(step("palette", 1))} />
          )}
          {stage === "partguide" && (
            <PartGuide
              colors={colors}
              startPart={live?.part}
              /*
                정답사진이 **왔을 때만** 넘긴다. 서버가 안 붙었거나 못 만들었으면 안 넘겨서
                부위 가이드가 기다리는 줄 없이 곧바로 자리표시를 그리게 한다 (흐름을 막지 않는다)
              */
              getGuide={madeUrl ? getGuide : undefined}
              onDone={() => setStage(step("partguide", 1))}
              onLive={(part) => {
                /*
                  실시간 가이드에 넘길 테두리를 **그 순간에 한 번** 뽑는다 (본 앱 `getOutline` 자리).
                  기다리지 않고 `peek` 으로 꺼내는 것도 본 앱과 같다 — 여기까지 왔으면 보통 이미 있다.
                  아직 없거나 그 부위의 화장을 못 찾았으면 null 이고, 그러면 Live 가 옛 표준 틀을
                  「예시」 딱지와 함께 그린다. **그릴 때마다 새로 만들면 안 된다** — Live 의 효과
                  의존성에 들어 있어서 테두리가 매번 처음으로 돌아간다
                */
                const view = guides.current?.peek() ?? null;
                const baseline = bare.current?.baseline ?? null;
                setLive({ part, baseline, outline: view && baseline ? liveOutlineOf(view, part, baseline) : null });
                setStage("live");
              }}
            />
          )}

          {/*
            실시간 가이드 — **흐름의 한 칸이 아니다.** `step()` 을 쓰지 않고 부위 가이드와 곧바로 오간다
            (본 앱 `SIDE_OF = { live: "partguide" }`, #334). 그래서 「다음」으로는 여기 못 들어오고,
            「이전」은 늘 부위 가이드로 돌아간다 — 돌아갈 때 `live` 를 그대로 둬서 보고 있던 부위가 다시 펼쳐진다.

            넘기는 것:
             - `part`  부위 가이드에서 보고 있던 그 부위
             - `baseline`  촬영이 내놓은 맨얼굴 기준 (테두리를 붙일 기준 얼굴 점). 없으면 Live 가
               「촬영하러 가기」만 띄운다 — 촬영을 건너뛰고 들어온 사람이 막히지 않게 길을 열어 둔다
             - `outline`  정답사진에서 뽑은 그 부위 테두리 — **부위 가이드(사진)와 같은 모양**을
               카메라 속 얼굴 위에 보여 준다 (2026-10-14, 본 앱 `getOutline`). 「실시간 가이드로 보기」를
               누른 그 순간에 한 번 뽑아 `live` 에 담아 둔 것이라, 다시 그려도 같은 물건이다 —
               Live 의 효과 의존성에 들어 있어서 매번 새로 만들면 테두리가 처음으로 돌아간다.
               정답사진이 없거나 그 부위의 화장을 못 찾았으면 null 이고, 그러면 Live 가 옛 표준 틀을
               「예시」 딱지와 함께 그린다 (본 앱이 정답사진을 못 만들었을 때와 같은 자리)
             - `onDone` 은 **안 넘긴다** — 「확인받기」 묶음을 받을 화면(본 앱 화면 5)이 없다.
               안 넘기면 버튼이 「이전」 하나가 되고, 채점 조건으로 막지 않는다 (#413)
          */}
          {stage === "live" && live && (
            <Live
              logger={ops().log}
              part={live.part}
              baseline={live.baseline}
              outline={live.outline}
              onBack={() => setStage("partguide")}
              onToCapture={() => setStage("capture")}
            />
          )}

          {/*
            완성사진 — 화장을 다 한 뒤 한 장. 다 찍으면 묶음을 받아 들고 피드백으로 넘어간다.
            맨얼굴(`bare`)은 **안 넘긴다** — 맨얼굴 대비 밝기·색을 일부러 안 보는 장이라 쓸 데가 없다
            (Attempt.tsx 머리글 1번). `logger` 는 운영 연결의 것 (촬영과 같다)
          */}
          {stage === "attempt" && (
            <Attempt
              logger={ops().log}
              onDone={(shots) => {
                attempt.current = shots;
                // 테스트 기간 보관 — 눈 뜬 장 다섯까지 (본 앱 main.ts `setAttempt` 의 `keepAttempt`)
                ops().keepAttempt(shots.front_open.map((s) => s.blob));
                // 머리카락 분할 모델을 미리 받아 둔다 (#429) — 피드백이 쓸 때 기다리지 않게. 받는 동안 화면은 안 막는다
                void hairMask.current!({ data: new Uint8ClampedArray(16 * 16 * 4), w: 16, h: 16 });
                // 옛 시도사진으로 만들던 옮긴 그림은 못 쓴다 — 버리고 새로 시작한다 (본 앱 `setAttempt`). 서버가 없으면 시작하지 않는다
                movedJob.current!.start();
                setStage(step("attempt", 1));
              }}
              onBack={() => setStage(step("attempt", -1))}
            />
          )}

          {/*
            피드백 — 예상 메이크업과 완성사진을 **진짜로 견준다** (2026-10-14).
            `getFeedback` 은 위 보관함이라 화면을 다시 들어와도 다시 채점하지 않는다.
            재료가 모자라면(맨얼굴 · 정답사진 · 완성사진 없음) 화면이 까닭을 적고 본보기 문장으로
            떨어진다 — 그래서 **늘 넘긴다** (부위 가이드처럼 정답사진 유무로 가리지 않는다).
            `onRetake` 는 사진 조건이 달라 판정이 막혔을 때만 쓰는 길이다 (한 칸 뒤 = 완성사진)
          */}
          {stage === "feedback" && (
            <Feedback
              template={shown}
              colors={colors}
              getFeedback={getFeedbackKept}
              onNext={() => setStage(step("feedback", 1))}
              onRetake={() => setStage(step("feedback", -1))}
            />
          )}
          {/*
            「끝내기」는 **끝 화면으로** 간다 (본 앱 save → done). 처음으로 돌아가는 길은 그 다음 화면에 하나만 둔다.

            `getFeedback` 은 **피드백 화면에 넘기는 것과 같은 보관함**이다 (2026-10-14) — 「결과 저장」이
            예상 메이크업 · 완성사진 · 피드백을 한 장으로 만들 때 그 재료를 거기서 받는다. 같은 것을
            넘기므로 저장 화면에 와서 다시 채점하지 않고, 재료가 모자라면 저장 화면이 까닭을 적는다
            (`Save.tsx` 머리글). 한 장을 그리는 것은 **누를 때** 하므로 App 이 들고 있을 것은 없다
          */}
          {stage === "save" && (
            <Save
              template={shown}
              colors={colors}
              getFeedback={getFeedbackKept}
              onDone={() => {
                // 「끝내기」 — 세션이 끝났다고 적고 남은 기록을 보낸다 (본 앱 `session_end`)
                ops().end("save");
                setStage(step("save", 1));
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
