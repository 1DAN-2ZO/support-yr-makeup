// 카메라를 못 열었을 때 — 까닭에 맞는 말을 한다 (2026-10-13: 촬영에서 못 찍은 세션 15개 중 7개가 카메라 오류였고,
// 그중 5개는 권한 문제가 아닌데 "카메라를 허용해 주세요" 만 나왔다 — #422)
import { describe, expect, it } from "vitest";
import { CAMERA_FAIL_TEXT, cameraFailKind, cameraFailText } from "@core/camera-fail";

const err = (name: string, message = ""): Error => Object.assign(new Error(message), { name });

describe("cameraFailKind — 오류 → 까닭", () => {
  it("CF1 권한을 안 줬다 · 권한 창을 닫았다 → denied", () => {
    expect(cameraFailKind(err("NotAllowedError", "Permission dismissed"))).toBe("denied");
    expect(cameraFailKind(err("NotAllowedError", "Permission denied"))).toBe("denied");
    expect(cameraFailKind(err("SecurityError"))).toBe("denied");
  });

  it("CF2 카메라가 안 켜진다 (다른 프로그램이 쓰는 중 · 제때 안 켜짐) → busy — 권한 문제가 아니다", () => {
    expect(cameraFailKind(err("NotReadableError", "Could not start video source"))).toBe("busy");
    expect(cameraFailKind(err("AbortError", "Timeout starting video source"))).toBe("busy");
    expect(cameraFailKind(err("TrackStartError"))).toBe("busy");
  });

  it("CF3 카메라가 없다 → none", () => {
    expect(cameraFailKind(err("NotFoundError", "Requested device not found"))).toBe("none");
    expect(cameraFailKind(err("OverconstrainedError"))).toBe("none");
  });

  it("CF4 모르는 오류 · 오류 객체가 아닌 것 → other. 글자로 온 것은 이름을 읽는다", () => {
    expect(cameraFailKind(err("TypeError"))).toBe("other");
    expect(cameraFailKind(undefined)).toBe("other");
    expect(cameraFailKind("NotReadableError: Could not start video source")).toBe("busy");
  });

  it("CF5 까닭마다 말이 다르고, 권한이 아닌 까닭에는 '허용' 을 말하지 않는다", () => {
    expect(new Set(Object.values(CAMERA_FAIL_TEXT)).size).toBe(4);
    expect(cameraFailText(err("NotAllowedError"))).toContain("허용");
    expect(cameraFailText(err("NotReadableError"))).not.toContain("허용");
    expect(cameraFailText(err("NotReadableError"))).toContain("다른 앱");
    expect(cameraFailText(err("NotFoundError"))).not.toContain("허용");
  });
});
