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
import { shouldMergeBaseMessage, decideRounding, resolveAuthorId, classForGrouping, type RoundingDecision } from "./grouping";

// 모듈 내부에서 직전 메시지 정보를 추적하기 위한 상태.
// Foundry 렌더 hook은 동기적으로 메시지 순서대로 호출되므로 모듈 스코프 변수로 충분.
interface RenderState {
  lastPrivTalkMsg: HTMLElement | null;
  lastBaseMsg: { el: HTMLElement; msg: any } | null;
  privTalkIndex: number;
  // 이미 렌더된 일반 메시지 id 집합. 재렌더(편집 등) 감지에 쓴다 — Foundry는 편집 시
  // 메시지를 detached 상태로 렌더해 훅을 발화하므로 DOM 위치로는 재렌더를 알 수 없다.
  seenBaseIds: Set<string>;
}
const state: RenderState = { lastPrivTalkMsg: null, lastBaseMsg: null, privTalkIndex: 0, seenBaseIds: new Set() };

/**
 * 외부에서 상태를 리셋해야 할 때(예: setup 후 새 세션 시작) 호출.
 */
export function resetRenderState() {
  state.lastPrivTalkMsg = null;
  state.lastBaseMsg = null;
  state.privTalkIndex = 0;
  state.seenBaseIds.clear();
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

  // 편집 등으로 이미 렌더된 적 있는 메시지가 재렌더되면, 순차 스트리밍용 state.lastBaseMsg 는
  // stale하다(직전 전체 렌더의 마지막 메시지를 가리킴). 그 stale 이웃과 잘못 merge하면 편집한
  // 메시지가 end/middle을 받아 헤더가 사라진다. ★Foundry는 편집 시 메시지를 detached 상태로
  // 렌더해 훅을 발화(el.isConnected=false, 형제 없음)하므로 DOM 위치로는 재렌더를 알 수 없고,
  // 이미 본 id 인지로만 판별한다. 재그룹은 삽입(연결)된 뒤 실제 DOM 이웃으로 계산한다.
  const id = String((message as any).id ?? "");
  if (id !== "" && state.seenBaseIds.has(id)) {
    regroupAfterInsertion(el, message, baseMessageMergeEnabled);
    return;
  }
  if (id !== "") state.seenBaseIds.add(id);

  handleBaseMessageRender(el, message, baseMessageMergeEnabled);
}

/** 로그 DOM에서 인접한 메시지 엘리먼트(dir 방향)를 찾는다. 비메시지 노드는 건너뛴다. */
function adjacentMessageEl(el: Element, dir: "prev" | "next"): Element | null {
  let sib = dir === "prev" ? el.previousElementSibling : el.nextElementSibling;
  while (sib && !(sib.matches?.(".message") || sib.hasAttribute("data-message-id"))) {
    sib = dir === "prev" ? sib.previousElementSibling : sib.nextElementSibling;
  }
  return sib;
}

/**
 * el이 로그에 삽입(연결)된 뒤 fn을 실행한다. ★Foundry는 편집뿐 아니라 전체 재렌더(새로고침)
 * 시에도 메시지를 detached로 렌더해 훅을 발화하므로, 훅 시점의 DOM(isConnected·이웃)은 신뢰할
 * 수 없다. 그룹화는 삽입 이후에 판정해야 정확하다(직전 메시지가 그때 연결돼 있어야 정상 merge,
 * 로그 clear로 제거된 메시지는 미연결이라 자동 제외). 이미 연결돼 있으면(라이브 append 다수/
 * 테스트) 즉시, 아니면 microtask, 그래도 아직이면 rAF로 미룬다.
 */
function runAfterConnected(el: HTMLElement, fn: () => void): void {
  if (el.isConnected) { fn(); return; }
  queueMicrotask(() => {
    if (el.isConnected) { fn(); return; }
    const raf = (globalThis as any).requestAnimationFrame;
    if (typeof raf === "function") raf(() => { if (el.isConnected) fn(); });
  });
}

/**
 * 재렌더(편집)된 메시지의 그룹 클래스를 실제 DOM 이웃으로부터 재계산한다(삽입 이후).
 * 즉시 stale 클래스를 제거해 잘못된 헤더 숨김/라운딩이 잠깐도 보이지 않게 한다.
 */
function regroupAfterInsertion(el: HTMLElement, message: any, mergeEnabled: boolean): void {
  el.classList.remove("top", "middle", "end");
  runAfterConnected(el, () => regroupBaseMessage(el, message, mergeEnabled));
}

/** 엘리먼트의 data-message-id로 ChatMessage를 조회. 없으면 null. */
function messageOfEl(el: Element | null): any {
  const id = el?.getAttribute("data-message-id");
  return id ? (game.messages as any)?.get(id) ?? null : null;
}

/**
 * 제자리 재렌더된 일반 메시지의 그룹 클래스를, stale state가 아니라 실제 DOM 이웃으로부터
 * 재계산한다. 자기 클래스만 완결적으로 정하므로 이웃(이미 올바른 클래스 보유)은 건드리지 않고,
 * 스트리밍 state.lastBaseMsg 도 갱신하지 않는다(진짜 마지막 메시지를 계속 가리켜야 함).
 */
function regroupBaseMessage(el: HTMLElement, message: any, mergeEnabled: boolean): void {
  el.classList.remove("top", "middle", "end");
  if (!mergeEnabled) return;

  const prevMsg = messageOfEl(adjacentMessageEl(el, "prev"));
  const nextMsg = messageOfEl(adjacentMessageEl(el, "next"));
  // 이웃이 잡담이면 일반 메시지와 묶이지 않는다(shouldMergeBaseMessage의 prevWasPrivTalk 축).
  const mergePrev = !!prevMsg && !isPrivTalkMessage(prevMsg) && shouldMergeBaseMessage(prevMsg, message, false);
  const mergeNext = !!nextMsg && !isPrivTalkMessage(nextMsg) && shouldMergeBaseMessage(message, nextMsg, false);

  const cls = classForGrouping(mergePrev, mergeNext);
  if (cls) el.classList.add(cls);
}

function handlePrivTalkRender(el: HTMLElement, message: ChatMessage, mergeEnabled: boolean): void {
  el.classList.add("priv_talk");
  el.classList.add(`user-${resolveAuthorId(message)}`);

  // 직전 잡담 엘리먼트를 훅 시점에 캡처하고, 그룹 라운딩은 삽입 이후로 미룬다(base와 동일 이유:
  // 재렌더·새로고침 시 detached라 훅 시점 isConnected가 신뢰 불가). 삽입 후 직전이 연결돼 있으면
  // 그룹화, 로그 clear로 제거됐으면 미연결이라 자동 제외.
  const prev = (mergeEnabled && state.privTalkIndex > 0) ? state.lastPrivTalkMsg : null;
  if (mergeEnabled) state.lastPrivTalkMsg = el;
  state.privTalkIndex++;

  // 헤더 숨김 + 본문 영역을 잡담 전용 마크업으로 교체 (동기 — 즉시 반영돼야 함)
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

  if (prev) {
    runAfterConnected(el, () => {
      if (prev.isConnected) applyRounding(prev, el, decideRounding(prev.classList.contains("end")));
    });
  }
}

function handleBaseMessageRender(el: HTMLElement, message: ChatMessage, mergeEnabled: boolean): void {
  // 직전 메시지 정보는 훅 시점에 캡처하고, 그룹화 판정/적용은 el이 로그에 삽입된 뒤로 미룬다.
  // (훅 시점엔 detached라 직전 엘리먼트의 isConnected가 항상 false여서 정상 merge까지 막힌다.)
  // 삽입 후 직전 엘리먼트가 연결돼 있으면 = 정상 연속 → merge. 로그 clear로 제거됐으면 미연결 →
  // merge 안 함(가려진 헤더로 새 메시지가 continuation처럼 보이는 버그 방지, 44eae6c 의도 보존).
  const prev = state.lastBaseMsg;
  const prevWasPrivTalk = state.privTalkIndex > 0;
  state.lastBaseMsg = { msg: message, el };
  state.privTalkIndex = 0;

  runAfterConnected(el, () => {
    if (!mergeEnabled || !prev || !prev.el.isConnected) return;
    if (shouldMergeBaseMessage(prev.msg, message, prevWasPrivTalk)) {
      applyRounding(prev.el, el, decideRounding(prev.el.classList.contains("end")));
    }
  });
}

/**
 * `init` hook 내에서 호출 — `game.release.generation`이 결정된 뒤 적절한 hook 이름을 고를 수 있다.
 */
export function registerChitchatRender() {
  (Hooks as any).on(getRenderChatMessageHook(), onRenderChatMessage);
}
