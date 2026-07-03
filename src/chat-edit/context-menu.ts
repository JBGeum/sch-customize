/**
 * 채팅 메시지 컨텍스트 메뉴에 "편집" 항목을 추가한다 (v13+ getChatMessageContextOptions).
 *
 * ApplicationV2 전환으로 항목의 condition/callback은 메시지 <li data-message-id>
 * HTMLElement를 받는다. li에서 messageId로 ChatMessage를 조회해,
 * 편집 가능(isEditableMessage) AND 권한(canUserModify)일 때만 항목을 노출한다.
 */
import { isEditableMessage } from "./predicate";
import { showEditMessageDialog } from "./dialog";

/** 메시지 <li>에서 대응 ChatMessage를 조회. 없으면 null. */
export function resolveMessageFromLi(li: HTMLElement): any | null {
  const id = li?.dataset?.messageId ?? "";
  return (game.messages as any)?.get(id) ?? null;
}

/** 컨텍스트 메뉴 "편집" 항목(ContextMenuEntry) 생성. */
export function buildEditContextEntry(): {
  name: string;
  icon: string;
  condition: (li: HTMLElement) => boolean;
  callback: (li: HTMLElement) => void;
} {
  return {
    name: game.i18n!.localize("sch-customize.edit.contextLabel"),
    icon: `<i class="fas fa-pen-to-square"></i>`,
    condition: (li: HTMLElement) => {
      const m = resolveMessageFromLi(li);
      return !!m && m.canUserModify(game.user, "update") && isEditableMessage(m, li);
    },
    callback: (li: HTMLElement) => {
      const m = resolveMessageFromLi(li);
      if (m) void showEditMessageDialog(m);
    },
  };
}

/** getChatMessageContextOptions hook에 "편집" 항목을 push. */
export function registerEditContextMenu(): void {
  (Hooks as any).on("getChatMessageContextOptions", (_app: any, menuItems: any[]) => {
    menuItems.push(buildEditContextEntry());
  });
}
