/**
 * Chat archive 다이얼로그.
 *
 * `game.settings.registerMenu`는 클래스 형태의 `type`을 요구한다.
 * Foundry는 버튼 클릭 시 `new Type()` → `.render(true)` 순으로 호출하므로,
 * `render()`를 override해 DialogV2(v13+) 또는 Dialog V1(v12 폴백)을 띄운 뒤
 * super.render()를 호출하지 않는다 — FormApplication에 template이 없으므로
 * super.render()를 호출하면 null.startsWith 오류가 발생한다.
 *
 * NOTE: `FormApplication` 자체는 v15에서 제거될 예정. settings.registerMenu가
 * ApplicationV2 형태로 바뀌면 이 래퍼도 함께 갱신해야 한다.
 */

import { downloadArchiveFile, downloadIncrementalArchive, openChatArchive } from "./export";

/**
 * v13+ DialogV2 우선, 없으면 v12 Dialog V1로 폴백하는 confirm 다이얼로그.
 */
export async function showConfirmDialog({ title, content, confirmLabel, confirmIcon = "fas fa-check", onConfirm }: {
  title: string;
  content: string;
  confirmLabel: string;
  confirmIcon?: string;
  onConfirm: () => Promise<void>;
}): Promise<void> {
  const DialogV2 = (foundry as any).applications?.api?.DialogV2;
  if (DialogV2) {
    try {
      const ok = await DialogV2.confirm({
        window: { title },
        content: `<p>${content}</p>`,
        yes: { label: confirmLabel, icon: confirmIcon },
        no:  { label: game.i18n!.localize("chat-tailor.dialog.download.button.cancel") },
      });
      if (ok) await onConfirm();
    } catch (_e) {
      // 사용자가 창을 닫음 등 — 조용히 무시
    }
    return;
  }

  // v12 폴백
  new Dialog({
    title,
    content,
    buttons: {
      confirm: {
        icon: `<i class="${confirmIcon}"></i>`,
        label: confirmLabel,
        callback: async () => { await onConfirm(); },
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n!.localize("chat-tailor.dialog.download.button.cancel"),
      },
    },
    default: "cancel",
  }).render(true);
}

/**
 * settings.registerMenu의 type 인자용 래퍼.
 * Foundry가 `.render(true)`를 호출하면 showConfirmDialog()를 실행하고
 * FormApplication 자체는 렌더하지 않는다.
 */
export class DownloadChatArchive extends FormApplication {
  override render(_force?: boolean, _options?: any): this {
    showConfirmDialog({
      title: game.i18n!.localize("chat-tailor.dialog.download.title"),
      content: game.i18n!.localize("chat-tailor.dialog.download.content"),
      confirmLabel: game.i18n!.localize("chat-tailor.dialog.download.button.download"),
      onConfirm: async () => {
        try {
          const chats = [...(game.messages!.contents)];
          await downloadArchiveFile(chats);
        } catch (error) {
          console.error("[chat-tailor] Failed to download chat archive:", error);
          ui.notifications?.error(
            game.i18n!.localize("chat-tailor.dialog.download.error") || "Failed to download chat archive."
          );
        }
      },
    });
    return this;
  }
  override getData(_options?: Partial<FormApplication.Options>): object { return {}; }
  protected override async _updateObject(_event: Event, _formData?: object): Promise<void> {}
}

export class openChatArchiveWindow extends FormApplication {
  override render(_force?: boolean, _options?: any): this {
    showConfirmDialog({
      title: game.i18n!.localize("chat-tailor.dialog.open.title"),
      content: game.i18n!.localize("chat-tailor.dialog.open.content"),
      confirmLabel: game.i18n!.localize("chat-tailor.dialog.open.button.open"),
      onConfirm: async () => {
        const chats = [...(game.messages!.contents)];
        await openChatArchive(chats);
      },
    });
    return this;
  }
  override getData(_options?: Partial<FormApplication.Options>): object { return {}; }
  protected override async _updateObject(_event: Event, _formData?: object): Promise<void> {}
}

/**
 * 누적/단독 export 모드 선택 다이얼로그 본문.
 *
 * <form>이 아닌 <div>로 감싼다 — DialogV2의 submit 버튼이 의도치 않게 form submit을 트리거할 가능성 제거.
 */
function buildExportModeFormHtml(): string {
  const t = (key: string) => game.i18n!.localize(`chat-tailor.dialog.export.${key}`);
  return `
    <div class="chat-tailor-export-form" style="display:flex;flex-direction:column;gap:0.6rem;">
      <fieldset style="display:flex;flex-direction:column;gap:0.4rem;padding:0.5rem;">
        <legend>${t("legend")}</legend>
        <label style="display:flex;align-items:flex-start;gap:0.4rem;">
          <input type="radio" name="ct-export-mode" value="solo" checked>
          <span><strong>${t("mode.solo.label")}</strong><br>
            <small style="opacity:0.8">${t("mode.solo.hint")}</small>
          </span>
        </label>
        <label style="display:flex;align-items:flex-start;gap:0.4rem;">
          <input type="radio" name="ct-export-mode" value="merge">
          <span><strong>${t("mode.merge.label")}</strong><br>
            <small style="opacity:0.8">${t("mode.merge.hint")}</small>
          </span>
        </label>
        <label style="display:flex;align-items:flex-start;gap:0.4rem;">
          <input type="radio" name="ct-export-mode" value="full">
          <span><strong>${t("mode.full.label")}</strong><br>
            <small style="opacity:0.8">${t("mode.full.hint")}</small>
          </span>
        </label>
      </fieldset>
      <div class="ct-existing-css-section" style="display:none;padding:0.4rem 0.6rem;border-top:1px dashed rgba(0,0,0,0.2);">
        <label style="display:flex;flex-direction:column;gap:0.3rem;">
          <span><strong>${t("existing.label")}</strong></span>
          <input type="file" name="ct-existing-css" accept=".css,text/css">
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
function findExportForm(rootEl: any): Element | null {
  const tryEl = (el: any) => el?.querySelector?.(".chat-tailor-export-form") ?? null;
  return tryEl(rootEl)
    ?? tryEl(rootEl?.element)
    ?? tryEl(rootEl?.[0])
    ?? document.querySelector(".chat-tailor-export-form");
}

/**
 * 모드 선택에 따라 기존 CSS 선택 섹션 표시/숨김 토글.
 */
function attachExportFormHandlers(rootEl: any): void {
  const form = findExportForm(rootEl);
  if (!form) {
    console.warn("[chat-tailor] export form not found in render");
    return;
  }
  const radios = form.querySelectorAll("input[name='ct-export-mode']");
  const section = form.querySelector(".ct-existing-css-section");
  const update = () => {
    const value = (form.querySelector("input[name='ct-export-mode']:checked") as HTMLInputElement | null)?.value;
    if (section) (section as HTMLElement).style.display = (value === "merge" || value === "full") ? "" : "none";
  };
  radios.forEach(r => r.addEventListener("change", update));
  update();
}

/**
 * 폼에서 모드 + 기존 CSS 텍스트 추출. 파일 미선택 시 existingCssText=null.
 */
async function readExportFormValues(rootEl: any): Promise<{ mode: string; existingCssText: string | null } | null> {
  const form = findExportForm(rootEl);
  if (!form) {
    console.error("[chat-tailor] export form not found at submit");
    return null;
  }
  const mode = (form.querySelector("input[name='ct-export-mode']:checked") as HTMLInputElement | null)?.value ?? "solo";
  const fileInput = form.querySelector("input[name='ct-existing-css']") as HTMLInputElement | null;
  const file = fileInput?.files?.[0] ?? null;
  let existingCssText: string | null = null;
  if (file && (mode === "merge" || mode === "full")) {
    try {
      existingCssText = await file.text();
    } catch (e) {
      console.warn("[chat-tailor] 기존 CSS 읽기 실패:", e);
    }
  }
  return { mode, existingCssText };
}

/**
 * 선택된 모드에 따라 적절한 export 함수로 dispatch.
 */
async function dispatchExport({ mode, existingCssText }: { mode: string; existingCssText: string | null }): Promise<void> {
  const chats = [...(game.messages!.contents)];
  try {
    if (mode === "solo") {
      await downloadArchiveFile(chats);
    } else {
      await downloadIncrementalArchive(chats, {
        mode: mode === "full" ? "full" : "filtered",
        existingCssText,
      });
    }
  } catch (error) {
    console.error("[chat-tailor] Failed to export chat archive:", error);
    ui.notifications?.error(
      game.i18n!.localize("chat-tailor.dialog.export.error") || "Failed to export chat archive."
    );
  }
}

/**
 * v13+ DialogV2 우선, v12 Dialog V1 폴백.
 *
 * 누적 export 모드 선택 다이얼로그. 라디오 + 파일 input UI를 표시하고, 확인 시
 * `dispatchExport()`를 호출한다.
 *
 * 구현 메모:
 *  - DialogV2.wait의 `render` 콜백 시그니처는 `(app, html)` (renderDialogV2 Hook과 동일).
 *  - 버튼 callback의 시그니처는 `(event, button, dialog)`.
 *  - 렌더된 폼 element를 closure 변수에 저장해 두면 dialog.element 의존 없이 안정적으로 접근 가능.
 *  - `default`는 dialog 옵션 top-level의 action 이름이며, 버튼 객체에 `default: true`를 두지 않는다.
 */
async function showExportModeDialog(): Promise<void> {
  const title = game.i18n!.localize("chat-tailor.dialog.export.title");
  const contentHtml = buildExportModeFormHtml();
  const confirmLabel = game.i18n!.localize("chat-tailor.dialog.download.button.download");
  const cancelLabel = game.i18n!.localize("chat-tailor.dialog.download.button.cancel");

  // 렌더된 dialog의 root element를 closure로 보관 — 콜백 시점에 안정적으로 접근하기 위함
  let dialogRoot: any = null;

  const DialogV2 = (foundry as any).applications?.api?.DialogV2;
  if (DialogV2) {
    try {
      const result = await DialogV2.wait({
        window: { title },
        content: contentHtml,
        rejectClose: false,
        default: "confirm",
        buttons: [
          {
            action: "confirm",
            label: confirmLabel,
            icon: "fas fa-download",
            callback: async (_event: any, _button: any, dialog: any) => {
              const root = dialogRoot ?? dialog?.element ?? document;
              return await readExportFormValues(root);
            },
          },
          { action: "cancel", label: cancelLabel, icon: "fas fa-times" },
        ],
        // render hook 시그니처: (app, html). html은 HTMLElement.
        render: (_app: any, html: any) => {
          // html이 HTMLElement인 경우와 jQuery wrapper인 경우 모두 대응
          const root = html instanceof HTMLElement
            ? html
            : (html?.[0] ?? html?.element ?? html);
          dialogRoot = root ?? null;
          attachExportFormHandlers(root);
        },
      });
      if (result && typeof result === "object" && result.mode) {
        await dispatchExport(result);
      }
    } catch (e) {
      console.warn("[chat-tailor] export dialog 취소/오류:", e);
    }
    return;
  }

  // v12 폴백 — Dialog V1
  new Dialog({
    title,
    content: contentHtml,
    buttons: {
      confirm: {
        icon: '<i class="fas fa-download"></i>',
        label: confirmLabel,
        callback: async (html: any) => {
          const root = html?.[0] ?? html ?? dialogRoot;
          const values = await readExportFormValues(root);
          if (values) await dispatchExport(values);
        },
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: cancelLabel,
      },
    },
    default: "confirm",
    render: (html: any) => {
      const root = html?.[0] ?? html;
      dialogRoot = root ?? null;
      attachExportFormHandlers(root);
    },
  }).render(true);
}

/**
 * 모드 선택 다이얼로그를 띄우는 settings.registerMenu용 래퍼.
 */
export class ExportChatArchiveMenu extends FormApplication {
  override render(_force?: boolean, _options?: any): this {
    showExportModeDialog();
    return this;
  }
  override getData(_options?: Partial<FormApplication.Options>): object { return {}; }
  protected override async _updateObject(_event: Event, _formData?: object): Promise<void> {}
}
