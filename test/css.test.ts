import { describe, it, expect, vi, afterEach } from "vitest";
import { processStyleSheetStructured, createCssList } from "../src/archive/css";
import { StructuredCssCollector, CssVariableTracker } from "../src/archive/css-collect";

// 가짜 CSSOM 룰/시트 빌더 — jsdom 의 document.styleSheets 가 비어 있어 직접 주입한다.
function styleRule(selectorText: string, body: string) {
  return { type: CSSRule.STYLE_RULE, selectorText, cssText: `${selectorText} { ${body} }` };
}
function groupRule(type: number, extra: object, children: unknown[]) {
  return { type, cssRules: children, ...extra };
}
function sheet(rules: unknown[], href?: string) {
  return { href, cssRules: rules } as unknown as CSSStyleSheet;
}

describe("processStyleSheetStructured (characterization)", () => {
  it("STYLE_RULE → rootRules, :root 셀렉터는 변수 정의 수집", () => {
    const collector = new StructuredCssCollector();
    const tracker = new CssVariableTracker();
    processStyleSheetStructured(
      sheet([styleRule(".chat-x", "color: red"), styleRule(":root", "--fg: blue")]),
      collector, tracker, new Set<string>(),
    );
    expect(collector.rootRules).toHaveLength(2);
    expect(collector.rootRules[0]).toEqual({ selector: ".chat-x", styles: "color: red" });
    expect(tracker.definitions.get("--fg")).toBe("blue");
  });

  it("MEDIA_RULE → media 컨텍스트로 자식 STYLE_RULE 수집", () => {
    const collector = new StructuredCssCollector();
    processStyleSheetStructured(
      sheet([groupRule(CSSRule.MEDIA_RULE, { conditionText: "(max-width: 600px)" }, [
        styleRule(".chat-m", "color: green"),
      ])]),
      collector, new CssVariableTracker(), new Set<string>(),
    );
    expect(collector.mediaRules.get("(max-width: 600px)")).toEqual([
      { selector: ".chat-m", styles: "color: green" },
    ]);
  });

  it("@layer(type 12) → layer 컨텍스트로 자식 수집 (landmine: SUPPORTS와 동일 코드값, layer 선점)", () => {
    const collector = new StructuredCssCollector();
    processStyleSheetStructured(
      sheet([groupRule(12, { name: "base" }, [styleRule(".chat-l", "color: blue")])]),
      collector, new CssVariableTracker(), new Set<string>(),
    );
    expect(collector.layerRules.get("base")).toEqual([
      { selector: ".chat-l", styles: "color: blue" },
    ]);
  });

  it("@font-face / @keyframes → cssText 통째 보존", () => {
    const collector = new StructuredCssCollector();
    processStyleSheetStructured(
      sheet([
        { type: CSSRule.FONT_FACE_RULE, cssText: "@font-face { font-family: X }" },
        { type: CSSRule.KEYFRAMES_RULE, cssText: "@keyframes spin { }" },
      ]),
      collector, new CssVariableTracker(), new Set<string>(),
    );
    expect(collector.fontFaceRules).toEqual(["@font-face { font-family: X }"]);
    expect(collector.keyframeRules).toEqual(["@keyframes spin { }"]);
  });

  it("@import → 자식 styleSheet를 재귀 처리(depth+1)", () => {
    const collector = new StructuredCssCollector();
    const innerSheet = sheet([styleRule(".chat-imported", "color: red")]);
    processStyleSheetStructured(
      sheet([{ type: CSSRule.IMPORT_RULE, styleSheet: innerSheet }]),
      collector, new CssVariableTracker(), new Set<string>(),
    );
    expect(collector.rootRules).toEqual([{ selector: ".chat-imported", styles: "color: red" }]);
  });

  it("동일 href 시트는 한 번만 처리", () => {
    const collector = new StructuredCssCollector();
    const processed = new Set<string>();
    const s = sheet([styleRule(".chat-x", "color: red")], "http://x/a.css");
    processStyleSheetStructured(s, collector, new CssVariableTracker(), processed);
    processStyleSheetStructured(s, collector, new CssVariableTracker(), processed);
    expect(collector.rootRules).toHaveLength(1);
  });

  it("depth > 10 이면 처리 중단", () => {
    const collector = new StructuredCssCollector();
    processStyleSheetStructured(
      sheet([styleRule(".chat-x", "color: red")]),
      collector, new CssVariableTracker(), new Set<string>(), 11,
    );
    expect(collector.rootRules).toHaveLength(0);
  });
});

describe("createCssList — user-color 룰 (characterization)", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("각 user 에 div.chat-box.user-{id} 배경 룰(alpha 0.3)을 덧붙인다", () => {
    vi.stubGlobal("game", {
      users: [
        { id: "u1", _id: "u1", color: "#ff0000" },
        { id: "u2", _id: "u2", color: "#00ff00" },
      ],
    });
    const css = createCssList(null, null, { mode: "filtered" });
    expect(css).toContain("div.chat-box.user-u1 { background-color: rgba(255, 0, 0, 0.3) !important; }");
    expect(css).toContain("div.chat-box.user-u2 { background-color: rgba(0, 255, 0, 0.3) !important; }");
  });
});
