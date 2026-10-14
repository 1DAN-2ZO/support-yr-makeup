/**
 * 앱이 시작하다(또는 그리다) 실패했을 때 — 본 앱 `main.ts` `showBootError` (#454 C6).
 * 그냥 두면 사용자가 **빈 화면**을 본다 — 무엇이 잘못됐는지도, 무엇을 해야 하는지도 모른다.
 * 모양은 닫힌 화면(`Closed`)과 같은 자리 · 같은 글 크기다
 */
export default function BootError() {
  return (
    <section className="screen done">
      <h1>앱을 다시 열어 주세요</h1>
      <p className="muted">초기 화면을 불러오지 못했어요. 새로고침하면 다시 시작합니다.</p>
      <button type="button" className="primary" onClick={() => location.reload()}>
        새로고침
      </button>
    </section>
  );
}
