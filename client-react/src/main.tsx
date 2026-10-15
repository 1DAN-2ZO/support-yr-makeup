import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import BootError from "./screens/BootError";
import { LangProvider } from "./i18n/useLang";

/**
 * 그리다 터지면 빈 화면 대신 "다시 열어 주세요" 를 보여 준다 (본 앱 `showBootError`, #454 C6).
 * 리액트는 그리는 중의 오류를 잡는 자리가 클래스 컴포넌트뿐이다. 무엇이 터졌는지는 콘솔에 남긴다 —
 * 사용 기록으로 보내지 않는 까닭은 터진 뒤에는 기록기도 믿을 수 없어서다
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }
  render(): ReactNode {
    return this.state.failed ? <BootError /> : this.props.children;
  }
}

// 기다리던 일(약속)이 아무도 안 받은 채 실패하면 콘솔에 남긴다 — 조용히 사라지면 왜 멈췄는지 알 길이 없다
window.addEventListener("unhandledrejection", (e) => console.error("unhandled:", e.reason));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* 말(한국어·영어)을 앱 전체가 같이 본다 — 처음 값은 폰 설정을 따른다 (i18n/useLang) */}
      <LangProvider>
        <App />
      </LangProvider>
    </ErrorBoundary>
  </StrictMode>,
);
