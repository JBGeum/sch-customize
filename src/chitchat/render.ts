/**
 * 잡담 / 일반 채팅 메시지 렌더 후처리.
 *
 * 연속 메시지를 top / middle / end 클래스로 묶어 시각적으로 그룹화한다.
 * - 일반(base) 메시지: author·speaker·style·whisper 수신자가 모두 같을 때만 그룹화
 *   (공개+귓속, 수신자 다른 귓속말은 분리 — header 의 수신자정보가 가려지는 miss 방지).
 * - 잡담(priv_talk): 본 모듈이 만든 메시지로, 유저 무관하게 연속이면 그룹화(의도).
 *   각 메시지는 user 배경색으로 구별되고 header 는 항상 숨김 + alias 를 inline 표시한다.
 * 그룹화 판정은 순수 모듈 `./grouping` 에 위임하고, 여기서는 DOM 적용만 한다.
 *
 * Foundry v12: `renderChatMessage`(jQuery), v13+: `renderChatMessageHTML`(HTMLElement) 둘 다 호환.
 */

import { MODULE_ID } from "../constants";
import { toElement, getRenderChatMessageHook, isPrivTalkMessage } from "../compat/foundry";
import { SETTINGS } from "../settings/keys";
import { shouldMergeBaseMessage, decideRounding, resolveAuthorId, type RoundingDecision } from "./grouping";

// 모듈 내부에서 직전 메시지 정보를 추적하기 위한 상태.
// Foundry 렌더 hook은 동기적으로 메시지 순서대로 호출되므로 모듈 스코프 변수로 충분.
interface RenderState {
  lastPrivTalkMsg: HTMLElement | null;
  lastBaseMsg: { el: HTMLElement; msg: any } | null;
  privTalkIndex: number;
}
const state: RenderState = { lastPrivTalkMsg: null, lastBaseMsg: null, privTalkIndex: 0 };

/**
 * 외부에서 상태를 리셋해야 할 때(예: setup 후 새 세션 시작) 호출.
 */
export function resetRenderState() {
  state.lastPrivTalkMsg = null;
  state.lastBaseMsg = null;
  state.privTalkIndex = 0;
}

/** 라운딩 결정을 prev/curr 엘리먼트에 적용. */
function applyRounding(prevEl: HTMLElement, currEl: HTMLElement, d: RoundingDecision): void {
  d.prevRemove.forEach((c) => prevEl.classList.remove(c));
  d.prevAdd.forEach((c) => prevEl.classList.add(c));
  d.currAdd.forEach((c) => currEl.classList.add(c));
}

/**
 * 단일 chat message 렌더 후처리.
 */
export function onRenderChatMessage(message: ChatMessage, htmlOrEl: HTMLElement | JQuery /*, messageData */): void {
  const el = toElement(htmlOrEl);
  if (!el) return;

  const privTalkMergeEnabled = (game.settings as any).get(MODULE_ID, SETTINGS.privTalkMerge);
  const baseMessageMergeEnabled = (game.settings as any).get(MODULE_ID, SETTINGS.baseMessageMerge);

  if (isPrivTalkMessage(message)) {
    handlePrivTalkRender(el, message, privTalkMergeEnabled);
    return;
  }

  handleBaseMessageRender(el, message, baseMessageMergeEnabled);
}

function handlePrivTalkRender(el: HTMLElement, message: ChatMessage, mergeEnabled: boolean): void {
  el.classList.add("priv_talk");
  el.classList.add(`user-${resolveAuthorId(message)}`);

  if (mergeEnabled) {
    if (state.privTalkIndex > 0 && state.lastPrivTalkMsg) {
      applyRounding(state.lastPrivTalkMsg, el, decideRounding(state.lastPrivTalkMsg.classList.contains("end")));
    }
    state.lastPrivTalkMsg = el;
  }
  state.privTalkIndex++;

  // 헤더 숨김 + 본문 영역을 잡담 전용 마크업으로 교체
  const header = el.querySelector("header");
  if (header) header.style.display = "none";

  const content = el.querySelector(".message-content");
  if (content) {
    content.innerHTML =
      `<div class="pt priv_user">${message.speaker.alias}</div> <div class="pt">${message.content}</div>`;
  }

  if (!(game.settings as any).get(MODULE_ID, SETTINGS.privTalkSpeakerLineChange)) {
    el.classList.add("speaker-inline");
  }
}

function handleBaseMessageRender(el: HTMLElement, message: ChatMessage, mergeEnabled: boolean): void {
  if (mergeEnabled && state.lastBaseMsg) {
    const prevWasPrivTalk = state.privTalkIndex > 0;
    if (shouldMergeBaseMessage(state.lastBaseMsg.msg, message, prevWasPrivTalk)) {
      applyRounding(state.lastBaseMsg.el, el, decideRounding(state.lastBaseMsg.el.classList.contains("end")));
    }
  }
  state.lastBaseMsg = { msg: message, el };
  state.privTalkIndex = 0;
}

/**
 * `init` hook 내에서 호출 — `game.release.generation`이 결정된 뒤 적절한 hook 이름을 고를 수 있다.
 */
export function registerChitchatRender() {
  (Hooks as any).on(getRenderChatMessageHook(), onRenderChatMessage);
}
