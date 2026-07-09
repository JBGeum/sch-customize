/**
 * 채팅 control-buttons에 "새 창에서 채팅로그 열기" 버튼을 첫 자식으로 추가한다.
 * 클릭 시 기존 openChatArchive(현재 채팅 로그를 새 창에 표시)를 호출.
 */
import { mountOnChatUi } from "./compat/chat-input-mount";
import { openChatArchive } from "./archive/export";

const BUTTON_CLASS = "sch-open-log";

export function findControlButtons(root: Element | Document): Element | null {
  return (root as Element).querySelector?.(".control-buttons")
    ?? document.querySelector(".control-buttons");
}

/** control-buttons의 첫 자식으로 버튼을 (재)삽입. 멱등. */
export function placeOpenLogButton(controlButtons: Element): void {
  controlButtons.querySelector(`.${BUTTON_CLASS}`)?.remove();

  const button = document.createElement("button");
  button.type = "button";
  button.className = `${BUTTON_CLASS} ui-control icon fa-solid fa-arrow-up-right-from-square`;
  const label = game.i18n!.localize("sch-customize.chat.openLog.title");
  button.setAttribute("aria-label", label);
  button.setAttribute("data-tooltip", label);
  button.addEventListener("click", () => {
    openChatArchive([...game.messages!.contents]);
  });

  controlButtons.prepend(button);
}

export function registerOpenLogButton(): void {
  mountOnChatUi(
    findControlButtons,
    placeOpenLogButton,
    () => !!document.querySelector(`.${BUTTON_CLASS}`),
  );
}
