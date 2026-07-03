/**
 * 잡담/일반 메시지 그룹화의 순수 판정 로직.
 * DOM·Foundry 비의존 — render.ts 가 import 해 판정에만 사용한다.
 */

/** v13+ `.style` / v12 `.type` 중 존재하는 값. */
export function resolveMessageStyle(msg: any): unknown {
  return msg.style ?? msg.type;
}

/** v13+ `.author` / v12 `.user` 의 author id(둘 다 User 객체이므로 `.id`만 취한다). */
export function resolveAuthorId(msg: any): unknown {
  return msg.author?.id ?? msg.user?.id;
}

/** speaker 비교 키. actor → token → alias → "" 우선순위. */
export function speakerKey(speaker: any): string {
  return speaker?.actor ?? speaker?.token ?? speaker?.alias ?? "";
}

/** 귓속말 수신자 비교 키. 공개(비귓속)는 "". 수신자 순서 무관하게 정렬해 비교. */
export function whisperKey(msg: any): string {
  const w = msg?.whisper;
  if (!Array.isArray(w) || w.length === 0) return "";
  return [...w].map(String).sort().join(",");
}

/**
 * 두 메시지가 일반 머지 호환인지. 호출측이 lastBaseMsg 존재·privTalkIndex==0·설정을
 * 이미 가드한 뒤 호출한다 — 이 함수는 "두 메시지가 같은 묶음인가"만 답한다.
 *
 * 비교 항/순서는 기존 render.ts 와 동일하게 보존하고 whisper 수신자 일치를 추가:
 *   sameAuthor && sameSpeaker && !prevWasPrivTalk && sameStyle && sameWhisper
 * (공개+귓속, 수신자 다른 귓속말은 분리 — continuation 의 header 수신자정보가 가려지는 miss 방지.)
 */
export function shouldMergeBaseMessage(last: any, curr: any, prevWasPrivTalk: boolean): boolean {
  const sameStyle = resolveMessageStyle(last) === resolveMessageStyle(curr);
  const sameAuthor = resolveAuthorId(last) === resolveAuthorId(curr);
  const sameSpeaker = speakerKey(last.speaker) === speakerKey(curr.speaker);
  const sameWhisper = whisperKey(last) === whisperKey(curr);
  return sameAuthor && sameSpeaker && !prevWasPrivTalk && sameStyle && sameWhisper;
}

export interface RoundingDecision {
  prevRemove: string[];
  prevAdd: string[];
  currAdd: string[];
}

/** 직전 엘리먼트의 현재 end 보유 여부로 라운딩 클래스 변경을 결정. 잡담·일반 공통. */
export function decideRounding(prevHasEnd: boolean): RoundingDecision {
  if (prevHasEnd) {
    return { prevRemove: ["end"], prevAdd: ["middle"], currAdd: ["end"] };
  }
  return { prevRemove: [], prevAdd: ["top"], currAdd: ["end"] };
}

/**
 * 앞/뒤 이웃과의 merge 여부로 한 메시지의 그룹 라운딩 클래스를 결정한다(순수).
 * 순차 스트리밍(decideRounding)과 달리 양쪽 이웃을 모두 알 때 쓰며, 이웃을 수정하지
 * 않고 자기 클래스만 완결적으로 정한다 — 편집 등 제자리 재렌더 시 재그룹에 사용.
 *   prev&next → middle(헤더 숨김), prev만 → end(헤더 숨김),
 *   next만 → top(헤더 표시=그룹 시작), 둘 다 아님 → null(단독=헤더 표시).
 */
export function classForGrouping(mergePrev: boolean, mergeNext: boolean): "top" | "middle" | "end" | null {
  if (mergePrev && mergeNext) return "middle";
  if (mergePrev) return "end";
  if (mergeNext) return "top";
  return null;
}
