// @vitest-environment jsdom
import { GUIDE_PART_IDS } from "@core/screens";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShell } from "../src/screens/shell";
import { createLogger, memorySink } from "@core/log";
import type { ChipInput, ScreenId } from "@core/screens";
import type { PartId, Versions } from "@core/types";

const ver: Versions = {
  app: "test",
  score: "score-v0.1",
  look: "look-v0.1",
  faceshape: "faceshape-rule-v1",
  transfer: "transfer-stub-v0",
};

interface Session {
  screen: ScreenId;
  currentPart: PartId | null;
  parts: ChipInput[];
}

function setup(start: Partial<Session> = {}, orientation: () => "portrait" | "landscape" | null = () => "portrait") {
  document.body.innerHTML = `<div id="root"></div><div id="chips"></div><div id="hint"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const chipsRoot = document.getElementById("chips") as HTMLElement;
  const hintRoot = document.getElementById("hint") as HTMLElement;

  const session: Session = {
    screen: "consent",
    currentPart: null,
    parts: [{ partId: "brow", status: "passed", score: 80 }],
    ...start,
  };
  const m = memorySink();
  const shell = createShell<Session>({
    root,
    chipsRoot,
    hintRoot,
    log: createLogger({ sid: "s1", screen: session.screen, part: null, ver }, m.sink),
    getSession: () => session,
    read: (s) => ({ screen: s.screen, currentPart: s.currentPart, parts: s.parts }),
    setScreen: (to) => {
      session.screen = to;
    },
    setPart: (p) => {
      session.currentPart = p;
    },
    orientation,
  });
  return { shell, session, events: m.events, root, chipsRoot, hintRoot };
}

describe("껍데기", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("등록 안 한 화면은 담당 모듈을 알려주는 자리표시가 뜬다", () => {
    const { shell, root } = setup({ screen: "live" });
    shell.render();
    expect(root.textContent).toContain("4 실시간 테두리");
    expect(root.textContent).toContain("guide");
  });

  it("등록한 화면이 그려지고, 옮기면 이전 화면을 정리한다", () => {
    const { shell, root } = setup();
    const cleanup = vi.fn();
    shell.register("consent", {
      mount: (ctx) => {
        ctx.root.textContent = "동의 화면";
        return cleanup;
      },
    });
    shell.register("capture", {
      mount: (ctx) => {
        ctx.root.textContent = "촬영 화면";
      },
    });

    shell.render();
    expect(root.textContent).toBe("동의 화면");
    expect(cleanup).not.toHaveBeenCalled();

    shell.go("capture");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(root.textContent).toBe("촬영 화면");
  });

  it("같은 화면을 두 번 등록하면 막는다", () => {
    const { shell } = setup();
    shell.register("consent", { mount: () => {} });
    expect(() => shell.register("consent", { mount: () => {} })).toThrow(/이미 등록/);
  });

  it("화면 들어감·나감이 로그에 남는다", () => {
    const { shell, events } = setup();
    shell.register("consent", { mount: () => {} });
    shell.render();
    shell.go("capture");
    const seen = events.map((e) => `${e.name}:${"screen" in e ? e.screen : ""}`);
    expect(seen).toContain("screen_enter:consent");
    expect(seen).toContain("screen_leave:consent");
    expect(seen).toContain("screen_enter:capture");
  });

  it("진행 칩은 부위 화면에서만 보이고, 누르면 그 부위 가이드로 간다 (새 흐름 — 2026-10-06)", () => {
    const { shell, session, chipsRoot } = setup({ screen: "partguide", currentPart: "brow" });
    shell.render();
    expect(chipsRoot.hidden).toBe(false);
    // 쉐딩·하이라이트는 가이드에서 뺐다 (2026-10-09) — 칩도 그만큼 줄었다
    expect(chipsRoot.querySelectorAll("button")).toHaveLength(GUIDE_PART_IDS.length);

    const buttons = [...chipsRoot.querySelectorAll("button")];
    const lip = buttons.find((b) => b.textContent?.startsWith("입술"));
    expect(lip).toBeDefined();
    lip?.click();
    expect(session.currentPart).toBe("lip");
    expect(session.screen).toBe("partguide");

    shell.go("looks");
    expect(chipsRoot.hidden).toBe(true);
  });

  it("방향이 안 맞으면 안내가 뜬다", () => {
    const { shell, hintRoot } = setup({ screen: "partguide", currentPart: "liner" });
    shell.render();
    expect(hintRoot.hidden).toBe(false);
    expect(hintRoot.textContent).toBe("폰을 가로로 돌리세요");
  });

  it("방향을 모르면(null — 옛 브라우저 · 주소 ?norotate) 안내를 안 띄운다", () => {
    const { shell, hintRoot } = setup({ screen: "partguide", currentPart: "liner" }, () => null);
    shell.render();
    expect(hintRoot.hidden).toBe(true);
    expect(hintRoot.textContent).toBe("");
  });

  it("부위 화면이 아니면(피드백 등) 마지막 부위가 남아 있어도 방향 안내를 안 띄운다 (#169 3번)", () => {
    const { shell, hintRoot } = setup({ screen: "feedback", currentPart: "liner" });
    shell.render();
    expect(hintRoot.hidden).toBe(true);
    expect(hintRoot.textContent).toBe("");
  });
});
