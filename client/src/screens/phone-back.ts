/**
 * 폰의 뒤로 버튼 (#369, 모듈 ⑥) — 누르면 사이트를 나가지 않고 화면 안의 "뒤로" 와 같은 자리로 간다.
 *
 * 앱은 주소가 하나라(화면을 바꿔도 주소가 안 바뀐다) 폰의 뒤로 버튼 · 아이폰의 옆으로 밀기가 곧 "사이트 나가기" 였다.
 * 브라우저 기록에 한 칸을 쌓아 두고, 뒤로가 눌리면(popstate) 그 칸을 다시 쌓으면서 앱 안에서 한 화면 앞으로 간다.
 * 앞 화면이 없는 곳(동의 · 촬영 · 예상 메이크업 · 끝)에서는 막지 않는다 — 한 번 더 뒤로 보내 원래대로 나가게 한다.
 * 어디로 가는지는 core/screens backTarget (화면 안의 뒤로 버튼과 같은 규칙).
 */

import { backTarget, type ScreenId } from "@core/screens";
import type { PartId } from "@core/types";

export interface PhoneBackDeps {
  /** 뒤로가 눌렸을 때 부를 것을 건다. 푸는 함수를 돌려준다 */
  listen: (onPop: () => void) => () => void;
  history: Pick<History, "pushState" | "back">;
  /** 지금 화면 · 부위 */
  where: () => { screen: ScreenId; part: PartId | null };
  go: (to: ScreenId) => void;
  goPart: (part: PartId) => void;
  /** 사용 기록에 남길 버튼 이름 */
  log: (button: string) => void;
}

/** 켠다. 끄는 함수를 돌려준다 */
export function armPhoneBack(d: PhoneBackDeps): () => void {
  const hold = (): void => d.history.pushState({ nudy: 1 }, "");
  hold();
  return d.listen(() => {
    const at = d.where(), to = backTarget(at.screen, at.part);
    if (!to) { d.history.back(); return; }
    hold();
    d.log(`back_phone:${at.screen}`);
    if (to.part) d.goPart(to.part); else d.go(to.screen);
  });
}
