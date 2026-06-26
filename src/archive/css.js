/**
 * Chat archive 전용 CSS 수집기.
 *
 * 아카이브 HTML은 Foundry 외부에서도 단독으로 열 수 있어야 하므로, 현재 페이지의 모든 styleSheet에서
 * 아카이브 DOM에 사용된 selector만 골라 인라인 `<style>`로 박아 넣는다.
 *
 * 처리 항목:
 *  - CSS 변수(`--xyz`) 정의/사용 추적 후 :root 블록 재생성
 *  - `@media`, `@layer`, `@supports`, `@font-face`, `@keyframes` 보존
 *  - CSS Cascade Layer 룰(CSSRule type 12/13) 처리
 *  - 사용자 색상 기반 메시지 배경 룰 자동 생성
 */

import { hexToRgba } from "./util";
import { mergeCss } from "./css-merge";

/**
 * :root에 출력 가능한 단일 변수 값의 최대 길이(문자 수).
 *
 * 이 한계를 초과하는 변수(전형적으로 base64/SVG data URL이 박힌 테마 변수,
 * 예: `--tjs-checkerboard-background-10`)는 chat-styles.css export에서 제외한다.
 * 한 줄짜리 :root가 수 KB로 늘어나면 일부 파서/뷰어/CSSOM 단계에서 잘림이 발생해
 * 이후 변수까지 깨지는 사례가 있어, 사전에 잘라낸다.
 */
const MAX_VAR_LENGTH = 2000;

/**
 * `var(--foo)` 사용을 추적하고, :root 등 정의부에서 발견된 `--foo: 값`을 매핑한다.
 * 결과적으로 실제 사용되는 변수만 :root에 다시 박아낸다.
 */
export class CssVariableTracker {
  constructor() {
    this.definitions = new Map();
    this.usages = new Set();
  }

  extractUsages(styleText) {
    const matches = styleText.matchAll(/var\(\s*(--[a-zA-Z0-9-_]+)/g);
    for (const match of matches) {
      this.usages.add(match[1]);
    }
  }

  collectDefinitions(styleText) {
    const matches = styleText.matchAll(/(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+)/g);
    for (const match of matches) {
      this.definitions.set(match[1], match[2].trim());
    }
  }

  /**
   * `--a`가 사용되었고 그 정의값에 `var(--b)`가 포함되어 있다면 `--b`도 사용된 것으로 간주.
   * 의존성이 안정될 때까지 최대 10회 반복.
   */
  resolveTransitiveDependencies() {
    let changed = true;
    let iteration = 0;
    while (changed && iteration < 10) {
      changed = false;
      iteration++;
      for (const [varName, value] of this.definitions) {
        if (!this.usages.has(varName) && value) {
          for (const usedVar of this.usages) {
            const usedValue = this.definitions.get(usedVar);
            if (usedValue && usedValue.includes(`var(${varName}`)) {
              this.usages.add(varName);
              changed = true;
              break;
            }
          }
        }
      }
    }
  }

  /**
   * @param {boolean} includeAll - true면 사용 여부와 무관하게 정의된 모든 변수를 출력
   *
   * 출력 정책:
   *  - 값 길이가 `MAX_VAR_LENGTH`를 초과하는 변수는 export에서 제외 (예: base64 data URL)
   *  - 각 변수는 별도 줄로 직렬화하여 한 줄짜리 거대 :root로 인한 잘림을 방지
   */
  generateRootCss(includeAll = false) {
    this.resolveTransitiveDependencies();
    const vars = [];
    const skipped = [];

    const pushVar = (varName, value) => {
      if (typeof value !== "string") return;
      if (value.length > MAX_VAR_LENGTH) {
        skipped.push({ varName, length: value.length });
        return;
      }
      vars.push(`${varName}: ${value}`);
    };

    if (includeAll) {
      for (const [varName, value] of this.definitions) {
        pushVar(varName, value);
      }
    } else {
      for (const varName of this.usages) {
        if (this.definitions.has(varName)) {
          pushVar(varName, this.definitions.get(varName));
        }
      }
    }

    if (skipped.length && typeof console !== "undefined") {
      console.log(
        `[chat-tailor] :root에서 길이 초과 변수 ${skipped.length}개 제외 ` +
        `(임계값 ${MAX_VAR_LENGTH}자): ` +
        skipped.slice(0, 5).map(s => `${s.varName}(${s.length}자)`).join(", ") +
        (skipped.length > 5 ? ` 외 ${skipped.length - 5}개` : ""),
      );
    }

    return vars.length ? `:root {\n  ${vars.join(";\n  ")};\n}` : "";
  }
}

/**
 * 룰을 컨텍스트(@media, @layer)별로 분류해 모은 다음, DOM에 실제 매칭되는 것만 직렬화한다.
 */
export class StructuredCssCollector {
  constructor() {
    this.rootRules = [];
    this.mediaRules = new Map();
    this.layerRules = new Map();
    this.keyframeRules = [];
    this.fontFaceRules = [];
  }

  addRule(selector, styles, context = null) {
    const rule = { selector, styles };
    if (!context) {
      this.rootRules.push(rule);
    } else if (context.type === "media") {
      if (!this.mediaRules.has(context.condition)) {
        this.mediaRules.set(context.condition, []);
      }
      this.mediaRules.get(context.condition).push(rule);
    } else if (context.type === "layer") {
      if (!this.layerRules.has(context.name)) {
        this.layerRules.set(context.name, []);
      }
      this.layerRules.get(context.name).push(rule);
    }
  }

  /**
   * @param {Set<string>} domSelectors
   * @param {CssVariableTracker} variableTracker
   * @param {{ mode?: 'filtered' | 'full' }} [options]
   *   - 'filtered' (기본): selectorMatchesDom 통과한 룰만 출력
   *   - 'full': 필터 우회, 수집된 모든 룰 출력
   *
   * 변수 사용 추적은 *출력될 룰* 의 styles에 한해서만 수행한다. 채팅 selector에
   * 매칭되지 않아 어차피 제외될 룰의 var(--x) 사용 때문에 :root가 부풀어오르는
   * 문제를 막기 위함. (filtered 모드에서만 의미가 있으며, full 모드에서는 모든
   * 룰이 출력 대상이므로 결과적으로 모든 변수가 추적된다.)
   */
  generateCss(domSelectors, variableTracker, options = {}) {
    const includeAll = options.mode === "full";
    const matches = (r) => includeAll ? true : selectorMatchesDom(r.selector, domSelectors);

    const matchedRoot = this.rootRules.filter(matches);
    const matchedLayer = new Map();
    for (const [name, rules] of this.layerRules) {
      const m = rules.filter(matches);
      if (m.length) matchedLayer.set(name, m);
    }
    const matchedMedia = new Map();
    for (const [condition, rules] of this.mediaRules) {
      const m = rules.filter(matches);
      if (m.length) matchedMedia.set(condition, m);
    }

    for (const r of matchedRoot) variableTracker.extractUsages(r.styles);
    for (const rules of matchedLayer.values()) {
      for (const r of rules) variableTracker.extractUsages(r.styles);
    }
    for (const rules of matchedMedia.values()) {
      for (const r of rules) variableTracker.extractUsages(r.styles);
    }

    let output = variableTracker.generateRootCss(includeAll) + "\n";
    this.fontFaceRules.forEach(r => output += r + "\n");
    this.keyframeRules.forEach(r => output += r + "\n");

    for (const [name, rules] of matchedLayer) {
      output += `@layer ${name} {\n`;
      rules.forEach(r => output += `  ${r.selector} { ${r.styles} }\n`);
      output += "}\n";
    }

    matchedRoot.forEach(r => output += `${r.selector} { ${r.styles} }\n`);

    for (const [condition, rules] of matchedMedia) {
      output += `@media ${condition} {\n`;
      rules.forEach(r => output += `  ${r.selector} { ${r.styles} }\n`);
      output += "}\n";
    }

    return output;
  }
}

/**
 * 항상 포함시킬 selector 패턴. dnd5e 카드, midi 표시, fa* 아이콘 등 채팅에서 자주 쓰이는 셀렉터를
 * DOM 매칭이 불확실해도 강제로 포함시킨다.
 *
 * 누적(incremental) 모드의 하이브리드 baseline 안전 마진 확보를 위해, 채팅에 영향을 줄 가능성이
 * 있는 주요 시스템·모듈 prefix를 넉넉히 포함한다.
 */
const ALWAYS_INCLUDE_PATTERNS = [
  // chat-tailor 자체
  /\.chat-/, /\.message/, /\.priv[-_]?talk/, /\.pt\b/, /\.chitchat/, /\.speaker-/,
  // 주사위 / 롤 / 인라인
  /\.dice-/, /\.roll/, /\.inline-roll/,
  // midi-qol
  /\.midi-/, /\.midi-qol/,
  // 카드 / 액션
  /\.card-/, /\.activation/, /\.tooltip/, /\.evaluation/,
  /\.targets/, /\.effects/, /\.apply/, /\.collapsible/,
  /\.wrapper/, /\.summary/, /\.details/, /\.pill/, /\.gold-icon/,
  /\.name-stacked/, /\.flavor-text/,
  // 시스템 prefix (DnD5e, PF2e 등)
  /\.dnd5e/, /\.pf2e/, /\.pf1/, /\.swade/, /\.cof/, /\.coc7/,
  // Foundry 코어 / app shell
  /\.app\b/, /\.window-/, /\.foundryvtt-/, /\.flexrow/, /\.flexcol/,
  // 폰트 / 아이콘
  /\.fa-/, /\.fas\b/, /\.far\b/, /\.fab\b/, /\.fal\b/, /\.fad\b/,
  /\.roboto/, /font-awesome/,
  // chat-portrait 등 채팅 보조 모듈
  /\.chat-portrait/, /\.module-/,
  // 메시지 식별
  /\[data-message-id\]/, /\[data-actor-id\]/,
];

export function selectorMatchesDom(cssSelector, domSelectors) {
  if (ALWAYS_INCLUDE_PATTERNS.some(pattern => pattern.test(cssSelector))) {
    return true;
  }

  const selectorParts = cssSelector.split(",").map(s => s.trim());
  return selectorParts.some(part => {
    const cleanPart = part.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").trim();
    if (!cleanPart) return true;

    const tokens = cleanPart.split(/\s+/).filter(t => t && !/^[>+~]$/.test(t));
    return tokens.every(token => {
      const cleanToken = token.replace(/^[>+~]/, "").trim();
      if (!cleanToken) return true;

      const parts = cleanToken.match(/[.#]?[a-zA-Z0-9_-]+|\[[^\]]+\]/g) || [];
      return parts.every(p => {
        if (!p.startsWith(".") && !p.startsWith("#") && !p.startsWith("[")) {
          return true;
        }
        return domSelectors.has(p);
      });
    });
  });
}

/**
 * 아카이브 doc의 모든 요소에서 사용 가능한 selector 후보를 수집한다.
 * 가까운 조상 3단계까지의 selector 조합도 같이 만든다.
 */
export function getSelectorsWithAncestors(targetDoc) {
  const selectorsSet = new Set([":root", "*", "html", "body"]);

  function getElementSelector(element) {
    const selectors = [];
    if (element.tagName) selectors.push(element.tagName.toLowerCase());
    if (element.id) selectors.push(`#${element.id}`);

    const classes = [...(element.classList || [])];
    classes.forEach(cls => selectors.push(`.${cls}`));

    if (classes.length >= 2) {
      for (let i = 0; i < classes.length; i++) {
        for (let j = i + 1; j < classes.length; j++) {
          selectors.push(`.${classes[i]}.${classes[j]}`);
        }
      }
      if (classes.length <= 5) selectors.push("." + classes.join("."));
    }

    for (const attr of (element.attributes || [])) {
      if (attr.name.startsWith("data-")) {
        selectors.push(`[${attr.name}]`);
        selectors.push(`[${attr.name}="${attr.value}"]`);
      }
    }
    return selectors;
  }

  function traverse(element, ancestors = []) {
    if (!element || element.nodeType !== 1) return;

    const elementSelectors = getElementSelector(element);
    elementSelectors.forEach(sel => selectorsSet.add(sel));

    for (let depth = 1; depth <= Math.min(ancestors.length, 3); depth++) {
      const ancestor = ancestors[ancestors.length - depth];
      const ancestorSelectors = getElementSelector(ancestor);

      const keyAncestorSelectors = ancestorSelectors
        .filter(s => s.startsWith(".") || s.startsWith("#"))
        .slice(0, 3);

      keyAncestorSelectors.forEach(ancSel => {
        elementSelectors.forEach(elemSel => {
          if (elemSel.startsWith(".") || elemSel.startsWith("#")) {
            selectorsSet.add(`${ancSel} ${elemSel}`);
          }
        });
      });
    }

    for (const child of (element.children || [])) {
      traverse(child, [...ancestors, element]);
    }
  }

  if (targetDoc.body) traverse(targetDoc.body, []);
  return selectorsSet;
}

function extractStyles(rule) {
  const text = rule.cssText;
  return text.substring(text.indexOf("{") + 1, text.lastIndexOf("}")).trim();
}

/**
 * 한 styleSheet 트리(@import 포함)를 재귀적으로 순회하며 collector에 룰을 적재한다.
 *
 * 변수 사용 추적(`extractUsages`)은 여기서 하지 않는다. 이 단계에서 모든 룰의 var
 * 사용을 모아두면 채팅 selector와 무관한 외부 모듈(TyphonJS 등) 룰의 var(--x)
 * 사용까지 :root에 강제로 박히면서, 결과 :root가 base64 data URL 같은 거대 값을
 * 끌어와 4KB+ 한 줄로 부풀어오르는 문제가 있었다. 사용 추적은 `generateCss`에서
 * 매칭된(=실제 출력되는) 룰의 styles에 한해서만 수행한다.
 *
 * 단, `:root` / `html` 룰의 styles에서 변수 *정의*는 수집해 둔다.
 */
function processStyleSheetStructured(sheet, collector, variableTracker, processedSheets, depth = 0) {
  if (depth > 10) return;

  try {
    if (sheet.href && processedSheets.has(sheet.href)) return;
    if (sheet.href) processedSheets.add(sheet.href);

    const rules = sheet.cssRules || sheet.rules;
    if (!rules) return;

    for (const rule of rules) {
      try {
        switch (rule.type) {
          case CSSRule.STYLE_RULE: {
            const styles = extractStyles(rule);
            collector.addRule(rule.selectorText, styles);
            if (rule.selectorText.includes(":root") || rule.selectorText === "html") {
              variableTracker.collectDefinitions(styles);
            }
            break;
          }
          case CSSRule.IMPORT_RULE:
            if (rule.styleSheet) {
              processStyleSheetStructured(rule.styleSheet, collector, variableTracker, processedSheets, depth + 1);
            }
            break;
          case CSSRule.MEDIA_RULE: {
            const condition = rule.conditionText || rule.media?.mediaText || "";
            for (const r of rule.cssRules) {
              if (r.type === CSSRule.STYLE_RULE) {
                const styles = extractStyles(r);
                collector.addRule(r.selectorText, styles, { type: "media", condition });
              }
            }
            break;
          }
          // 12/13: @layer 룰(CSSLayerBlockRule / CSSLayerStatementRule) — 일부 브라우저에서 상수 미정의
          case 12:
          case 13: {
            const layerName = rule.name || "anonymous";
            if (rule.cssRules) {
              for (const r of rule.cssRules) {
                if (r.type === CSSRule.STYLE_RULE) {
                  const styles = extractStyles(r);
                  collector.addRule(r.selectorText, styles, { type: "layer", name: layerName });
                }
              }
            }
            break;
          }
          case CSSRule.FONT_FACE_RULE:
            collector.fontFaceRules.push(rule.cssText);
            break;
          case CSSRule.KEYFRAMES_RULE:
            collector.keyframeRules.push(rule.cssText);
            break;
          case CSSRule.SUPPORTS_RULE:
            for (const r of rule.cssRules) {
              if (r.type === CSSRule.STYLE_RULE) {
                const styles = extractStyles(r);
                collector.addRule(r.selectorText, styles);
              }
            }
            break;
        }
      } catch (_ruleError) {}
    }
  } catch (e) {
    console.warn(`스타일시트 처리 오류: ${e.message}`);
  }
}

/**
 * 메인 진입점. 대상 doc에서 사용된 selector만 추려 모든 styleSheet 룰을 직렬화하고,
 * 사용자 색상 기반 메시지 배경 룰도 함께 덧붙인다.
 *
 * @param {Iterable<string>|null} selectors - targetDoc가 없을 때 사용할 selector 집합
 * @param {Document|null} targetDoc - 매칭할 대상 doc (있으면 selector 자동 추출)
 * @param {object} [options]
 * @param {'filtered'|'full'} [options.mode='filtered']
 *   - 'filtered': DOM 매칭 + ALWAYS_INCLUDE_PATTERNS 기반 (기본)
 *   - 'full': selectorMatchesDom 우회, 활성 styleSheet 전체 덤프
 * @param {string|null} [options.existingCss=null] - 머지할 기존 CSS 텍스트 (선택)
 * @returns {string} 직렬화된 CSS
 */
export function createCssList(selectors, targetDoc = null, options = {}) {
  const { mode = "filtered", existingCss = null } = options;

  const collector = new StructuredCssCollector();
  const variableTracker = new CssVariableTracker();
  const processedSheets = new Set();

  const domSelectors = targetDoc
    ? getSelectorsWithAncestors(targetDoc)
    : new Set(selectors);

  for (const sheet of document.styleSheets) {
    try {
      const testAccess = sheet.cssRules || sheet.rules;
      if (!testAccess) continue;
      processStyleSheetStructured(sheet, collector, variableTracker, processedSheets);
    } catch (_e) {
      if (sheet.href) processedSheets.add(sheet.href);
    }
  }

  let css = collector.generateCss(domSelectors, variableTracker, { mode });

  // 사용자 색상 → 메시지 배경 룰 자동 추가
  for (const user of game.users) {
    const bgColor = hexToRgba(user.color.toString(), 0.3);
    css += `div.chat-box.user-${user._id} { background-color: ${bgColor} !important; }\n`;
  }

  if (existingCss) {
    css = mergeCss(existingCss, css);
  }

  return css;
}
