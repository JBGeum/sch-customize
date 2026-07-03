/**
 * 채팅 메시지 편집 대상/상태 판별 (순수).
 *
 * - 편집 대상: 굴림 없음 AND 시스템 카드 아님(텍스트 위주).
 *   굴림은 문서(message.rolls)로, 카드는 렌더 DOM(.chat-card/.dice-roll)으로 판별한다.
 * - 편집 여부: flags[MODULE_ID].edited.
 */
import { MODULE_ID } from "../constants";

/** 메시지에 굴림(dice roll)이 하나라도 있으면 true. */
export function messageHasRoll(message: any): boolean {
  return (message?.rolls?.length ?? 0) > 0;
}

/** 렌더된 메시지 요소의 .message-content 안에 시스템 카드/굴림 표가 있으면 true. */
export function elementHasCard(el: HTMLElement): boolean {
  return !!el.querySelector(".message-content .chat-card, .message-content .dice-roll");
}

/** 텍스트 위주라 편집 대상인지: 굴림 없고 카드 없음. 애매하면 편집 불가로 판단. */
export function isEditableMessage(message: any, li: HTMLElement): boolean {
  return !messageHasRoll(message) && !elementHasCard(li);
}

/** 이 모듈이 편집한 흔적(flags[MODULE_ID].edited)이 있으면 true. */
export function isEditedMessage(message: any): boolean {
  return !!message?.flags?.[MODULE_ID]?.edited;
}
