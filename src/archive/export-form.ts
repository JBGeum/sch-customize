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

import { MODULE_ID } from "../constants";
import { SETTINGS } from "../settings/keys";
import { isDirectoryPickerSupported } from "./dir-target";

/**
 * 누적/단독 export 모드 선택 다이얼로그 본문.
 *
 * <form>이 아닌 <div>로 감싼다 — DialogV2의 submit 버튼이 의도치 않게 form submit을 트리거할 가능성 제거.
 */
export function buildExportModeFormHtml(): string {
  const t = (key: string) => game.i18n!.localize(`sch-customize.dialog.export.${key}`);
  const gs = game.settings as any;
  const incChecked = gs.get(MODULE_ID, SETTINGS.includeWhisper) ? "checked" : "";
  const hideChecked = gs.get(MODULE_ID, SETTINGS.hideWhisper) ? "checked" : "";
  const row = (value: string, labelKey: string) => `
        <label class="sch-mode-row" style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;">
          <input type="radio" name="sch-export-mode" value="${value}"${value === "solo" ? " checked" : ""}>
          <strong>${t(labelKey)}</strong>
        </label>`;
  const desc = (value: string, inner: string) => `
        <div class="sch-mode-desc" data-mode="${value}" style="display:none;padding:0 0 0.3rem 1.5rem;word-break:keep-all;overflow-wrap:break-word;">${inner}</div>`;
  const directoryBlock = isDirectoryPickerSupported()
    ? row("directory", "mode.directory.label")
      + desc("directory", `<small style="opacity:0.85">${t("mode.directory.hint")}</small>`)
    : "";
  return `
    <div class="sch-customize-export-form" style="display:flex;flex-direction:column;gap:0.5rem;width:24rem;max-width:100%;box-sizing:border-box;">
      <fieldset style="display:flex;flex-direction:column;gap:0.2rem;padding:0.5rem;">
        <legend>${t("legend")}</legend>
        ${row("solo", "mode.solo.label")}
        ${desc("solo", `<small style="opacity:0.85">${t("mode.solo.hint")}</small>`)}
        ${directoryBlock}
        ${row("file-upload", "mode.file.label")}
        ${desc("file-upload", `
          <small style="opacity:0.85">${t("mode.file.hint")}</small>
          <label style="display:flex;flex-direction:column;gap:0.3rem;margin-top:0.4rem;">
            <span><strong>${t("existing.label")}</strong></span>
            <input type="file" name="sch-existing-css" accept=".css,text/css">
          </label>`)}
      </fieldset>
      <div class="sch-whisper-options" style="display:flex;flex-direction:column;gap:0.3rem;padding:0.4rem 0.6rem;">
        <label style="display:flex;align-items:center;gap:0.4rem;">
          <input type="checkbox" name="sch-include-whisper" ${incChecked}>
          <span>${t("includeWhisper.label")}</span>
        </label>
        <label style="display:flex;align-items:center;gap:0.4rem;">
          <input type="checkbox" name="sch-hide-whisper" ${hideChecked}>
          <span>${t("hideWhisper.label")}</span>
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
 * 아코디언: 선택한 모드의 설명(.sch-mode-desc[data-mode])만 표시, 나머지는 숨김.
 * (file-upload 설명 안에 기존 CSS 파일 input이 들어 있어 함께 노출/은닉된다.)
 */
export function attachExportFormHandlers(rootEl: any): void {
  const form = findExportForm(rootEl);
  if (!form) {
    console.warn("[sch-customize] export form not found in render");
    return;
  }
  const radios = form.querySelectorAll("input[name='sch-export-mode']");
  const descs = form.querySelectorAll(".sch-mode-desc");
  const update = () => {
    const value = (form.querySelector("input[name='sch-export-mode']:checked") as HTMLInputElement | null)?.value;
    descs.forEach(d => { (d as HTMLElement).style.display = (d as HTMLElement).dataset.mode === value ? "" : "none"; });
  };
  radios.forEach(r => r.addEventListener("change", update));
  update();
}

/**
 * 폼에서 모드 + 기존 CSS 텍스트 추출. 파일 미선택 시 existingCssText=null.
 */
export async function readExportFormValues(rootEl: any): Promise<{ mode: string; existingCssText: string | null; includeWhisper: boolean; hideWhisper: boolean } | null> {
  const form = findExportForm(rootEl);
  if (!form) {
    console.error("[sch-customize] export form not found at submit");
    return null;
  }
  const mode = (form.querySelector("input[name='sch-export-mode']:checked") as HTMLInputElement | null)?.value ?? "solo";
  const fileInput = form.querySelector("input[name='sch-existing-css']") as HTMLInputElement | null;
  const file = fileInput?.files?.[0] ?? null;
  let existingCssText: string | null = null;
  if (file && mode === "file-upload") {
    try {
      existingCssText = await file.text();
    } catch (e) {
      console.warn("[sch-customize] 기존 CSS 읽기 실패:", e);
    }
  }
  const includeWhisper = !!(form.querySelector("input[name='sch-include-whisper']") as HTMLInputElement | null)?.checked;
  const hideWhisper = !!(form.querySelector("input[name='sch-hide-whisper']") as HTMLInputElement | null)?.checked;
  return { mode, existingCssText, includeWhisper, hideWhisper };
}
