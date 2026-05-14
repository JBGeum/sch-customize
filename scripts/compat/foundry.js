/**
 * Foundry VTT 버전(v12/v13/v14) 호환 헬퍼 모음.
 *
 * 한 곳에 모아두는 이유:
 *  - 훅 이름(`renderChatMessage` ↔ `renderChatMessageHTML`),
 *  - 인자 타입(jQuery ↔ HTMLElement),
 *  - 상수(`CHAT_MESSAGE_TYPES` ↔ `CHAT_MESSAGE_STYLES`),
 *  - 렌더 API(`getHTML` ↔ `renderHTML`)
 * 처럼 같은 분기가 여러 파일에서 중복되기 쉬워, 이 파일로만 일원화한다.
 */

/**
 * 현재 Foundry 코어가 v13 이상인지 여부.
 * @returns {boolean}
 */
export function isV13Plus() {
  return (game?.release?.generation ?? 0) >= 13;
}

/**
 * 메시지 렌더 hook 이름 (v13+: HTMLElement / v12: jQuery).
 * @returns {"renderChatMessageHTML"|"renderChatMessage"}
 */
export function getRenderChatMessageHook() {
  return isV13Plus() ? "renderChatMessageHTML" : "renderChatMessage";
}

/**
 * v12의 jQuery 래퍼와 v13+의 HTMLElement를 모두 받아 항상 HTMLElement로 통일한다.
 * @param {HTMLElement|JQuery|null|undefined} htmlOrEl
 * @returns {HTMLElement|null}
 */
export function toElement(htmlOrEl) {
  if (!htmlOrEl) return null;
  if (htmlOrEl instanceof HTMLElement) return htmlOrEl;
  return htmlOrEl[0] ?? null;
}

/**
 * v12: `CONST.CHAT_MESSAGE_TYPES`, v13+: `CONST.CHAT_MESSAGE_STYLES`
 * 둘 중 사용 가능한 것을 반환한다. 두 객체의 키(OOC/OTHER/IC/EMOTE)는 동일.
 */
export function getChatStyles() {
  return CONST.CHAT_MESSAGE_STYLES ?? CONST.CHAT_MESSAGE_TYPES;
}

/**
 * `ChatMessage`를 임시 렌더해 HTMLElement로 반환.
 * v13+: `renderHTML()` 사용, v12: 폴백으로 `getHTML()` 사용.
 * @param {ChatMessage} chat
 * @returns {Promise<HTMLElement|null>}
 */
export async function renderChatMessageElement(chat) {
  if (typeof chat.renderHTML === "function") {
    return await chat.renderHTML();
  }
  const $html = await chat.getHTML();
  return $html?.[0] ?? null;
}

/**
 * ChatMessage가 잡담(priv_talk)인지 판별한다.
 *
 * 모듈 ID가 'sch-customize' → 'chat-tailor'로 변경되었으므로,
 * 이전에 기록된 메시지에는 구 네임스페이스 flag가 남아 있을 수 있다.
 * 아래 세 경로를 모두 확인해 어느 버전의 메시지라도 인식되도록 한다:
 *   1. flags['chat-tailor']['priv_talk']   — 현재 버전
 *   2. flags['sch-customize']['priv_talk'] — 모듈 ID 변경 전 구버전
 *   3. flags['priv_talk']                  — 네임스페이스 없는 최초 레거시
 *
 * @param {ChatMessage} message
 * @returns {boolean}
 */
export function isPrivTalkMessage(message) {
  return !!(
    message.flags?.["chat-tailor"]?.priv_talk
    || message.flags?.["sch-customize"]?.priv_talk
    || message.flags?.priv_talk
  );
}

/**
 * 임시 렌더된 메시지에 대해 다른 모듈의 렌더 후처리 hook을 호출.
 * v13+에서는 `renderChatMessageHTML`을, v12에서는 `renderChatMessage`(jQuery)를 호출한다.
 * @param {ChatMessage} chat
 * @param {HTMLElement} element
 * @param {object} data
 */
export function callRenderChatMessageHooks(chat, element, data) {
  if (isV13Plus()) {
    Hooks.callAll("renderChatMessageHTML", chat, element, data);
  } else {
    const wrapper = window.jQuery ? window.jQuery(element) : element;
    Hooks.callAll("renderChatMessage", chat, wrapper, data);
  }
}
