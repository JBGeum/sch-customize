/**
 * Chat archive 전용 CSS 수집기.
 *
 * 아카이브 HTML은 Foundry 외부에서도 단독으로 열 수 있어야 하므로, 현재 페이지의 모든 styleSheet에서
 * 아카이브 DOM에 사용된 selector만 골라 인라인 `<style>`로 박아 넣는다.
 *
 * 처리 항목:
 *  - CSS 변수(`--xyz`) 정의/사용 추적 후 :root 블록 재생성
 *  - `@media`, `@layer`, `@supports`, `@font-face`, `@keyframes` 보존
 *  - CSS Cascade Layer 룰(@layer, constructor.name 으로 식별) 처리
 *  - 사용자 색상 기반 메시지 배경 룰 자동 생성
 */

import { hexToRgba } from "./util";
import { mergeCss } from "./css-merge";
import { CssVariableTracker, StructuredCssCollector, getSelectorsWithAncestors, type CssContext } from "./css-collect";

function extractStyles(rule: CSSRule): string {
  const text = rule.cssText;
  return text.substring(text.indexOf("{") + 1, text.lastIndexOf("}")).trim();
}

/**
 * 그룹 룰(@media/@layer/@supports)의 자식 중 STYLE_RULE만 골라 컨텍스트와 함께 collector에 적재.
 * MEDIA/SUPPORTS/layer 세 분기가 동일하게 쓰던 내부 루프를 모은 것.
 *
 * 의도된 한계(audit D8): 그룹 안에 **중첩된 비-STYLE_RULE**(중첩 @media/@layer/@supports/@container,
 * @font-face/@keyframes)는 수집하지 않는다. collector가 평면 컨텍스트(rule은 media 또는 layer 하나)라
 * 중첩 컨텍스트를 표현할 수 없기 때문이다. 대안은 모두 부적합 — flatten은 중첩 조건을 잃어 정적
 * 아카이브에 조건부 스타일을 무조건 적용하고(새 fidelity 버그), raw 보존은 selector별 DOM 필터링과
 * 충돌한다(bloat 또는 cssText 파싱). 라이브 측정(2026-06-30): 전체 group rule 8125개 중 채팅 selector를
 * 품은 중첩 drop 서브트리는 4개로 영향이 작아, 코어 수집기 일반화(over-engineering) 대신 현 동작을 둔다.
 * (css-merge.ts의 extractChildStyleRules는 비-STYLE_RULE를 raw로 보존 → solo/incremental 비대칭은
 * 의도적 수용. 아카이브 fidelity가 중요해지면 중첩-컨텍스트 지원으로 재검토.)
 */
function collectStyleRules(rules: Iterable<CSSRule>, collector: StructuredCssCollector, context: CssContext | null): void {
  for (const r of Array.from(rules) as CSSRule[]) {
    if (r.type === CSSRule.STYLE_RULE) {
      collector.addRule((r as CSSStyleRule).selectorText, extractStyles(r), context);
    }
  }
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
export function processStyleSheetStructured(sheet: CSSStyleSheet, collector: StructuredCssCollector, variableTracker: CssVariableTracker, processedSheets: Set<string>, depth = 0): void {
  if (depth > 10) return;

  try {
    if (sheet.href && processedSheets.has(sheet.href)) return;
    if (sheet.href) processedSheets.add(sheet.href);

    const rules = sheet.cssRules || (sheet as any).rules;
    if (!rules) return;

    for (const rule of Array.from(rules) as CSSRule[]) {
      try {
        switch (rule.type) {
          case CSSRule.STYLE_RULE: {
            const styles = extractStyles(rule);
            collector.addRule((rule as CSSStyleRule).selectorText, styles);
            if ((rule as CSSStyleRule).selectorText.includes(":root") || (rule as CSSStyleRule).selectorText === "html") {
              variableTracker.collectDefinitions(styles);
            }
            break;
          }
          case CSSRule.IMPORT_RULE:
            if ((rule as CSSImportRule).styleSheet) {
              processStyleSheetStructured((rule as CSSImportRule).styleSheet!, collector, variableTracker, processedSheets, depth + 1);
            }
            break;
          case CSSRule.MEDIA_RULE: {
            const condition = (rule as CSSMediaRule).conditionText || (rule as CSSMediaRule).media?.mediaText || "";
            collectStyleRules((rule as CSSGroupingRule).cssRules, collector, { type: "media", condition });
            break;
          }
          case CSSRule.FONT_FACE_RULE:
            collector.fontFaceRules.push(rule.cssText);
            break;
          case CSSRule.KEYFRAMES_RULE:
            collector.keyframeRules.push(rule.cssText);
            break;
          case CSSRule.SUPPORTS_RULE:
            collectStyleRules((rule as CSSGroupingRule).cssRules, collector, null);
            break;
          // @layer 블록 룰(CSSLayerBlockRule)은 `.type === 0`이라 numeric case로 못 잡는다.
          // constructor.name으로 식별해 layer 컨텍스트로 자식을 수집한다.
          // (CSSLayerStatementRule `@layer a,b;`는 cssRules가 없어 가드로 무시.)
          default:
            if (rule.constructor.name === "CSSLayerBlockRule" && (rule as any).cssRules) {
              const layerName = (rule as any).name || "anonymous";
              collectStyleRules((rule as any).cssRules, collector, { type: "layer", name: layerName });
            }
            break;
        }
      } catch (_ruleError) {}
    }
  } catch (e) {
    console.warn(`스타일시트 처리 오류: ${(e as any).message}`);
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
export function createCssList(selectors: Iterable<string> | null, targetDoc: Document | null = null, options: { mode?: "filtered" | "full", existingCss?: string | null } = {}): string {
  const { mode = "filtered", existingCss = null } = options;

  const collector = new StructuredCssCollector();
  const variableTracker = new CssVariableTracker();
  const processedSheets = new Set<string>();

  const domSelectors = targetDoc
    ? getSelectorsWithAncestors(targetDoc)
    : new Set<string>(selectors ?? []);

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const testAccess = sheet.cssRules || (sheet as any).rules;
      if (!testAccess) continue;
      processStyleSheetStructured(sheet, collector, variableTracker, processedSheets);
    } catch (_e) {
      if (sheet.href) processedSheets.add(sheet.href);
    }
  }

  let css = collector.generateCss(domSelectors, variableTracker, { mode });

  // 사용자 색상 → 메시지 배경 룰 자동 추가
  for (const user of game.users!) {
    const bgColor = hexToRgba(user.color.toString(), 0.3);
    css += `div.chat-box.user-${user.id} { background-color: ${bgColor} !important; }\n`;
  }

  if (existingCss) {
    css = mergeCss(existingCss, css);
  }

  return css;
}
