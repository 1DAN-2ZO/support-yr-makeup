/**
 * 폰의 뒤로 버튼 (#369, #454 C4) — 누르면 사이트를 나가지 않고 화면 안의 "뒤로" 와 같은 자리로 간다.
 * 본 앱 `screens/phone-back.ts` 의 `armPhoneBack` 과 같은 짜임이다.
 *
 * 앱은 주소가 하나라(화면을 바꿔도 주소가 안 바뀐다) 폰의 뒤로 버튼 · 아이폰의 옆으로 밀기가 곧 "사이트 나가기" 였다.
 * 브라우저 기록에 한 칸을 쌓아 두고, 뒤로가 눌리면(popstate) 그 칸을 다시 쌓으면서 앱 안에서 한 화면 앞으로 간다.
 * 앞 화면이 없는 곳(동의 · 촬영 · 끝 …)에서는 막지 않는다 — 한 번 더 뒤로 보내 원래대로 나가게 한다.
 *
 * 어디로 가는지는 본 앱처럼 `core/screens` 의 표가 아니라 **App 의 맨 위 화살표(`back`)와 같은 곳**이다 —
 * 이 버전은 화면 이름이 본 앱과 달라(upload · palette …) 그 표를 그대로 못 쓰고, 화살표가 이미 같은 규칙을 들고 있다
 */
export interface PhoneBackDeps {
  /** 지금 화면의 "뒤로" — 없으면 막지 않는다 */
  back: () => { stage: string; onBack: () => void } | null;
  /** 사용 기록에 남길 버튼 이름 */
  log: (button: string) => void;
  history?: Pick<History, "pushState" | "back">;
  listen?: (onPop: () => void) => () => void;
}

/** 켠다. 끄는 함수를 돌려준다 */
export function armPhoneBack(d: PhoneBackDeps): () => void {
  const history = d.history ?? window.history;
  const listen =
    d.listen ??
    ((onPop: () => void) => {
      window.addEventListener("popstate", onPop);
      return () => window.removeEventListener("popstate", onPop);
    });
  const hold = (): void => history.pushState({ nudy: 1 }, "");
  hold();
  return listen(() => {
    const b = d.back();
    if (!b) {
      history.back();
      return;
    }
    hold();
    d.log(`back_phone:${b.stage}`);
    b.onBack();
  });
}
