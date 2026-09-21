/**
 * 카메라가 열릴 수 있는 곳인지 먼저 본다 (6-3, #74).
 *
 * 브라우저는 https 또는 localhost 에서만 `navigator.mediaDevices` 를 준다.
 * 폰에서 `http://192.168.x.x:5173` 로 들어오면 **권한 거부가 아니라 API 자체가 없다.**
 * 그냥 두면 "카메라가 안 켜진다"로만 보여서 원인을 찾는 데 한참 걸린다 — 그래서 먼저 말해 준다.
 *
 * 순수 함수다. 실제 `window` 는 `readEnv()` 가 읽는다.
 */

export interface SecureEnv {
  isSecureContext: boolean;
  hasMediaDevices: boolean;
  protocol: string;
  host: string;
}

export type SecureReason = "ok" | "insecure" | "unsupported";

export interface SecureCheck {
  ok: boolean;
  reason: SecureReason;
  /** 사용자가 읽는 한 줄 */
  message: string;
  /** 개발자가 읽는 한 줄. 사용자 화면에는 작게 */
  hint: string;
}

export function checkSecureContext(env: SecureEnv): SecureCheck {
  if (!env.isSecureContext) {
    return {
      ok: false,
      reason: "insecure",
      message: "여기서는 카메라를 열 수 없어요. 주소가 https 로 시작하는지 확인해 주세요.",
      hint:
        `${env.protocol}//${env.host} 는 보안 컨텍스트가 아닙니다. ` +
        "bash scripts/certs.sh 로 인증서를 만들고 https 로 여세요 (docs/device-setup-v6.md).",
    };
  }
  if (!env.hasMediaDevices) {
    return {
      ok: false,
      reason: "unsupported",
      message: "이 브라우저에서는 카메라를 쓸 수 없어요. 사파리나 크롬으로 열어 주세요.",
      hint: "navigator.mediaDevices 가 없습니다. 인앱 브라우저(카톡·인스타)일 가능성이 큽니다.",
    };
  }
  return { ok: true, reason: "ok", message: "", hint: "" };
}

export function readEnv(): SecureEnv {
  return {
    isSecureContext: window.isSecureContext,
    hasMediaDevices: typeof navigator !== "undefined" && !!navigator.mediaDevices,
    protocol: window.location.protocol,
    host: window.location.host,
  };
}
