/**
 * App 흐름 (src/App.tsx) — 본 앱 `client/tests/screens.test.ts`(SCREEN_ORDER) · `back-button.test.ts`(뒤로 · 로고) · `flow-slots.test.ts` FS1a 를 옮긴 것 (#454 D7).
 *
 * 지키는 것: 스플래시 → 동의 → 촬영 → 참고 사진 → 정답사진 → 팔레트 → 부위 가이드 → 완성사진 → 피드백 → 저장 → 끝 차례(`FLOW`)가
 * 사용 기록 이름으로 보면 본 앱 `SCREEN_ORDER` 와 같다 · 맨 위 화살표가 어디로 가는지와 그 이름(aria-label) · 로고는 묻고 나서 지운다 ·
 * 실시간 가이드는 흐름의 한 칸이 아니라 부위 가이드의 곁 화면이다 · 「끝내기」→ 끝 → 「다시 하기」면 운영 연결을 새로 시작한다.
 *
 * 카메라 · MediaPipe 가 필요한 화면(Capture · Attempt · Live)은 가짜 부품으로 바꿔 onDone/onBack 만 눌러 본다.
 * 운영 연결(`lib/ops`) · 서버(`src/api`) · 머리카락 분할 · 설문 주소도 가짜다 — 네트워크로는 아무것도 안 나간다
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SCREEN_ORDER } from "@core/screens";
import type { Baseline } from "@core/types";
import { describeColor } from "@core/color-name";
import App from "../../src/App";
import { templateColors } from "../../src/api";
import { analyzeRefPhoto } from "../../src/lib/ref-analyze";
import { blockNetwork, fakeColors, stubObjectUrl } from "./helpers";

/** 가짜 운영 연결 — 어떤 화면에 들어갔고 무엇을 불렀는지만 적는다 */
const fake = vi.hoisted(() => ({
  ops: {
    enter: vi.fn(), consent: vi.fn(), keepAttempt: vi.fn(), end: vi.fn(), restart: vi.fn(),
    log: { log: vi.fn(), setContext: vi.fn() },
    events: {},
    keeper: { keep: vi.fn(), keepFeedback: vi.fn() },
    sender: {},
    sid: { sid: () => "sid-test" },
  },
}));

vi.mock("../../src/lib/ops", () => ({ ops: () => fake.ops }));
// 색 읽기는 MediaPipe 를 부르므로 가짜로 — 실패 문구 등 나머지는 진짜
vi.mock("../../src/lib/ref-analyze", async (orig) => ({
  ...(await orig<typeof import("../../src/lib/ref-analyze")>()),
  analyzeRefPhoto: vi.fn(),
}));
vi.mock("../../src/survey-link", () => ({ surveyLink: () => null, SURVEY_BASE: "" }));
vi.mock("@screens/hair-segmenter", () => ({ createHairMasker: () => async () => null }));
vi.mock("../../src/api", async (orig) => ({
  ...(await orig<typeof import("../../src/api")>()),
  API_BASE: "",
  hasAnswerServer: false,
  makeAnswerPicture: vi.fn(),
  templateColors: vi.fn(),
}));
vi.mock("../../src/screens/Capture", () => ({
  default: ({ onDone, onBack }: { onDone: (b: Baseline, f: HTMLCanvasElement[]) => void; onBack: () => void }) => (
    <section>
      <h1>가짜 촬영</h1>
      <button type="button" onClick={() => onDone({ lm: [], bareImage: null, w: 1, h: 1 } as unknown as Baseline, [])}>가짜 촬영 완료</button>
      <button type="button" onClick={onBack}>가짜 촬영 뒤로</button>
    </section>
  ),
}));
vi.mock("../../src/screens/Attempt", () => ({
  default: ({ onDone, onBack }: { onDone: (s: { front_open: never[] }) => void; onBack: () => void }) => (
    <section>
      <h1>가짜 완성사진</h1>
      <button type="button" onClick={() => onDone({ front_open: [] })}>가짜 완성사진 완료</button>
      <button type="button" onClick={onBack}>가짜 완성사진 뒤로</button>
    </section>
  ),
}));
vi.mock("../../src/screens/Live", () => ({
  default: ({ part, onBack, onToCapture }: { part: string; onBack: () => void; onToCapture: () => void }) => (
    <section>
      <h1>가짜 실시간 가이드 {part}</h1>
      <button type="button" onClick={onBack}>가짜 실시간 뒤로</button>
      <button type="button" onClick={onToCapture}>가짜 촬영하러 가기</button>
    </section>
  ),
}));

const click = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }));
};
const h1 = (): string => screen.getByRole("heading", { level: 1 }).textContent ?? "";
const back = (): HTMLElement | null => screen.queryByRole("button", { name: /돌아가기$/ });

/** 스플래시를 눌러 동의 화면까지 */
async function toConsent() {
  render(<App />);
  click(/눌러서 넘어가기/);
  await screen.findByRole("heading", { level: 1, name: "찍기전에 확인해주세요" });
}
/** 동의 → 촬영(가짜) */
function agree(): void {
  click("촬영 시작");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "동의하고 시작" }));
  expect(h1()).toBe("가짜 촬영");
}
/** 촬영 완료 → 참고 사진 */
function capture(): void {
  click("가짜 촬영 완료");
  expect(h1()).toBe("참고 사진 · 예상 메이크업");
}
/** 템플릿 「가을」을 골라 정답사진 화면까지 */
async function pickAutumn(): Promise<void> {
  click("템플릿 선택");
  expect(h1()).toBe("화장 템플릿");
  fireEvent.click(screen.getByRole("button", { name: /가을/ }));
  click("적용하기");
  await waitFor(() => expect(h1()).toBe("참고 사진에서 색을 읽었어요"));
}
/** 정답사진 → 팔레트 → 부위 가이드 */
function toPartGuide(): void {
  click("다음 · 화장 가이드 보기");
  expect(h1()).toBe("가을 화장의 색");
  click("부위별로 보기");
  expect(h1()).toBe("눈썹");
}
/** 부위 다섯을 지나 완성사진(가짜) */
function throughParts(): void {
  for (const name of ["아이라이너", "아이섀도우", "입술", "볼터치"]) {
    click(`다음 — ${name}`);
    expect(h1()).toBe(name);
  }
  click("다음 · 완성사진 찍기");
  expect(h1()).toBe("가짜 완성사진");
}
/** 완성사진 완료 → 피드백(못 견줌: 가짜 맨얼굴에는 사진이 없다) */
async function attemptDone(): Promise<void> {
  click("가짜 완성사진 완료");
  await screen.findByText(/견준 결과가 아니에요/);
  expect(h1()).toBe("피드백");
}

beforeEach(() => {
  blockNetwork();
  stubObjectUrl();
  for (const f of [fake.ops.enter, fake.ops.consent, fake.ops.keepAttempt, fake.ops.end, fake.ops.restart, fake.ops.log.log, fake.ops.keeper.keep]) f.mockClear();
  vi.mocked(templateColors).mockReset();
  vi.mocked(templateColors).mockResolvedValue(fakeColors());
});

describe("App — 처음부터 끝까지", () => {
  it("스플래시 → 동의 → 촬영 → 참고 사진(템플릿) → 정답사진 → 팔레트 → 부위 가이드 → 완성사진 → 피드백 → 저장 → 끝 → 다시 하기", async () => {
    await toConsent();
    expect(fake.ops.consent).not.toHaveBeenCalled();
    agree();
    // 동의한 순간부터 사용 기록 · 사진이 서버로 간다 (본 앱 setConsent + events.consent)
    expect(fake.ops.consent).toHaveBeenCalledWith(true);
    capture();
    await pickAutumn();
    expect(templateColors).toHaveBeenCalledWith("03");
    expect(screen.getByRole("status").textContent).toContain("아직 안 붙었어요");
    toPartGuide();
    throughParts();
    await attemptDone();
    expect(fake.ops.keepAttempt).toHaveBeenCalledTimes(1);
    click("다음 · 저장하러 가기");
    expect(h1()).toBe("오늘의 화장 기록");
    click("끝내기");
    // 「끝내기」— 세션이 끝났다고 적는다 (본 앱 session_end)
    expect(fake.ops.end).toHaveBeenCalledWith("save");
    expect(screen.getByRole("heading", { name: "끝났어요" })).toBeTruthy();
    click("다시 하기");
    expect(fake.ops.restart).toHaveBeenCalledTimes(1);
    expect(h1()).toBe("찍기전에 확인해주세요");

    // 들어간 화면을 사용 기록 이름으로 적으면(upload · palette → answer) 본 앱 SCREEN_ORDER 와 같다 — 곁 화면(templates)은 빼고 본다
    const AS_MAIN: Record<string, string | null> = { splash: null, upload: "answer", palette: "answer" };
    const entered = fake.ops.enter.mock.calls.map(([s]) => (s in AS_MAIN ? AS_MAIN[s] : (s as string))).filter((s) => s && s !== "templates");
    const seq = entered.filter((s, i) => s !== entered[i - 1]).slice(0, SCREEN_ORDER.length);
    expect(seq).toEqual([...SCREEN_ORDER]);
    // 다시 하기 뒤에는 동의로 돌아온다
    expect(entered[entered.length - 1]).toBe("consent");
  });

  it("사진을 올린 길도 같은 뒤를 간다 — 템플릿 이름은 「올린 사진」, 읽은 부위 수를 말한다", async () => {
    const rgb: [number, number, number] = [150, 104, 97];
    const name = describeColor(rgb, "lip");
    const spy = vi.mocked(analyzeRefPhoto).mockResolvedValue({ colors: { lip: { hex: "#966861", rgb, name, product: { hex: "#966861", rgb, name }, n: 500 } }, preview: "data:,", w: 10, h: 10 });
    await toConsent();
    agree();
    capture();
    const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], "ref.png", { type: "image/png" })] } });
    click("적용하기");
    await waitFor(() => expect(h1()).toBe("참고 사진에서 색을 읽었어요"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/다섯 부위 가운데 1개 부위/)).toBeTruthy();
    click("다음 · 화장 가이드 보기");
    expect(h1()).toBe("올린 사진 화장의 색");
  });
});

describe("App — 맨 위 화살표 (본 앱 back-button.test.ts)", () => {
  it("동의 · 촬영에는 화살표가 없고, 참고 사진부터 저장까지 한 칸씩 돌아가며 어디로 가는지 읽어 준다", async () => {
    await toConsent();
    expect(back()).toBeNull();
    agree();
    expect(back()).toBeNull();
    capture();
    expect(back()!.getAttribute("aria-label")).toBe("사진 촬영으로 돌아가기");
    click("템플릿 선택");
    expect(back()!.getAttribute("aria-label")).toBe("참고 사진으로 돌아가기");
    fireEvent.click(back()!);
    expect(h1()).toBe("참고 사진 · 예상 메이크업");
    await pickAutumn();
    expect(back()!.getAttribute("aria-label")).toBe("참고 사진으로 돌아가기");
    toPartGuide();
    expect(back()!.getAttribute("aria-label")).toBe("색조 팔레트로 돌아가기");
    fireEvent.click(back()!);
    expect(h1()).toBe("가을 화장의 색");
    expect(back()!.getAttribute("aria-label")).toBe("예상 메이크업으로 돌아가기");
    fireEvent.click(back()!);
    expect(h1()).toBe("참고 사진에서 색을 읽었어요");
    // 정답사진 뒤로는 고른 것을 버리고 참고 사진으로
    fireEvent.click(back()!);
    expect(h1()).toBe("참고 사진 · 예상 메이크업");
    fireEvent.click(back()!);
    expect(h1()).toBe("가짜 촬영");
  });

  it("완성사진에는 화살표가 없고(화면 안 「이전」이 부위 가이드로), 피드백 → 완성사진, 저장 → 피드백, 끝에는 없다", async () => {
    await toConsent();
    agree();
    capture();
    await pickAutumn();
    toPartGuide();
    throughParts();
    expect(back()).toBeNull();
    click("가짜 완성사진 뒤로");
    expect(h1()).toBe("눈썹");
    throughParts();
    await attemptDone();
    expect(back()!.getAttribute("aria-label")).toBe("완성사진으로 돌아가기");
    fireEvent.click(back()!);
    expect(h1()).toBe("가짜 완성사진");
    await attemptDone();
    click("다음 · 저장하러 가기");
    expect(back()!.getAttribute("aria-label")).toBe("피드백으로 돌아가기");
    fireEvent.click(back()!);
    expect(h1()).toBe("피드백");
    // 다시 들어오면 보관함에서 받아 온다 — 못 견준 것은 들고 있지 않아 한 번 더 재고 나서 「다음」이 뜬다
    await screen.findByText(/견준 결과가 아니에요/);
    click("다음 · 저장하러 가기");
    click("끝내기");
    expect(back()).toBeNull();
  });
});

describe("App — 로고와 처음부터 다시 (본 앱 #404 · #454 C3)", () => {
  it("동의 화면에서는 로고가 버튼이 아니고, 그 뒤에는 묻고 나서 지운다 — 「그냥 둘게요」면 그대로", async () => {
    await toConsent();
    expect(screen.queryByRole("button", { name: "처음 안내 화면으로" })).toBeNull();
    agree();
    capture();
    click("처음 안내 화면으로");
    expect(screen.getByRole("dialog").textContent).toContain("지워져요");
    expect(fake.ops.restart).not.toHaveBeenCalled();
    click("그냥 둘게요");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h1()).toBe("참고 사진 · 예상 메이크업");
    click("처음 안내 화면으로");
    click("지우고 다시 시작");
    expect(fake.ops.restart).toHaveBeenCalledTimes(1);
    expect(h1()).toBe("찍기전에 확인해주세요");
    expect(fake.ops.log.log).toHaveBeenCalledWith({ name: "button", button: "restart_yes" });
  });
});

describe("App — 실시간 가이드는 곁 화면 (본 앱 SIDE_OF = { live: \"partguide\" })", () => {
  it("보던 부위를 들고 들어갔다가 「이전」으로 같은 부위로 돌아온다 — 「다음」으로는 못 들어간다", async () => {
    await toConsent();
    agree();
    capture();
    await pickAutumn();
    toPartGuide();
    click("입술");
    click("실시간 가이드로 보기");
    expect(h1()).toBe("가짜 실시간 가이드 lip");
    expect(back()).toBeNull();
    click("가짜 실시간 뒤로");
    expect(h1()).toBe("입술");
    expect(screen.getByRole("button", { current: true }).textContent).toBe("입술");
    // 촬영을 건너뛴 사람에게 열어 둔 길 — 실시간 가이드에서 촬영으로
    click("실시간 가이드로 보기");
    click("가짜 촬영하러 가기");
    expect(h1()).toBe("가짜 촬영");
  });
});
