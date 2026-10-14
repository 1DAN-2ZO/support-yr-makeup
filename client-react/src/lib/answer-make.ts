/**
 * 정답사진 만들기 — 정답사진 화면이 서버를 부를 때 쓰는 것 (본 앱 screens/answer-make.ts).
 * 서버를 실제로 부르는 것은 `src/api.ts` 의 `makeAnswerPicture` (→ core/transfer-client → 백엔드 POST /transfer).
 * 여기에는 올리기 전에 참고 사진을 줄이는 것과, 기다리는 동안·못 만들었을 때 화면에 낼 말만 있다.
 *
 * ── 본 앱에서 못 가져온 것 ──
 *
 * 본 앱은 `MakeFail` · `MakeResult` 를 `core/picture-maker.ts` 에서 가져온다. 그 모듈은 받은 그림을
 * `core/made-pictures` → `core/session-store`(IndexedDB) 에 넣는 일까지 같이 해서, 그대로 가져오면
 * **이 버전에 없는 저장소 코드가 딸려 온다** (App.tsx 가 적어 둔 대로 이 레포에는 사진을 둘 자리가 없고,
 * 동의문도 "폰에 저장하는 것이 없어요" 로 되어 있다). 그래서 타입만 여기 옮겨 적고, picture-maker 가
 * 지키던 규칙(같은 사진으로 두 번 눌러도 한 번만 보낸다)은 `api.ts` 에서 지킨다.
 */

import type { TransferFail } from "@core/transfer-client";
import { encodeForStore } from "./image-encode";

/**
 * no_bare 맨얼굴이 없음(촬영 전) · no_attempt 완성사진이 없음 · cancelled 기다리는 사이에 버려짐 — 나머지는 서버 쪽 까닭.
 * `no_attempt` 는 이 버전에서는 안 나온다 — 완성사진을 서버로 보내는 길(본 앱 `makeMoved`)이 없다.
 * 그래도 지워 두지 않는 까닭: 본 앱과 까닭 목록이 어긋나면 나중에 그 길을 붙일 때 안내 문구가 한 칸 빈다
 */
export type MakeFail = TransferFail | "no_bare" | "no_attempt" | "cancelled";

export type MakeResult =
  | { ok: true; picture: Blob; ms: number | null; queueMs?: number | null; fluxMs?: number | null }
  | { ok: false; why: MakeFail; message?: string };

/**
 * 올릴 참고 사진의 긴 변. 서버(app_klein)는 참고 사진에서 얼굴만 잘라 512 로 줄여 쓴다 —
 * 얼굴이 사진의 1/3 만 차지해도 512 가 남는 크기. 폰 사진첩 원본(4000px · 10MB 안팎)을 그대로 올리면
 * 느리고 서버 한도(15MB)에 걸린다
 */
export const REF_UPLOAD_SIDE = 1600;

/**
 * 참고 사진을 줄여 다시 담는다. 폰 사진의 돌아간 방향(EXIF)도 이때 바로 선다 — 브라우저가 그릴 때 세워 준다.
 * 못 줄이면 던진다 (부르는 쪽이 원본을 그대로 보낸다)
 */
export async function shrinkForUpload(photo: Blob, maxSide = REF_UPLOAD_SIDE): Promise<Blob> {
  const bmp = await createImageBitmap(photo);
  try {
    return (await encodeForStore(bmp, maxSide)).blob;
  } finally {
    bmp.close();
  }
}

/** 기다리는 동안 한 줄 — 한 장에 20초쯤, 서버를 막 켰거나 줄을 서면 1분 가까이 (2026-10-08 배포 서버에서 잰 값 21초 · 첫 장 68초) */
export const MAKE_WAIT_TEXT = "길면 1분쯤 걸려요. 화면을 닫지 말고 기다려 주세요.";

/**
 * 못 만들었을 때 화면에 낼 말. 서버가 얼굴을 못 찾는 것(rejected)은 **맨얼굴 사진** 쪽이다 —
 * 참고 사진은 올리기 전에 이 폰에서 얼굴을 확인했고, 서버도 참고 사진은 얼굴이 없어도 그대로 쓴다.
 * null 이면 아무 말도 하지 않는다 (cancelled — 화면을 떠났거나 처음부터 다시 시작한 것)
 */
export function makeFailText(why: MakeFail): string | null {
  switch (why) {
    case "busy": return "지금 예상 메이크업을 만드는 사람이 많아요. 잠시 뒤에 다시 눌러 주세요.";
    case "down": return "예상 메이크업을 만드는 서버가 답하지 않아요. 잠시 뒤에 다시 눌러 주세요.";
    case "off": return "지금은 예상 메이크업을 만들 수 없어요. 잠시 뒤에 다시 시도해 주세요.";
    case "timeout": return "너무 오래 걸려서 멈췄어요. 다시 눌러 주세요.";
    case "network": return "인터넷 연결을 확인하고 다시 눌러 주세요.";
    case "too_large": return "사진이 너무 커요. 다른 사진으로 올려 주세요.";
    case "rejected": return "맨얼굴 사진에서 얼굴을 못 찾았어요. 처음으로 돌아가 맨얼굴을 다시 찍어 주세요.";
    case "no_bare": return "맨얼굴 사진이 없어요. 처음으로 돌아가 맨얼굴을 먼저 찍어 주세요.";
    case "no_attempt": return "완성사진이 없어요.";
    case "cancelled": return null;
  }
}
