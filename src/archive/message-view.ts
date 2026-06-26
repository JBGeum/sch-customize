/**
 * 아카이브 export의 메시지 필터/머지/본문/클래스 순수 판정.
 * DOM·Foundry 비의존(단 isPrivTalkMessage는 순수 compat 헬퍼) — export.ts가 판정에만 사용.
 */
import { isPrivTalkMessage } from "../compat/foundry";

/** 속삭임 메시지 여부. */
export function isWhisper(chat: any): boolean {
  return !!(chat.whisper && chat.whisper.length > 0);
}

/** 속삭임이면서 (includeWhisper 꺼짐 OR 내용 비가시)면 export에서 제외. */
export function shouldExcludeWhisper(chat: any, includeWhisper: boolean): boolean {
  return isWhisper(chat) && (!includeWhisper || !chat.isContentVisible);
}

/**
 * 최종 머지 여부. 후보(prevSpeaker===alias 등 호출측 계산)에서 잡담 전환·속삭임이면 무효화.
 * 기존 appendChatContents의 두 무효화(`prevPtFlag !== privTalkFlag` / `whisperFlag`)를 합성한 것.
 */
export function resolveChatMergeFlag(args: { candidateMerge: boolean; prevPtFlag: boolean | undefined; privTalkFlag: boolean; whisperFlag: boolean }): boolean {
  return args.candidateMerge && args.prevPtFlag === args.privTalkFlag && !args.whisperFlag;
}

/** 본문 소스 판정(effect는 호출측). roll/item이 잡담보다 우선. */
export function selectBodySource(chat: any): "roll" | "privtalk" | "plain" {
  if (chat.isRoll || chat.flags?.item) return "roll";
  if (isPrivTalkMessage(chat)) return "privtalk";
  return "plain";
}

/** 메시지 div 클래스 배열(null 위치 보존 — createDivWithClasses가 falsy 무시). */
export function buildMessageClasses(args: { privTalkFlag: boolean; whisperFlag: boolean; hideWhisper: boolean; authorId: string | null }): (string | null)[] {
  return ["chat-box", "message",
    args.privTalkFlag ? "priv-talk" : null,
    args.whisperFlag ? "whisper" : null,
    args.whisperFlag && args.hideWhisper ? "whisper-hidden" : null,
    args.authorId ? `user-${args.authorId}` : null];
}

/** 속삭임 화자명에 수신자 부기. 배열은 toString(쉼표결합) 동작 보존. */
export function maskWhisperSpeaker(alias: string, recipientNames: string[]): string {
  return `${alias}\n→[${recipientNames}]`;
}
