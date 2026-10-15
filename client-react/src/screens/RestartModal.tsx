/**
 * 로고를 눌렀을 때 — "처음부터 다시 할까요?" (본 앱 `screens/restart-modal.ts` 그대로, #404 · #454 C3).
 * **찍은 사진과 올린 사진을 다 지우고** 안내 화면으로 간다. 되돌릴 수 없어서 한 번 묻는다.
 * 뒷배경 · Esc 는 언제나 "그냥 둘게요" 다 — 되돌릴 수 없는 쪽이 실수로 눌리면 안 되므로.
 * 모양은 후기 설문 모달(`Survey.tsx`, survey.css 의 .done-modal)과 같은 틀이다
 */
import { useEffect, useRef } from "react";
import "../survey.css";

export default function RestartModal({ onRestart, onCancel }: { onRestart: () => void; onCancel: () => void }) {
  const stay = useRef<HTMLButtonElement>(null);
  // 창이 뜨면 바로 키보드가 여기로 — 뒤 화면의 버튼이 눌리지 않게. 안 지우는 쪽에 둔다 (본 앱과 같다)
  useEffect(() => {
    stay.current?.focus();
  }, []);
  return (
    <div
      className="done-modal-back"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="done-modal" role="dialog" aria-modal="true" aria-labelledby="restart-modal-title">
        <h2 id="restart-modal-title">처음부터 다시 할까요?</h2>
        {/* 무엇이 없어지는지 먼저 말한다 — "다시 할까요" 만으로는 사진이 지워지는 줄 모른다 */}
        <p>찍은 사진과 올려 주신 사진이 모두 지워져요. 다시 되돌릴 수 없어요.</p>
        <button type="button" className="primary" onClick={onRestart}>
          지우고 다시 시작
        </button>
        <button type="button" className="done-modal-later" onClick={onCancel} ref={stay}>
          그냥 둘게요
        </button>
      </div>
    </div>
  );
}
