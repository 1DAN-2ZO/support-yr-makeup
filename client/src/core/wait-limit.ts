/**
 * 기다리는 한도 (2026-10-09, 모듈 ③ → ⑥ 연결) — 한도 안에 끝나면 그 값, 넘기면 대신 줄 값. 순수 함수 (타이머만 쓴다).
 * 넘겼다고 하던 일을 멈추지는 않는다 — 더 기다리지 않을 뿐이다.
 */
export function within<T, U>(work: Promise<T>, ms: number, late: U): Promise<T | U> {
  return new Promise<T | U>((resolve, reject) => {
    const timer = setTimeout(() => resolve(late), ms);
    work.then((v) => { clearTimeout(timer); resolve(v); }, (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); });
  });
}
