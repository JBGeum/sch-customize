/**
 * 잡담 / 일반 채팅 메시지 렌더 후처리.
 *
 * 동일 사용자의 연속 메시지를 top / middle / end 클래스로 묶어 시각적으로 그룹화한다.
 * 잡담(priv_talk)은 본 모듈이 만든 메시지이고, 일반 메시지는 모든 chat type에 대해 적용된다.
 *
 * Foundry v12: `renderChatMessage`(jQuery), v13+: `renderChatMessageHTML`(HTMLElement) 둘 다 호환.
 */

import { MODULE_ID } from "../constants";
import { toElement, getRenderChatMessageHook, isPrivTalkMessage } from "../compat/foundry";

// 모듈 내부에서 직전 메시지 정보를 추적하기 위한 상태.
// Foundry 렌더 hook은 동기적으로 메시지 순서대로 호출되므로 모듈 스코프 변수로 충분.
let lastPrivTalkMsg: HTMLElement | null = null;
let lastBaseMsg: { el: HTMLElement; msg: any } | null = null;
let privTalkIndex: number = 0;

/**
 * 외부에서 상태를 리셋해야 할 때(예: setup 후 새 세션 시작) 호출.
 */
export function resetRenderState() {
  lastPrivTalkMsg = null;
  lastBaseMsg = null;
  privTalkIndex = 0;
}

/**
 * 단일 chat message 렌더 후처리.
 */
export function onRenderChatMessage(message: ChatMessage, htmlOrEl: HTMLElement | JQuery /*, messageData */): void {
  const el = toElement(htmlOrEl);
  if (!el) return;

  const privTalkMergeEnabled = (game.settings as any).get(MODULE_ID, "privTalkMerge");
  const baseMessageMergeEnabled = (game.settings as any).get(MODULE_ID, "baseMessageMerge");
  const privFlag = isPrivTalkMessage(message);

  if (privFlag) {
    handlePrivTalkRender(el, message, privTalkMergeEnabled);
    return;
  }

  handleBaseMessageRender(el, message, baseMessageMergeEnabled);
}

function handlePrivTalkRender(el: HTMLElement, message: ChatMessage, mergeEnabled: boolean): void {
  el.classList.add("priv_talk");
  el.classList.add(`user-${(message as any).user?.id ?? (message as any).author?.id}`);

  if (mergeEnabled) {
    if (privTalkIndex > 0 && lastPrivTalkMsg) {
      const prevEl = lastPrivTalkMsg;
      if (prevEl.classList.contains("end")) {
        prevEl.classList.remove("end");
        prevEl.classList.add("middle");
        el.classList.add("end");
      } else {
        prevEl.classList.add("top");
        el.classList.add("end");
      }
    }
    lastPrivTalkMsg = el;
  }
  privTalkIndex++;

  // 헤더 숨김 + 본문 영역을 잡담 전용 마크업으로 교체
  const header = el.querySelector("header");
  if (header) header.style.display = "none";

  const content = el.querySelector(".message-content");
  if (content) {
    content.innerHTML =
      `<div class="pt priv_user">${message.speaker.alias}</div> <div class="pt">${message.content}</div>`;
  }

  if (!(game.settings as any).get(MODULE_ID, "privTalkSpeakerLineChange")) {
    el.classList.add("line-change");
  }
}

function handleBaseMessageRender(el: HTMLElement, message: ChatMessage, mergeEnabled: boolean): void {
  if (mergeEnabled && lastBaseMsg) {
    const lastMsgEl = lastBaseMsg.el;
    const lastMessage = lastBaseMsg.msg;
    const lastMsgPrivTalkFlag = privTalkIndex > 0;

    // v13+: .style, v12: .type — 어느 쪽이든 비교
    const lastStyle = lastMessage.style ?? lastMessage.type;
    const currStyle = (message as any).style ?? (message as any).type;
    const sameStyle = lastStyle === currStyle;

    // v13+: .author(객체 또는 id), v12: .user(객체 또는 id) — 어떤 형태든 같은 author인지만 판별
    const lastAuthor = lastMessage.author?.id ?? lastMessage.user?.id ?? lastMessage.author ?? lastMessage.user;
    const currAuthor = (message as any).author?.id ?? (message as any).user?.id ?? (message as any).author ?? (message as any).user;
    const sameAuthor = lastAuthor === currAuthor;

    // GM이 동일 유저로 NPC1 → NPC2 발화 전환 같은 경우, author는 같아도 발화 캐릭터가 다르므로
    // merge를 끊는다. actor/token이 비어 있는 OOC 메시지는 alias로 대체 비교.
    const speakerKey = (s: any): string => s?.actor ?? s?.token ?? s?.alias ?? "";
    const sameSpeaker = speakerKey(lastMessage.speaker) === speakerKey(message.speaker);

    if (sameAuthor && sameSpeaker && !lastMsgPrivTalkFlag && sameStyle) {
      if (lastMsgEl.classList.contains("end")) {
        lastMsgEl.classList.remove("end");
        lastMsgEl.classList.add("middle");
        el.classList.add("end");
      } else {
        lastMsgEl.classList.add("top");
        el.classList.add("end");
      }
    }
  }
  lastBaseMsg = { msg: message, el };
  privTalkIndex = 0;
}

/**
 * `init` hook 내에서 호출 — `game.release.generation`이 결정된 뒤 적절한 hook 이름을 고를 수 있다.
 */
export function registerChitchatRender() {
  (Hooks as any).on(getRenderChatMessageHook(), onRenderChatMessage);
}
