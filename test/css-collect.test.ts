import { describe, it, expect } from "vitest";
import {
  CssVariableTracker,
  StructuredCssCollector,
  selectorMatchesDom,
  getSelectorsWithAncestors,
} from "../src/archive/css-collect";

function docFrom(html: string): Document {
  return new DOMParser().parseFromString(`<html><body>${html}</body></html>`, "text/html");
}

describe("CssVariableTracker", () => {
  it("extractUsages: var() 사용 변수만 수집(공백 허용)", () => {
    const t = new CssVariableTracker();
    t.extractUsages("color: var(--fg); background: var( --bg );");
    expect([...t.usages].sort()).toEqual(["--bg", "--fg"]);
  });

  it("collectDefinitions: --x: 값 매핑(trim)", () => {
    const t = new CssVariableTracker();
    t.collectDefinitions("--fg:  #fff ; --bg: black;");
    expect(t.definitions.get("--fg")).toBe("#fff");
    expect(t.definitions.get("--bg")).toBe("black");
  });

  it("generateRootCss(filtered): 사용+정의된 변수만 :root 출력", () => {
    const t = new CssVariableTracker();
    t.collectDefinitions("--used: red; --unused: blue;");
    t.extractUsages("color: var(--used);");
    const css = t.generateRootCss();
    expect(css).toContain("--used: red");
    expect(css).not.toContain("--unused");
    expect(css.startsWith(":root {")).toBe(true);
  });

  it("generateRootCss(includeAll): 정의된 모든 변수 출력", () => {
    const t = new CssVariableTracker();
    t.collectDefinitions("--a: 1; --b: 2;");
    const css = t.generateRootCss(true);
    expect(css).toContain("--a: 1");
    expect(css).toContain("--b: 2");
  });

  it("resolveTransitiveDependencies: 사용된 변수 값이 var(--x) 참조하면 --x도 포함", () => {
    const t = new CssVariableTracker();
    t.collectDefinitions("--base: #123; --fg: var(--base);");
    t.extractUsages("color: var(--fg);");
    const css = t.generateRootCss();
    expect(css).toContain("--fg: var(--base)");
    expect(css).toContain("--base: #123");
  });

  it("generateRootCss: MAX_VAR_LENGTH(2000) 초과 변수 제외", () => {
    const t = new CssVariableTracker();
    const huge = "x".repeat(2001);
    t.collectDefinitions(`--huge: ${huge}; --small: ok;`);
    t.extractUsages("a: var(--huge); b: var(--small);");
    const css = t.generateRootCss();
    expect(css).toContain("--small: ok");
    expect(css).not.toContain("--huge");
  });

  it("generateRootCss: 출력할 변수 없으면 빈 문자열", () => {
    expect(new CssVariableTracker().generateRootCss()).toBe("");
  });
});

describe("selectorMatchesDom", () => {
  it("ALWAYS_INCLUDE 콘텐츠 패턴은 DOM 무관 true, 앱-셸 패턴은 아님", () => {
    // 콘텐츠 패턴: DOM 매칭 불확실해도 강제 포함(카드 fidelity 안전 마진)
    expect(selectorMatchesDom(".chat-message", new Set())).toBe(true);
    expect(selectorMatchesDom(".fa-dice", new Set())).toBe(true);
    expect(selectorMatchesDom(".dice-roll", new Set())).toBe(true);
    expect(selectorMatchesDom("[data-message-id]", new Set())).toBe(true);
    // 앱-셸 패턴: 강제 포함 아님 → DOM에 실재할 때만
    expect(selectorMatchesDom(".app", new Set())).toBe(false);
    expect(selectorMatchesDom(".window-header", new Set())).toBe(false);
    expect(selectorMatchesDom(".flexcol", new Set())).toBe(false);
  });

  it("DOM에 존재하는 클래스 토큰만 매칭", () => {
    const dom = new Set([".known"]);
    expect(selectorMatchesDom(".known", dom)).toBe(true);
    expect(selectorMatchesDom(".missing", dom)).toBe(false);
  });

  it("콤마 셀렉터: 한 쪽이라도 매칭이면 true", () => {
    expect(selectorMatchesDom(".missing, .known", new Set([".known"]))).toBe(true);
  });

  it("후손 결합: 모든 클래스 토큰이 DOM에 있어야 true", () => {
    expect(selectorMatchesDom(".a .b", new Set([".a"]))).toBe(false);
    expect(selectorMatchesDom(".a .b", new Set([".a", ".b"]))).toBe(true);
  });

  it("pseudo-only 셀렉터는 빈 part로 true, 태그-단독은 DOM 실재 시에만 true", () => {
    // 순수 pseudo/`*`는 콘텐츠 무관 유지(범용 리셋)
    expect(selectorMatchesDom("::before", new Set())).toBe(true);
    expect(selectorMatchesDom("*", new Set())).toBe(true);
    // 태그 토큰: DOM 집합에 있을 때만 매칭 (환경 크롬 배제의 핵심)
    expect(selectorMatchesDom("div:hover", new Set(["div"]))).toBe(true);
    expect(selectorMatchesDom("div:hover", new Set())).toBe(false);
    expect(selectorMatchesDom("body", new Set(["div"]))).toBe(false);
    expect(selectorMatchesDom("html", new Set(["div"]))).toBe(false);
    expect(selectorMatchesDom("table", new Set(["table"]))).toBe(true);
    // 조상-태그 스코프된 앱-셸 셀렉터도 태그 부재로 드롭
    expect(selectorMatchesDom("body.game .sheet.app", new Set([".sheet", ".app"]))).toBe(false);
  });

  it("combinator 토큰(> + ~)은 매칭 대상에서 제외", () => {
    expect(selectorMatchesDom(".a > .b", new Set([".a", ".b"]))).toBe(true);
  });
});

describe("getSelectorsWithAncestors", () => {
  function docWithContainer(inner: string): Document {
    return new DOMParser().parseFromString(
      `<html><head></head><body>` +
      `<div class="app window-app">CHROME</div>` +
      `<div class="foundry-chat-container">${inner}</div>` +
      `</body></html>`,
      "text/html",
    );
  }

  it("씨앗은 :root/* 만 포함(html/body 제외)", () => {
    const set = getSelectorsWithAncestors(docWithContainer(""));
    expect(set.has(":root")).toBe(true);
    expect(set.has("*")).toBe(true);
    expect(set.has("html")).toBe(false);
    expect(set.has("body")).toBe(false);
  });

  it("컨테이너 하위만 수집, 컨테이너 밖(앱-셸)은 제외", () => {
    const set = getSelectorsWithAncestors(
      docWithContainer(`<div class="chat-box"><table></table><a></a></div>`),
    );
    expect(set.has(".chat-box")).toBe(true);
    expect(set.has("table")).toBe(true);
    expect(set.has("a")).toBe(true);
    expect(set.has(".app")).toBe(false);
    expect(set.has(".window-app")).toBe(false);
  });

  it("컨테이너 부재 시 body 폴백(하위 요소 수집)", () => {
    const set = getSelectorsWithAncestors(docFrom(`<div class="a"></div>`));
    expect(set.has(".a")).toBe(true);
  });

  it("tag/id/class 셀렉터 수집", () => {
    const set = getSelectorsWithAncestors(docFrom(`<div id="x" class="a b"></div>`));
    expect(set.has("div")).toBe(true);
    expect(set.has("#x")).toBe(true);
    expect(set.has(".a")).toBe(true);
    expect(set.has(".b")).toBe(true);
  });

  it("클래스 2개 이상이면 쌍 조합 + 전체 결합", () => {
    const set = getSelectorsWithAncestors(docFrom(`<div class="a b c"></div>`));
    expect(set.has(".a.b")).toBe(true);
    expect(set.has(".a.c")).toBe(true);
    expect(set.has(".b.c")).toBe(true);
    expect(set.has(".a.b.c")).toBe(true);
  });

  it("data-* 속성 셀렉터(이름 + 값)", () => {
    const set = getSelectorsWithAncestors(docFrom(`<div data-message-id="7"></div>`));
    expect(set.has("[data-message-id]")).toBe(true);
    expect(set.has(`[data-message-id="7"]`)).toBe(true);
  });

  it("조상-후손 조합(키 클래스)", () => {
    const set = getSelectorsWithAncestors(docFrom(`<div class="parent"><span class="child"></span></div>`));
    expect(set.has(".parent .child")).toBe(true);
  });
});

describe("StructuredCssCollector", () => {
  it("addRule: context별 라우팅", () => {
    const c = new StructuredCssCollector();
    c.addRule(".root", "color: red");
    c.addRule(".m", "color: blue", { type: "media", condition: "(max-width: 600px)" });
    c.addRule(".l", "color: green", { type: "layer", name: "base" });
    expect(c.rootRules).toHaveLength(1);
    expect(c.mediaRules.get("(max-width: 600px)")).toHaveLength(1);
    expect(c.layerRules.get("base")).toHaveLength(1);
  });

  it("generateCss(filtered): 매칭된 룰만 출력", () => {
    const c = new StructuredCssCollector();
    c.addRule(".known", "color: red");
    c.addRule(".missing", "color: blue");
    const css = c.generateCss(new Set([".known"]), new CssVariableTracker());
    expect(css).toContain(".known { color: red }");
    expect(css).not.toContain(".missing");
  });

  it("generateCss(full): 필터 우회, 전체 출력", () => {
    const c = new StructuredCssCollector();
    c.addRule(".missing", "color: blue");
    const css = c.generateCss(new Set(), new CssVariableTracker(), { mode: "full" });
    expect(css).toContain(".missing { color: blue }");
  });

  it("generateCss: 변수 추적은 매칭된 룰 styles에만", () => {
    const c = new StructuredCssCollector();
    const tracker = new CssVariableTracker();
    tracker.collectDefinitions("--used: red; --unused: blue;");
    c.addRule(".known", "color: var(--used)");
    c.addRule(".missing", "color: var(--unused)");
    const css = c.generateCss(new Set([".known"]), tracker);
    expect(css).toContain("--used: red");
    expect(css).not.toContain("--unused");
  });

  it("generateCss: 출력 순서 :root → font-face → keyframes → layer → media", () => {
    const c = new StructuredCssCollector();
    const tracker = new CssVariableTracker();
    tracker.collectDefinitions("--v: 1;");
    c.fontFaceRules.push("@font-face { font-family: X }");
    c.keyframeRules.push("@keyframes spin { from {} to {} }");
    c.addRule(".chat-x", "color: var(--v)");
    c.addRule(".chat-l", "color: blue", { type: "layer", name: "base" });
    c.addRule(".chat-m", "color: green", { type: "media", condition: "screen" });
    const css = c.generateCss(new Set(), tracker);
    const idx = (s: string) => css.indexOf(s);
    expect(idx(":root")).toBeLessThan(idx("@font-face"));
    expect(idx("@font-face")).toBeLessThan(idx("@keyframes"));
    expect(idx("@keyframes")).toBeLessThan(idx("@layer"));
    expect(idx("@layer")).toBeLessThan(idx("@media"));
    expect(idx("@layer")).toBeLessThan(idx(".chat-x"));
    expect(idx(".chat-x")).toBeLessThan(idx("@media"));
  });
});
