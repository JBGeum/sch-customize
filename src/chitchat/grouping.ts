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

/**
 * 두 메시지가 일반 머지 호환인지. 호출측이 lastBaseMsg 존재·privTalkIndex==0·설정을
 * 이미 가드한 뒤 호출한다 — 이 함수는 "두 메시지가 같은 묶음인가"만 답한다.
 *
 * 비교 항/순서는 기존 render.ts 와 동일하게 보존:
 *   sameAuthor && sameSpeaker && !prevWasPrivTalk && sameStyle
 */
export function shouldMergeBaseMessage(last: any, curr: any, prevWasPrivTalk: boolean): boolean {
  const sameStyle = resolveMessageStyle(last) === resolveMessageStyle(curr);
  const sameAuthor = resolveAuthorId(last) === resolveAuthorId(curr);
  const sameSpeaker = speakerKey(last.speaker) === speakerKey(curr.speaker);
  return sameAuthor && sameSpeaker && !prevWasPrivTalk && sameStyle;
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
