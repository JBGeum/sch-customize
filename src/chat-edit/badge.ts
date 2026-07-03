/**
 * 편집된 메시지에 "(수정됨)" 배지를 주입한다 (renderChatMessageHTML hook).
 *
 * 배치는 .message-content 하단 — 잡담 그룹화가 그룹 하위 메시지의 헤더(타임스탬프)를
 * 숨기므로, 헤더에 붙이면 안 보인다. content 하단은 항상 표시된다.
 * 재렌더마다 hook이 다시 불리므로 멱등하게(중복 방지) 주입한다.
 *
 * 잡담 render(chitchat/render.ts)는 init에 먼저 등록돼 .message-content innerHTML을
 * 교체한 뒤 이 badge hook(setup 등록)이 뒤이어 append하므로, 그룹화 후에도 배지가 남는다.
 */
import { isEditedMessage } from "./predicate";
import { toElement } from "../compat/foundry";

export const EDITED_BADGE_CLASS = "sch-edited-badge";

/** el의 .message-content(없으면 el) 끝에 배지 span을 멱등 추가. */
export function injectEditedBadge(el: HTMLElement, label: string): void {
  if (el.querySelector(`.${EDITED_BADGE_CLASS}`)) return;
  const badge = document.createElement("span");
  badge.className = EDITED_BADGE_CLASS;
  badge.textContent = label;
  (el.querySelector(".message-content") ?? el).appendChild(badge);
}

/** renderChatMessageHTML hook 핸들러: edited 메시지에만 배지 주입. */
export function onRenderEditedBadge(message: any, htmlOrEl: HTMLElement | JQuery): void {
  const el = toElement(htmlOrEl);
  if (!el) return;
  if (!isEditedMessage(message)) return;
  injectEditedBadge(el, game.i18n!.localize("sch-customize.edit.editedBadge"));
}

/** renderChatMessageHTML hook에 배지 핸들러 등록. */
export function registerEditedBadge(): void {
  (Hooks as any).on("renderChatMessageHTML", onRenderEditedBadge);
}
