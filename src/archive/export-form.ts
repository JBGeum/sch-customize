/**
 * Chat archive export 다이얼로그의 **순수/DOM** 폼 로직.
 *
 * Foundry 클래스 전역(FormApplication/Dialog)을 모듈 로드 시 참조하지 않아 단독 테스트 가능.
 * UI 셸(showConfirmDialog/showExportModeDialog/FormApplication 래퍼)은 dialog.ts에 남는다.
 *
 *  - buildExportModeFormHtml: 모드 선택 폼 HTML 생성(game.i18n 사용)
 *  - findExportForm: 다양한 root에서 폼 컨테이너 검색
 *  - attachExportFormHandlers: 모드에 따라 기존 CSS 섹션 표시/숨김 토글
 *  - readExportFormValues: 폼에서 mode + 기존 CSS 텍스트 추출
 */

/**
 * 누적/단독 export 모드 선택 다이얼로그 본문.
 *
 * <form>이 아닌 <div>로 감싼다 — DialogV2의 submit 버튼이 의도치 않게 form submit을 트리거할 가능성 제거.
 */
export function buildExportModeFormHtml(): string {
  const t = (key: string) => game.i18n!.localize(`sch-customize.dialog.export.${key}`);
  return `
    <div class="sch-customize-export-form" style="display:flex;flex-direction:column;gap:0.6rem;">
      <fieldset style="display:flex;flex-direction:column;gap:0.4rem;padding:0.5rem;">
        <legend>${t("legend")}</legend>
        <label style="display:flex;align-items:flex-start;gap:0.4rem;">
          <input type="radio" name="sch-export-mode" value="solo" checked>
          <span><strong>${t("mode.solo.label")}</strong><br>
            <small style="opacity:0.8">${t("mode.solo.hint")}</small>
          </span>
        </label>
        <label style="display:flex;align-items:flex-start;gap:0.4rem;">
          <input type="radio" name="sch-export-mode" value="merge">
          <span><strong>${t("mode.merge.label")}</strong><br>
            <small style="opacity:0.8">${t("mode.merge.hint")}</small>
          </span>
        </label>
        <label style="display:flex;align-items:flex-start;gap:0.4rem;">
          <input type="radio" name="sch-export-mode" value="full">
          <span><strong>${t("mode.full.label")}</strong><br>
            <small style="opacity:0.8">${t("mode.full.hint")}</small>
          </span>
        </label>
      </fieldset>
      <div class="sch-existing-css-section" style="display:none;padding:0.4rem 0.6rem;border-top:1px dashed rgba(0,0,0,0.2);">
        <label style="display:flex;flex-direction:column;gap:0.3rem;">
          <span><strong>${t("existing.label")}</strong></span>
          <input type="file" name="sch-existing-css" accept=".css,text/css">
          <small style="opacity:0.8">${t("existing.hint")}</small>
        </label>
      </div>
    </div>
  `;
}

/**
 * 다양한 root에서 폼 컨테이너를 찾는다 (DialogV2 element, jQuery wrapper, plain HTMLElement).
 * 최후 수단으로 document 전체에서 검색.
 */
export function findExportForm(rootEl: any): Element | null {
  const tryEl = (el: any) => el?.querySelector?.(".sch-customize-export-form") ?? null;
  return tryEl(rootEl)
    ?? tryEl(rootEl?.element)
    ?? tryEl(rootEl?.[0])
    ?? document.querySelector(".sch-customize-export-form");
}

/**
 * 모드 선택에 따라 기존 CSS 선택 섹션 표시/숨김 토글.
 */
export function attachExportFormHandlers(rootEl: any): void {
  const form = findExportForm(rootEl);
  if (!form) {
    console.warn("[sch-customize] export form not found in render");
    return;
  }
  const radios = form.querySelectorAll("input[name='sch-export-mode']");
  const section = form.querySelector(".sch-existing-css-section");
  const update = () => {
    const value = (form.querySelector("input[name='sch-export-mode']:checked") as HTMLInputElement | null)?.value;
    if (section) (section as HTMLElement).style.display = (value === "merge" || value === "full") ? "" : "none";
  };
  radios.forEach(r => r.addEventListener("change", update));
  update();
}

/**
 * 폼에서 모드 + 기존 CSS 텍스트 추출. 파일 미선택 시 existingCssText=null.
 */
export async function readExportFormValues(rootEl: any): Promise<{ mode: string; existingCssText: string | null } | null> {
  const form = findExportForm(rootEl);
  if (!form) {
    console.error("[sch-customize] export form not found at submit");
    return null;
  }
  const mode = (form.querySelector("input[name='sch-export-mode']:checked") as HTMLInputElement | null)?.value ?? "solo";
  const fileInput = form.querySelector("input[name='sch-existing-css']") as HTMLInputElement | null;
  const file = fileInput?.files?.[0] ?? null;
  let existingCssText: string | null = null;
  if (file && (mode === "merge" || mode === "full")) {
    try {
      existingCssText = await file.text();
    } catch (e) {
      console.warn("[sch-customize] 기존 CSS 읽기 실패:", e);
    }
  }
  return { mode, existingCssText };
}
