/**
 * 두 CSS 텍스트(기존 + 신규)를 룰 단위로 union 머지한다.
 *
 *  - STYLE_RULE: `selectorText|body` 시그니처로 dedup. 동일 selector이지만 body가 다른 룰은
 *    둘 다 보존하고 신규본이 후미에 오도록 정렬하여 cascade에서 우위를 가지게 한다.
 *  - @media: condition별로 그룹핑 후 내부 룰 dedup.
 *  - @layer: layer name별로 그룹핑. 선언 순서는 기존 파일 기준 보존(기존에 없던 새 layer는 후미).
 *  - @font-face, @keyframes: 전체 cssText 시그니처로 dedup.
 *  - :root 등 CSS 변수: STYLE_RULE 일반 규칙을 그대로 따르며, 동일 변수의 변경은 후미 신규본이 cascade 우위.
 *
 * 파싱은 브라우저 CSSOM(`<style>` 임시 부착 후 sheet.cssRules)을 이용한다.
 */

interface ChildStyleRule {
  selectorText?: string;
  body?: string;
  raw?: string;
}

interface StyleRuleEntry {
  selectorText: string;
  body: string;
}

interface CategorizedRules {
  styleRules: StyleRuleEntry[];
  mediaRules: Map<string, ChildStyleRule[]>;
  layerRules: Map<string, ChildStyleRule[]>;
  layerOrder: string[];
  fontFaceRules: Array<{text: string}>;
  keyframeRules: Array<{name: string, text: string}>;
  otherRules: Array<{text: string}>;
}

function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\s+/g, " ")
    .replace(/\s*([:;,{}])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function ruleKey(selectorText: string, bodyText: string): string {
  return `${normalizeText(selectorText)}|${normalizeText(bodyText)}`;
}

/**
 * 임시 `<style>` 요소를 head에 부착해 cssRules를 얻은 뒤 제거한다.
 * 입력이 빈 문자열이거나 파싱 실패면 빈 배열 반환.
 */
function parseCssToRules(cssText: string | null | undefined): CSSRule[] {
  if (!cssText || !cssText.trim()) return [];
  const styleEl = document.createElement("style");
  styleEl.textContent = cssText;
  document.head.appendChild(styleEl);
  try {
    const rules = styleEl.sheet?.cssRules;
    return rules ? Array.from(rules) : [];
  } finally {
    styleEl.remove();
  }
}

function extractBody(styleRule: CSSRule): string {
  const text = styleRule.cssText || "";
  const open = text.indexOf("{");
  const close = text.lastIndexOf("}");
  if (open < 0 || close < 0) return "";
  return text.substring(open + 1, close).trim();
}

function extractChildStyleRules(groupRule: CSSGroupingRule): ChildStyleRule[] {
  const children: ChildStyleRule[] = [];
  for (const child of Array.from(groupRule.cssRules || [])) {
    if (child.type === CSSRule.STYLE_RULE) {
      children.push({ selectorText: (child as CSSStyleRule).selectorText, body: extractBody(child) });
    } else {
      children.push({ raw: child.cssText });
    }
  }
  return children;
}

/**
 * 룰들을 카테고리별로 분류한다. 출력 순서를 보존하기 위해 배열로 저장.
 */
function categorize(rules: CSSRule[]): CategorizedRules {
  const out: CategorizedRules = {
    styleRules: [],
    mediaRules: new Map(),
    layerRules: new Map(),
    layerOrder: [],
    fontFaceRules: [],
    keyframeRules: [],
    otherRules: [],
  };

  for (const rule of rules) {
    try {
      switch (rule.type) {
        case CSSRule.STYLE_RULE:
          out.styleRules.push({ selectorText: (rule as CSSStyleRule).selectorText, body: extractBody(rule) });
          break;
        case CSSRule.MEDIA_RULE: {
          const cond = (rule as CSSMediaRule).conditionText || (rule as CSSMediaRule).media?.mediaText || "";
          if (!out.mediaRules.has(cond)) out.mediaRules.set(cond, []);
          out.mediaRules.get(cond)!.push(...extractChildStyleRules(rule as CSSGroupingRule));
          break;
        }
        case CSSRule.FONT_FACE_RULE:
          out.fontFaceRules.push({ text: rule.cssText });
          break;
        case CSSRule.KEYFRAMES_RULE:
          out.keyframeRules.push({ name: (rule as CSSKeyframesRule).name, text: rule.cssText });
          break;
        case 12:
        case 13: {
          const name = (rule as any).name || "anonymous";
          if (!out.layerRules.has(name)) {
            out.layerRules.set(name, []);
            out.layerOrder.push(name);
          }
          if ((rule as any).cssRules) {
            out.layerRules.get(name)!.push(...extractChildStyleRules(rule as unknown as CSSGroupingRule));
          }
          break;
        }
        case CSSRule.SUPPORTS_RULE:
          out.otherRules.push({ text: rule.cssText });
          break;
        default:
          if (rule.cssText) out.otherRules.push({ text: rule.cssText });
      }
    } catch (_e) {
      // 일부 브라우저에서 접근 불가한 룰은 조용히 건너뛴다
    }
  }

  return out;
}

function unionChildren(existing: ChildStyleRule[], fresh: ChildStyleRule[]): ChildStyleRule[] {
  const seen = new Set<string>();
  const out: ChildStyleRule[] = [];
  for (const child of existing) {
    const key = child.raw
      ? `raw:${normalizeText(child.raw)}`
      : ruleKey(child.selectorText!, child.body!);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(child);
    }
  }
  for (const child of fresh) {
    const key = child.raw
      ? `raw:${normalizeText(child.raw)}`
      : ruleKey(child.selectorText!, child.body!);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(child);
    }
  }
  return out;
}

function serializeStyleRule(child: ChildStyleRule): string {
  if (child.raw) return child.raw;
  return `${child.selectorText!} { ${child.body!} }`;
}

function serializeCategorized(cat: CategorizedRules): string {
  let out = "";

  for (const ff of cat.fontFaceRules) out += `${ff.text}\n`;
  for (const kf of cat.keyframeRules) out += `${kf.text}\n`;

  for (const layerName of cat.layerOrder) {
    const children = cat.layerRules.get(layerName) || [];
    if (!children.length) continue;
    out += `@layer ${layerName} {\n`;
    for (const child of children) {
      out += `  ${serializeStyleRule(child)}\n`;
    }
    out += "}\n";
  }

  for (const child of cat.styleRules) {
    out += `${serializeStyleRule(child)}\n`;
  }

  for (const [cond, children] of cat.mediaRules) {
    if (!children.length) continue;
    out += `@media ${cond} {\n`;
    for (const child of children) {
      out += `  ${serializeStyleRule(child)}\n`;
    }
    out += "}\n";
  }

  for (const other of cat.otherRules) {
    out += `${other.text}\n`;
  }

  return out;
}

/**
 * 기존 CSS와 신규 CSS를 룰 단위로 union 머지한다.
 *
 * @param {string|null} existingCssText
 * @param {string} freshCssText
 * @returns {string} 머지된 CSS
 */
export function mergeCss(existingCssText: string | null, freshCssText: string): string {
  const existingRules = parseCssToRules(existingCssText);
  const freshRules = parseCssToRules(freshCssText);

  const eCat = categorize(existingRules);
  const fCat = categorize(freshRules);

  const styleSeen = new Set<string>();
  const mergedStyle: StyleRuleEntry[] = [];
  for (const r of eCat.styleRules) {
    const key = ruleKey(r.selectorText, r.body);
    if (!styleSeen.has(key)) {
      styleSeen.add(key);
      mergedStyle.push(r);
    }
  }
  for (const r of fCat.styleRules) {
    const key = ruleKey(r.selectorText, r.body);
    if (!styleSeen.has(key)) {
      styleSeen.add(key);
      mergedStyle.push(r);
    }
  }

  // 사용자 색상 룰: 같은 user-id면 신규본만 남기고 기존본은 제거 (신규본은 이미 후미 위치)
  const userColorRegex = /^\s*div\.chat-box\.user-([A-Za-z0-9_-]+)\s*$/;
  const freshUserColorIds = new Set<string>();
  for (const r of fCat.styleRules) {
    const m = r.selectorText.match(userColorRegex);
    if (m) freshUserColorIds.add(m[1]);
  }
  if (freshUserColorIds.size > 0) {
    for (let i = mergedStyle.length - 1; i >= 0; i--) {
      const r = mergedStyle[i];
      const m = r.selectorText.match(userColorRegex);
      if (!m) continue;
      if (!freshUserColorIds.has(m[1])) continue;
      const isInFresh = fCat.styleRules.some(fr => {
        const fm = fr.selectorText.match(userColorRegex);
        return fm && fm[1] === m[1] && ruleKey(fr.selectorText, fr.body) === ruleKey(r.selectorText, r.body);
      });
      if (!isInFresh) {
        mergedStyle.splice(i, 1);
      }
    }
  }

  const mergedMedia = new Map<string, ChildStyleRule[]>();
  for (const [cond, children] of eCat.mediaRules) {
    mergedMedia.set(cond, [...children]);
  }
  for (const [cond, children] of fCat.mediaRules) {
    if (mergedMedia.has(cond)) {
      mergedMedia.set(cond, unionChildren(mergedMedia.get(cond)!, children));
    } else {
      mergedMedia.set(cond, [...children]);
    }
  }

  const mergedLayer = new Map<string, ChildStyleRule[]>();
  const mergedLayerOrder: string[] = [];
  for (const name of eCat.layerOrder) {
    mergedLayer.set(name, [...(eCat.layerRules.get(name) || [])]);
    mergedLayerOrder.push(name);
  }
  for (const name of fCat.layerOrder) {
    if (mergedLayer.has(name)) {
      mergedLayer.set(name, unionChildren(mergedLayer.get(name)!, fCat.layerRules.get(name) || []));
    } else {
      mergedLayer.set(name, [...(fCat.layerRules.get(name) || [])]);
      mergedLayerOrder.push(name);
    }
  }

  const ffSeen = new Set<string>();
  const mergedFontFace: Array<{text: string}> = [];
  for (const ff of [...eCat.fontFaceRules, ...fCat.fontFaceRules]) {
    const key = normalizeText(ff.text);
    if (!ffSeen.has(key)) {
      ffSeen.add(key);
      mergedFontFace.push(ff);
    }
  }
  const kfSeen = new Set<string>();
  const mergedKeyframes: Array<{name: string, text: string}> = [];
  for (const kf of [...eCat.keyframeRules, ...fCat.keyframeRules]) {
    const key = normalizeText(kf.text);
    if (!kfSeen.has(key)) {
      kfSeen.add(key);
      mergedKeyframes.push(kf);
    }
  }

  const otherSeen = new Set<string>();
  const mergedOther: Array<{text: string}> = [];
  for (const o of [...eCat.otherRules, ...fCat.otherRules]) {
    const key = normalizeText(o.text);
    if (!otherSeen.has(key)) {
      otherSeen.add(key);
      mergedOther.push(o);
    }
  }

  const merged: CategorizedRules = {
    styleRules: mergedStyle,
    mediaRules: mergedMedia,
    layerRules: mergedLayer,
    layerOrder: mergedLayerOrder,
    fontFaceRules: mergedFontFace,
    keyframeRules: mergedKeyframes,
    otherRules: mergedOther,
  };

  const output = serializeCategorized(merged);

  if (typeof console !== "undefined" && console.log) {
    console.log(`[sch-customize] mergeCss: existing style rules ${eCat.styleRules.length}, new ${fCat.styleRules.length}, output ${mergedStyle.length}`);
  }

  return output;
}
