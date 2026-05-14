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

import { hexToRgba } from "./util.js";

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

  generateRootCss() {
    this.resolveTransitiveDependencies();
    const vars = [];
    for (const varName of this.usages) {
      if (this.definitions.has(varName)) {
        vars.push(`${varName}: ${this.definitions.get(varName)}`);
      }
    }
    return vars.length ? `:root { ${vars.join("; ")}; }` : "";
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

  generateCss(domSelectors, variableTracker) {
    let output = variableTracker.generateRootCss() + "\n";
    this.fontFaceRules.forEach(r => output += r + "\n");
    this.keyframeRules.forEach(r => output += r + "\n");

    for (const [name, rules] of this.layerRules) {
      const matched = rules.filter(r => selectorMatchesDom(r.selector, domSelectors));
      if (matched.length) {
        output += `@layer ${name} {\n`;
        matched.forEach(r => output += `  ${r.selector} { ${r.styles} }\n`);
        output += "}\n";
      }
    }

    this.rootRules
      .filter(r => selectorMatchesDom(r.selector, domSelectors))
      .forEach(r => output += `${r.selector} { ${r.styles} }\n`);

    for (const [condition, rules] of this.mediaRules) {
      const matched = rules.filter(r => selectorMatchesDom(r.selector, domSelectors));
      if (matched.length) {
        output += `@media ${condition} {\n`;
        matched.forEach(r => output += `  ${r.selector} { ${r.styles} }\n`);
        output += "}\n";
      }
    }

    return output;
  }
}

/**
 * 항상 포함시킬 selector 패턴. dnd5e 카드, midi 표시, fa* 아이콘 등 채팅에서 자주 쓰이는 셀렉터를
 * DOM 매칭이 불확실해도 강제로 포함시킨다.
 */
const ALWAYS_INCLUDE_PATTERNS = [
  /\.chat-/, /\.message/, /\.dice-/, /\.roll/, /\.midi-/,
  /\.card-/, /\.dnd5e/, /\.activation/, /\.tooltip/,
  /\.flexrow/, /\.flexcol/, /\.pill/, /\.gold-icon/,
  /\.name-stacked/, /\.roboto/, /\.fa-/, /\.fas\b/, /\.far\b/,
  /\.collapsible/, /\.wrapper/, /\.summary/, /\.details/,
  /\.evaluation/, /\.targets/, /\.effects/, /\.apply/,
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
            variableTracker.extractUsages(styles);
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
                variableTracker.extractUsages(styles);
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
                  variableTracker.extractUsages(styles);
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
                variableTracker.extractUsages(styles);
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
 */
export function createCssList(selectors, _includeAll = false, targetDoc = null) {
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

  let css = collector.generateCss(domSelectors, variableTracker);

  // 사용자 색상 → 메시지 배경 룰 자동 추가
  for (const user of game.users) {
    const bgColor = hexToRgba(user.color.toString(), 0.3);
    css += `div.chat-box.user-${user._id} { background-color: ${bgColor} !important; }\n`;
  }

  return css;
}
