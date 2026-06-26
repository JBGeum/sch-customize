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
export function isV13Plus(): boolean {
  return (game?.release?.generation ?? 0) >= 13;
}

/**
 * 메시지 렌더 hook 이름 (v13+: HTMLElement / v12: jQuery).
 * @returns {"renderChatMessageHTML"|"renderChatMessage"}
 */
export function getRenderChatMessageHook(): "renderChatMessageHTML" | "renderChatMessage" {
  return isV13Plus() ? "renderChatMessageHTML" : "renderChatMessage";
}

/**
 * v12의 jQuery 래퍼와 v13+의 HTMLElement를 모두 받아 항상 HTMLElement로 통일한다.
 * @param {HTMLElement|JQuery|null|undefined} htmlOrEl
 * @returns {HTMLElement|null}
 */
export function toElement(htmlOrEl: HTMLElement | JQuery | null | undefined): HTMLElement | null {
  if (!htmlOrEl) return null;
  if (htmlOrEl instanceof HTMLElement) return htmlOrEl;
  return (htmlOrEl as unknown as { [0]?: HTMLElement })[0] ?? null;
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
export async function renderChatMessageElement(chat: ChatMessage): Promise<HTMLElement | null> {
  if (typeof (chat as any).renderHTML === "function") {
    return await (chat as any).renderHTML();
  }
  const $html = await (chat as any).getHTML();
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
export function isPrivTalkMessage(message: ChatMessage): boolean {
  const flags = message.flags as Record<string, Record<string, unknown> | undefined> | undefined;
  return !!(
    flags?.["chat-tailor"]?.["priv_talk"]
    || flags?.["sch-customize"]?.["priv_talk"]
    || flags?.["priv_talk"]
  );
}

/**
 * 임시 렌더된 메시지에 대해 다른 모듈의 렌더 후처리 hook을 호출.
 *
 * Foundry 코어의 `renderChatMessage(HTML)` 훅이 외부 모듈에 전달하는 세 번째 인자는
 * *render context wrapper 객체*이지 `chat.toObject()` 그 자체가 아니다. 표준 구조는:
 *
 *   { message: serialized, user, author, alias, cssClass, isWhisper, whisperTo, ... }
 *
 * 일부 모듈(예: CGMP)이 `messageData.message.flags`를 읽으므로, 최소한 `message`
 * 키는 반드시 채워야 한다. 이 함수가 누락된 표준 키를 자동으로 채워준다.
 *
 * @param {ChatMessage} chat
 * @param {HTMLElement} element - 렌더된 메시지 HTMLElement
 * @param {object} [overrides] - render context에 덮어쓸 추가 키
 */
export function callRenderChatMessageHooks(chat: ChatMessage, element: HTMLElement, overrides: Record<string, unknown> = {}): void {
  const whisperIds: string[] = (chat as any).whisper ?? [];
  const messageData = {
    message: chat.toObject(false),
    user: game.user,
    author: chat.author,
    alias: chat.alias,
    cssClass: typeof (chat as any).getCSSClasses === "function"
      ? (chat as any).getCSSClasses().join(" ")
      : "",
    isWhisper: whisperIds.length > 0,
    whisperTo: whisperIds
      .map((id: string) => game.users?.get(id)?.name)
      .filter(Boolean)
      .join(", "),
    ...overrides,
  };

  if (isV13Plus()) {
    (Hooks as any).callAll("renderChatMessageHTML", chat, element, messageData);
  } else {
    const jq = (window as any).jQuery;
    const wrapper = jq ? jq(element) : element;
    (Hooks as any).callAll("renderChatMessage", chat, wrapper, messageData);
  }
}
