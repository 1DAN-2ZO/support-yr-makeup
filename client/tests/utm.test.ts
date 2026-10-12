// 어느 링크로 들어왔는지 읽기 (#408 — 마케팅 요청 2번)
import { describe, expect, it } from "vitest";
import { readUtm } from "@core/utm";

describe("readUtm", () => {
  it("U1 주소의 utm_source · utm_campaign · utm_content 를 읽는다 (다른 값은 안 읽는다)", () => {
    expect(readUtm("?utm_source=youtube&utm_medium=social&utm_campaign=tester-flow&utm_content=description&x=1"))
      .toEqual({ utm_source: "youtube", utm_campaign: "tester-flow", utm_content: "description" });
  });

  it("U2 없으면 출처는 direct, 나머지는 null", () => {
    expect(readUtm("")).toEqual({ utm_source: "direct", utm_campaign: null, utm_content: null });
    expect(readUtm("?norotate")).toEqual({ utm_source: "direct", utm_campaign: null, utm_content: null });
  });

  it("U3 영문 · 숫자 · -_. 만 남기고 40자로 자른다 — 주소창에 아무 글이나 넣어 기록을 더럽히지 못하게", () => {
    const r = readUtm(`?utm_source=${encodeURIComponent("you tube<script>한글")}&utm_campaign=${"a".repeat(60)}&utm_content=2026-10-01_P2.v1`);
    expect(r.utm_source).toBe("youtubescript");
    expect(r.utm_campaign).toBe("a".repeat(40));
    expect(r.utm_content).toBe("2026-10-01_P2.v1");
  });

  it("U4 거르고 나면 빈 값은 없는 것으로 본다 · 깨진 주소에도 던지지 않는다", () => {
    expect(readUtm("?utm_source=%ED%95%9C&utm_campaign=")).toEqual({ utm_source: "direct", utm_campaign: null, utm_content: null });
    // 깨진 % 글자는 브라우저가 알아서 풀고, 남는 것은 허용한 글자뿐이다
    expect(readUtm("?utm_source=%E0%A4%A").utm_source).toMatch(/^[A-Za-z0-9._-]{1,40}$/);
  });
});
