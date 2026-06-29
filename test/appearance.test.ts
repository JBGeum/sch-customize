import { describe, it, expect, vi, afterEach } from "vitest";
import { updateCssProperty, applyAllCssSettings, applyUserColorBackgrounds } from "../src/appearance";

const CSS_VARS = [
  "--priv-talk-font-size",
  "--priv-talk-font-color",
  "--priv-talk-margin-left",
  "--priv-talk-bg-brightness",
  "--sch-chat-font-size",
];

afterEach(() => {
  vi.unstubAllGlobals();
  const s = document.documentElement.style;
  CSS_VARS.forEach(v => s.removeProperty(v));
  document.head.querySelectorAll("style").forEach(el => el.remove());
});

describe("updateCssProperty", () => {
  const map: Record<string, string> = {
    ptFontSize: "--priv-talk-font-size",
    fontColor: "--priv-talk-font-color",
    marginLeft: "--priv-talk-margin-left",
    brightness: "--priv-talk-bg-brightness",
    clFontSize: "--sch-chat-font-size",
  };
  for (const [key, cssVar] of Object.entries(map)) {
    it(`${key} → ${cssVar}`, () => {
      updateCssProperty(key as any, "5");
      expect(document.documentElement.style.getPropertyValue(cssVar)).toBe("5");
    });
  }
  it("number 값은 String 으로 변환", () => {
    updateCssProperty("clFontSize", 14 as any);
    expect(document.documentElement.style.getPropertyValue("--sch-chat-font-size")).toBe("14");
  });
  it("undefined/null/빈 문자열은 미설정", () => {
    updateCssProperty("ptFontSize", undefined as any);
    updateCssProperty("ptFontSize", null as any);
    updateCssProperty("ptFontSize", "");
    expect(document.documentElement.style.getPropertyValue("--priv-talk-font-size")).toBe("");
  });
  it("미지 property 는 no-op (throw 없음, 변수 미설정)", () => {
    expect(() => updateCssProperty("nope" as any, "1")).not.toThrow();
    CSS_VARS.forEach(v => expect(document.documentElement.style.getPropertyValue(v)).toBe(""));
  });
});

describe("applyAllCssSettings", () => {
  it("game.settings 값을 포맷해 5개 CSS 변수 설정", () => {
    const values: Record<string, any> = {
      setPrivTalkFontOpacity: 0.8,
      setChatLogFontSize: 14,
      setPrivTalkFontSize: 12,
      setPrivTalkMarginLeft: 10,
      setPrivTalkBgBrightness: 0.7,
    };
    vi.stubGlobal("game", { settings: { get: (_m: string, k: string) => values[k] } });
    applyAllCssSettings();
    const s = document.documentElement.style;
    expect(s.getPropertyValue("--priv-talk-font-color")).toBe("rgba(0,0,0,0.8)");
    expect(s.getPropertyValue("--sch-chat-font-size")).toBe("14px");
    expect(s.getPropertyValue("--priv-talk-font-size")).toBe("12px");
    expect(s.getPropertyValue("--priv-talk-margin-left")).toBe("10px");
    expect(s.getPropertyValue("--priv-talk-bg-brightness")).toBe("0.7");
  });
});

describe("applyUserColorBackgrounds", () => {
  it("user별 .user-<id> background 룰을 head style 에 추가", () => {
    const users = [{ id: "u1", color: "#ff0000" }, { id: "u2", color: "#00ff00" }];
    vi.stubGlobal("game", { users: { forEach: (cb: (u: any) => void) => users.forEach(cb) } });
    applyUserColorBackgrounds();
    const styles = document.head.querySelectorAll("style");
    const last = styles[styles.length - 1];
    expect(last.textContent).toContain(".user-u1 { background: #ff0000 !important; }");
    expect(last.textContent).toContain(".user-u2 { background: #00ff00 !important; }");
  });
});
