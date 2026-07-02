/**
 * Chat archive 다이얼로그.
 *
 * `game.settings.registerMenu`는 클래스 형태의 `type`을 요구한다.
 * Foundry는 버튼 클릭 시 `new Type()` → `.render(true)` 순으로 호출하므로,
 * `render()`를 override해 DialogV2(v13+)를 띄운 뒤
 * super.render()를 호출하지 않는다 — FormApplication에 template이 없으므로
 * super.render()를 호출하면 null.startsWith 오류가 발생한다.
 *
 * NOTE: `FormApplication` 자체는 v15에서 제거될 예정. settings.registerMenu가
 * ApplicationV2 형태로 바뀌면 이 래퍼도 함께 갱신해야 한다.
 */

import { downloadArchiveFile, downloadIncrementalArchive, openChatArchive, exportIncrementalToDirectory } from "./export";
import { buildExportModeFormHtml, attachExportFormHandlers, readExportFormValues } from "./export-form";

/**
 * v13+ DialogV2 confirm 다이얼로그.
 */
export async function showConfirmDialog({ title, content, confirmLabel, confirmIcon = "fas fa-check", onConfirm }: {
  title: string;
  content: string;
  confirmLabel: string;
  confirmIcon?: string;
  onConfirm: () => Promise<void>;
}): Promise<void> {
  const DialogV2 = (foundry as any).applications.api.DialogV2;
  let ok = false;
  try {
    ok = await DialogV2.confirm({
      window: { title },
      content: `<p>${content}</p>`,
      yes: { label: confirmLabel, icon: confirmIcon },
      no:  { label: game.i18n!.localize("sch-customize.dialog.download.button.cancel") },
    });
  } catch (_e) {
    // 사용자가 창을 닫음/취소 — 조용히 무시
    return;
  }
  if (ok) await onConfirm();
}

export class openChatArchiveWindow extends FormApplication {
  override render(_force?: boolean, _options?: any): this {
    showConfirmDialog({
      title: game.i18n!.localize("sch-customize.dialog.open.title"),
      content: game.i18n!.localize("sch-customize.dialog.open.content"),
      confirmLabel: game.i18n!.localize("sch-customize.dialog.open.button.open"),
      onConfirm: async () => {
        try {
          const chats = [...(game.messages!.contents)];
          await openChatArchive(chats);
        } catch (error) {
          console.error("[sch-customize] Failed to open chat archive:", error);
          ui.notifications?.error(game.i18n!.localize("sch-customize.dialog.open.error"));
        }
      },
    });
    return this;
  }
  override getData(_options?: Partial<FormApplication.Options>): object { return {}; }
  protected override async _updateObject(_event: Event, _formData?: object): Promise<void> {}
}

/**
 * 선택된 모드에 따라 적절한 export 함수로 dispatch.
 */
async function dispatchExport({ mode, existingCssText, includeWhisper, hideWhisper }: { mode: string; existingCssText: string | null; includeWhisper: boolean; hideWhisper: boolean }): Promise<void> {
  const chats = [...(game.messages!.contents)];
  try {
    if (mode === "solo") {
      await downloadArchiveFile(chats, { includeWhisper, hideWhisper });
    } else if (mode === "directory") {
      await exportIncrementalToDirectory(chats, { includeWhisper, hideWhisper });
    } else {
      // file-upload: 기존 css 올리면 누적, 없으면 fresh. zip 다운로드.
      await downloadIncrementalArchive(chats, { existingCssText, includeWhisper, hideWhisper });
    }
  } catch (error) {
    console.error("[sch-customize] Failed to export chat archive:", error);
    ui.notifications?.error(game.i18n!.localize("sch-customize.dialog.export.error"));
  }
}

/**
 * v13+ DialogV2 기반 누적 export 모드 선택 다이얼로그.
 *
 * 라디오 + 파일 input UI를 표시하고, 확인 시 `dispatchExport()`를 호출한다.
 *
 * 구현 메모:
 *  - DialogV2.wait의 `render` 콜백 시그니처는 `(app, html)` (renderDialogV2 Hook과 동일).
 *  - 버튼 callback의 시그니처는 `(event, button, dialog)`.
 *  - 렌더된 폼 element를 closure 변수에 저장해 두면 dialog.element 의존 없이 안정적으로 접근 가능.
 *  - `default`는 dialog 옵션 top-level의 action 이름이며, 버튼 객체에 `default: true`를 두지 않는다.
 */
async function showExportModeDialog(): Promise<void> {
  const title = game.i18n!.localize("sch-customize.dialog.export.title");
  const contentHtml = buildExportModeFormHtml();
  const confirmLabel = game.i18n!.localize("sch-customize.dialog.download.button.download");
  const cancelLabel = game.i18n!.localize("sch-customize.dialog.download.button.cancel");

  // 렌더된 dialog의 root element를 closure로 보관 — 콜백 시점에 안정적으로 접근하기 위함
  let dialogRoot: any = null;

  const DialogV2 = (foundry as any).applications.api.DialogV2;
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
    console.warn("[sch-customize] export dialog 취소/오류:", e);
  }
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
