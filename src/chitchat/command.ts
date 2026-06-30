/**
 * 잡담(chitchat) 트리거를 네이티브로 처리한다.
 *
 * 외부 라이브러리(Chat Command Lib) 없이 Foundry `chatMessage` hook을 직접 가로채:
 *  - 지정 트리거(`/pt`,`` ` ``,`!`,사용자 alias)로 입력되면 본문을 잡담으로 변환해 생성하고
 *  - 그렇지 않으면 그대로 통과(다른 처리에 맡긴다).
 *
 * `chatMessage` hook은 Foundry가 슬래시 커맨드를 파싱하기 전에 호출되며,
 * 정확히 `false`를 반환하면 기본 메시지 생성을 막는다(v12/v13 동일).
 */
import { MODULE_ID } from "../constants";
import { getChatStyles, isV13Plus } from "../compat/foundry";
import { SETTINGS } from "../settings/keys";
import { matchChitchatTrigger } from "./trigger";
import { getChitchatAliases } from "./aliases";

/**
 * Foundry `setup` hook에서 호출. chatMessage hook을 등록한다.
 */
export function registerChitchatCommand() {
  Hooks.on("chatMessage", (_chatLog: any, message: string, chatData: any): boolean | void => {
    const matched = matchChitchatTrigger(message, getChitchatAliases());
    if (!matched) return; // 잡담 아님 → 통과(undefined 반환 = 취소 아님)

    let body = matched.body;
    // 마크다운 취소선 옵션이 꺼져 있으면 <del>을 ~로 환원해 일반 텍스트로 둠
    if (!(game.settings as any).get(MODULE_ID, SETTINGS.markdownDelUse)) {
      body = body.replace(/<\s*\/?\s*del\s*>/g, "~");
    }

    const speakUser = (chatData.user instanceof User)
      ? chatData.user
      : game.users!.get(chatData.user);

    chatData.speaker = chatData.speaker ?? {};
    chatData.speaker.actor = speakUser.id;
    chatData.speaker.token = null;
    chatData.speaker.alias = speakUser.name;

    const styles = getChatStyles();
    const styleValue = (game.settings as any).get(MODULE_ID, SETTINGS.privTalkAsOOC)
      ? styles.OOC : styles.OTHER;
    // v13+: .style(문자열 subtype), v12: .type
    if (isV13Plus()) {
      chatData.style = styleValue;
    } else {
      chatData.type = styleValue;
    }

    chatData.content = body;
    chatData.flags = { ...(chatData.flags ?? {}), [MODULE_ID]: { priv_talk: true } };

    ChatMessage.create(chatData).catch((err: unknown) =>
      console.error(`${MODULE_ID} | 잡담 메시지 생성 실패`, err),
    );
    return false; // 기본 생성 억제
  });
}
