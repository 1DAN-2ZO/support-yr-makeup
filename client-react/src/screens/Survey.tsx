/**
 * 후기 설문 모달 — 「끝내기」를 누른 그 화면 위에 뜬다 (본 앱 `screens/survey-modal.ts`).
 *
 * 화면을 넘긴 뒤에 묻지 않는다. 끝내기를 누른 순간이 서비스를 막 다 쓴 때라 그때 묻는 것이
 * 가장 잘 답해 준다. 모달을 닫으면 그때 끝 화면으로 넘어간다.
 *
 * 주소가 없으면 **아예 띄우지 않는다** — 누르는 쪽에서 `surveyLink()` 가 null 인지 먼저 본다
 * (본 앱과 같은 규칙: 눌리지 않는 빈 버튼을 두지 않는다).
 *
 * 「후기 남기기」는 새 창으로 열리고 **그와 상관없이 모달은 닫힌다** — 새 창이 막히거나
 * 바로 돌아와도 이 화면에 갇히면 안 된다. 어느 버튼으로 닫았든 끝 화면으로 한 번만 간다.
 */

import { useEffect, useRef } from "react";
import "../survey.css";

export default function Survey({ url, onClose }: { url: string; onClose: () => void }) {
  const go = useRef<HTMLAnchorElement>(null);

  // 뜨면 바로 「후기 남기기」로 포커스 — 본 앱도 같다 (`queueMicrotask(() => go.focus())`).
  // 여기서는 링크라서 포커스가 가 있어도 엔터 없이는 안 눌린다
  useEffect(() => {
    go.current?.focus();
  }, []);

  return (
    <div
      className="done-modal-back"
      tabIndex={-1}
      onClick={(e) => {
        // 뒷배경을 눌렀을 때만 — 모달 안을 누른 것과 가른다
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="done-modal" role="dialog" aria-modal="true" aria-labelledby="survey-modal-title">
        <h2 id="survey-modal-title">사용자 의견을 들려주세요</h2>
        <p>써 보니 어땠는지 알려 주시면 서비스를 고치는 데 쓸게요. 1분이면 끝나요.</p>
        <a className="primary" href={url} target="_blank" rel="noopener noreferrer" ref={go} onClick={onClose}>
          후기 남기기
        </a>
        <button type="button" className="done-modal-later" onClick={onClose}>
          다음에 할게요
        </button>
      </div>
    </div>
  );
}
