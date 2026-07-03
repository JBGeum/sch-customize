// jsdom 환경에 CSSRule 상수가 없을 경우를 대비한 최소 폴리필.
// css-merge.ts 가 CSSRule.STYLE_RULE 등을 참조하므로 테스트 런타임에 보장한다.
if (typeof (globalThis as { CSSRule?: unknown }).CSSRule === "undefined") {
  (globalThis as Record<string, unknown>).CSSRule = {
    STYLE_RULE: 1,
    MEDIA_RULE: 4,
    FONT_FACE_RULE: 5,
    KEYFRAMES_RULE: 7,
    SUPPORTS_RULE: 12,
  };
}
