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

import { downloadArchiveFile, openChatArchive } from "./export.js";

/**
 * v13+ DialogV2 우선, 없으면 v12 Dialog V1로 폴백하는 confirm 다이얼로그.
 */
export async function showConfirmDialog({ title, content, confirmLabel, confirmIcon = "fas fa-check", onConfirm }) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) {
    try {
      const ok = await DialogV2.confirm({
        window: { title },
        content: `<p>${content}</p>`,
        yes: { label: confirmLabel, icon: confirmIcon },
        no:  { label: game.i18n.localize("chat-tailor.dialog.download.button.cancel") },
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
        label: game.i18n.localize("chat-tailor.dialog.download.button.cancel"),
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
  render(_force, _options) {
    showConfirmDialog({
      title: game.i18n.localize("chat-tailor.dialog.download.title"),
      content: game.i18n.localize("chat-tailor.dialog.download.content"),
      confirmLabel: game.i18n.localize("chat-tailor.dialog.download.button.download"),
      onConfirm: async () => {
        const chats = [...(game.messages.contents)];
        await downloadArchiveFile(chats);
      },
    });
  }
  getData() { return {}; }
  async _updateObject(_event, _formData) {}
}

export class openChatArchiveWindow extends FormApplication {
  render(_force, _options) {
    showConfirmDialog({
      title: game.i18n.localize("chat-tailor.dialog.open.title"),
      content: game.i18n.localize("chat-tailor.dialog.open.content"),
      confirmLabel: game.i18n.localize("chat-tailor.dialog.open.button.open"),
      onConfirm: async () => {
        const chats = [...(game.messages.contents)];
        await openChatArchive(chats);
      },
    });
  }
  getData() { return {}; }
  async _updateObject(_event, _formData) {}
}
