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

describe("mergeCss — @media union", () => {
  it("같은 condition 두 룰 → 한 @media 블록에 둘 다", () => {
    const out = mergeCss(
      "@media (max-width: 600px) { a { color: rgb(1,1,1) } }",
      "@media (max-width: 600px) { b { color: rgb(2,2,2) } }",
    );
    expect(out.match(/@media/g)?.length).toBe(1);
    expect(out).toContain("rgb(1,1,1)");
    expect(out).toContain("rgb(2,2,2)");
  });

  it("같은 condition + 동일 자식 → dedup", () => {
    const out = mergeCss(
      "@media (max-width: 600px) { a { color: rgb(7,7,7) } }",
      "@media (max-width: 600px) { a { color: rgb(7,7,7) } }",
    );
    expect(out.match(/rgb\(7,7,7\)/g)?.length).toBe(1);
  });

  it("다른 condition → 별도 @media 블록 둘", () => {
    const out = mergeCss(
      "@media (max-width: 600px) { a { color: rgb(1,1,1) } }",
      "@media (min-width: 900px) { a { color: rgb(2,2,2) } }",
    );
    expect(out.match(/@media/g)?.length).toBe(2);
  });
});

describe("mergeCss — @font-face / @keyframes dedup", () => {
  it("동일 @font-face 두 번 → 1개", () => {
    const ff = "@font-face { font-family: Foo; src: url(foo.woff) }";
    const out = mergeCss(ff, ff);
    expect(out.match(/@font-face/g)?.length).toBe(1);
  });

  it("다른 @font-face → 2개", () => {
    const out = mergeCss(
      "@font-face { font-family: Foo; src: url(foo.woff) }",
      "@font-face { font-family: Bar; src: url(bar.woff) }",
    );
    expect(out.match(/@font-face/g)?.length).toBe(2);
  });

  it("동일 @keyframes 두 번 → 1개", () => {
    const kf = "@keyframes spin { from { opacity: 0 } to { opacity: 1 } }";
    const out = mergeCss(kf, kf);
    expect(out.match(/@keyframes/g)?.length).toBe(1);
  });
});

describe("mergeCss — 직렬화 순서 / 정규화 dedup", () => {
  it("출력 순서: @font-face → style rule → @media", () => {
    const out = mergeCss(
      null,
      "@media screen { x { color: rgb(3,3,3) } } @font-face { font-family: Foo; src: url(f.woff) } b { color: rgb(4,4,4) }",
    );
    const iFont = out.indexOf("@font-face");
    const iStyle = out.indexOf("b {");
    const iMedia = out.indexOf("@media");
    expect(iFont).toBeGreaterThanOrEqual(0);
    expect(iFont).toBeLessThan(iStyle);
    expect(iStyle).toBeLessThan(iMedia);
  });

  it("공백/구두점이 달라도 동일 룰은 dedup", () => {
    const out = mergeCss("a{color:rgb(5,5,5)}", "a { color: rgb(5, 5, 5); }");
    expect(out.match(/rgb\(5,5,5\)/g)?.length).toBe(1);
  });
});

describe("mergeCss — user-color / 랜드마인", () => {
  it("다른 user-id 색상 룰은 둘 다 보존", () => {
    const out = mergeCss(
      "div.chat-box.user-A { background-color: rgb(1,1,1) }",
      "div.chat-box.user-B { background-color: rgb(2,2,2) }",
    );
    expect(out).toContain("user-A");
    expect(out).toContain("user-B");
  });

  // 랜드마인 D fix(2026-06-30): @layer는 .type 0, @supports는 .type 12 — case 12/13 제거로
  // SUPPORTS_RULE 분기가 도달 가능해져 @supports가 더는 @layer anonymous로 오분류되지 않는다.
  it("@supports 는 그대로 보존(otherRules raw, @layer 오분류 아님)", () => {
    const out = mergeCss(null, "@supports (display: grid) { a { color: rgb(6,6,6) } }");
    expect(out).toContain("@supports");
    expect(out).not.toContain("@layer");
    expect(out).toMatch(/rgb\(6,\s?6,\s?6\)/); // jsdom 공백 정규화 허용
  });
});
