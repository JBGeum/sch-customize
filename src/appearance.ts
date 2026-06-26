/**
 * 채팅 외관(폰트/색상/여백/밝기)을 결정하는 CSS 변수와, 유저 색상 기반 메시지 배경 스타일을 관리한다.
 *
 * 단방향 파이프라인:
 *   game.settings (Number/String) → updateCssProperty(key, value)
 *                                     ↓
 *                                  document.documentElement.style의 CSS custom property
 *                                     ↓
 *                                  styles/priv_talk.css 가 그 변수를 참조
 */

import { MODULE_ID } from "./constants";

/**
 * 외부에서 전달받는 짧은 키 → 실제 CSS custom property 이름 매핑.
 * 키를 짧게 두는 이유는 `settings.onChange`에서 호출이 길어지는 것을 막기 위함.
 */
const CSS_PROPERTY = {
  ptFontSize:  "--priv-talk-font-size",
  fontColor:   "--priv-talk-font-color",
  marginLeft:  "--priv-talk-margin-left",
  brightness:  "--priv-talk-bg-brightness",
  clFontSize:  "--ct-chat-font-size",
};

/**
 * 짧은 키로 CSS custom property를 갱신.
 * @param {keyof typeof CSS_PROPERTY} property
 * @param {string|number} value
 */
export function updateCssProperty(property: keyof typeof CSS_PROPERTY, value: string | number): void {
  if (value === undefined || value === null || value === "") return;
  const cssVar = CSS_PROPERTY[property];
  if (!cssVar) return;
  document.documentElement.style.setProperty(cssVar, String(value));
}

/**
 * 모든 외관 설정값을 한 번에 읽어 CSS 변수에 반영. `init` hook 말미에서 호출된다.
 */
export function applyAllCssSettings(): void {
  const gs = game.settings as any;
  updateCssProperty("fontColor",  `rgba(0,0,0,${gs.get(MODULE_ID, "setPrivTalkFontOpacity")})`);
  updateCssProperty("clFontSize", `${gs.get(MODULE_ID, "setChatLogFontSize")}px`);
  updateCssProperty("ptFontSize", `${gs.get(MODULE_ID, "setPrivTalkFontSize")}px`);
  updateCssProperty("marginLeft", `${gs.get(MODULE_ID, "setPrivTalkMarginLeft")}px`);
  updateCssProperty("brightness", `${gs.get(MODULE_ID, "setPrivTalkBgBrightness")}`);
}

/**
 * 각 user.color를 `.user-<id>` 셀렉터의 배경으로 박는다. `ready` hook에서 호출.
 * v13의 Color 객체도 toString()으로 `#rrggbb` 형식이 나오므로 동일하게 동작.
 */
export function applyUserColorBackgrounds(): void {
  const style = document.createElement("style");
  style.type = "text/css";

  let cssText = "";
  game.users!.forEach(user => {
    cssText += `.user-${user.id} { background: ${user.color} !important; }`;
  });

  const ieStyle = style as unknown as { styleSheet?: { cssText: string } };
  if (ieStyle.styleSheet) {
    ieStyle.styleSheet.cssText = cssText;
  } else {
    style.appendChild(document.createTextNode(cssText));
  }
  document.head.appendChild(style);
}
