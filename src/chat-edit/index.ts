/**
 * 채팅 메시지 편집 기능 등록 진입점.
 *  - 컨텍스트 메뉴 "편집" 항목(getChatMessageContextOptions)
 *  - "(수정됨)" 배지(renderChatMessageHTML)
 */
import { registerEditContextMenu } from "./context-menu";
import { registerEditedBadge } from "./badge";

export function registerChatEdit(): void {
  registerEditContextMenu();
  registerEditedBadge();
}
