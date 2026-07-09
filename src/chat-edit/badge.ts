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
import { MODULE_ID } from "../constants";
import { SETTINGS } from "../settings/keys";

export const EDITED_BADGE_CLASS = "sch-edited-badge";

/** el의 .message-content(없으면 el)의 마지막 텍스트 블록 끝에 아이콘 배지를 멱등 추가. */
export function injectEditedBadge(el: HTMLElement, label: string): void {
  if (el.querySelector(`.${EDITED_BADGE_CLASS}`)) return;
  const icon = document.createElement("i");
  icon.className = `fas fa-pen ${EDITED_BADGE_CLASS}`;
  icon.setAttribute("title", label);
  icon.setAttribute("aria-label", label);
  // 마지막 텍스트 줄 끝에 인라인으로 붙이려면, 마지막 블록(<p>/<div>) 안으로 계속 내려가
  // 실제 텍스트를 담은 가장 안쪽 블록에 append한다. (블록 뒤 형제로 붙으면 줄바꿈이 생긴다 —
  // v14는 .message-content > wrapper div > <p> 처럼 중첩될 수 있어 한 단계 진입으론 부족.)
  let target = (el.querySelector(".message-content") ?? el) as HTMLElement;
  let last = target.lastElementChild as HTMLElement | null;
  while (last && (last.tagName === "P" || last.tagName === "DIV")) {
    target = last;
    last = target.lastElementChild as HTMLElement | null;
  }
  target.appendChild(icon);
}

/** renderChatMessageHTML hook 핸들러: edited 메시지에만 배지 주입. */
export function onRenderEditedBadge(message: any, htmlOrEl: HTMLElement | JQuery): void {
  const el = toElement(htmlOrEl);
  if (!el) return;
  if (!isEditedMessage(message)) return;
  if (!(game.settings as any).get(MODULE_ID, SETTINGS.showEditedBadge)) return;
  injectEditedBadge(el, game.i18n!.localize("sch-customize.edit.editedBadge"));
}

/** renderChatMessageHTML hook에 배지 핸들러 등록. */
export function registerEditedBadge(): void {
  (Hooks as any).on("renderChatMessageHTML", onRenderEditedBadge);
}
