import { describe, it, expect } from "vitest";
import { mergeCss } from "../src/archive/css-merge";

describe("mergeCss", () => {
  it("기존이 null 이면 신규 룰을 직렬화", () => {
    const out = mergeCss(null, "a { color: rgb(1, 2, 3); }");
    expect(out).toContain("color: rgb(1, 2, 3)");
  });
  it("동일 selector+body 는 한 번만(dedup)", () => {
    const out = mergeCss("a { color: rgb(9, 9, 9); }", "a { color: rgb(9, 9, 9); }");
    expect(out.match(/color: rgb\(9, 9, 9\)/g)?.length).toBe(1);
  });
  it("같은 selector 라도 body 가 다르면 둘 다 보존", () => {
    const out = mergeCss("a { color: rgb(1, 1, 1); }", "a { color: rgb(2, 2, 2); }");
    expect(out).toContain("rgb(1, 1, 1)");
    expect(out).toContain("rgb(2, 2, 2)");
  });
  it("사용자 색상 룰은 같은 user-id 면 신규본만 남긴다", () => {
    const out = mergeCss(
      "div.chat-box.user-A { background-color: rgb(1, 1, 1); }",
      "div.chat-box.user-A { background-color: rgb(2, 2, 2); }",
    );
    expect(out).toContain("rgb(2, 2, 2)");
    expect(out).not.toContain("rgb(1, 1, 1)");
  });
});
