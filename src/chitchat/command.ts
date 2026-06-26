/**
 * 잡담(chitchat) chat command 등록.
 *
 * `/pt`, `!`, `` ` ``, 사용자 지정 alias 중 무엇으로 입력해도 본 명령이 받게 된다.
 * 콜백은 messageData의 speaker를 발신자 본인으로 덮어쓰고, style/type을 OOC 또는 OTHER로 분류한 뒤,
 * `chat-tailor.priv_talk` flag를 켜서 메시지 객체를 반환한다.
 */

import { MODULE_ID } from "../constants";
import { getChatStyles, isV13Plus } from "../compat/foundry";

/**
 * Foundry `setup` hook에서 호출. `chatCommands` 라이브러리가 그때 준비된다.
 */
export function registerChitchatCommand() {
  const commands = (game as any).chatCommands;
  commands.register({
    name: "/pt",
    module: "core",
    aliases: [`${(game.settings as any).get(MODULE_ID, "customPrivTalkAlias")}`, "`", "!"],
    icon: "<i class='fas fa-dice-d20'></i>",
    requiredRole: "NONE",
    callback: async function (_chat: any, parameters: any, messageData: any) {
      // 마크다운 취소선 옵션이 꺼져 있으면 잡담 본문의 <del>을 ~로 환원해 일반 텍스트로 둠
      if (!(game.settings as any).get(MODULE_ID, "markdownDelUse")) {
        parameters = parameters.replace(/<\s*\/?\s*del\s*>/g, "~");
      }

      const speakUser = (messageData.user instanceof User)
        ? messageData.user
        : game.users!.get(messageData.user);

      messageData.speaker.actor = speakUser.id;
      messageData.speaker.token = null;
      messageData.speaker.alias = speakUser.name;

      const styles = getChatStyles();
      const styleValue = (game.settings as any).get(MODULE_ID, "privTalkAsOOC")
        ? styles.OOC : styles.OTHER;
      // v13+에서 .type은 document subtype 식별자(문자열)로 의미가 바뀌었으므로
      // 버전에 따라 사용하는 필드를 분리한다.
      if (isV13Plus()) {
        messageData.style = styleValue;
      } else {
        messageData.type = styleValue;
      }

      return {
        content: parameters,
        flags: {
          [MODULE_ID]: { priv_talk: true },
        },
      };
    },
    autocompleteCallback: (_menu: any, _alias: any, _parameters: any) =>
      [(game as any).chatCommands.createInfoElement(game.i18n!.localize("sch-customize.chat.privTalkAutocomplete"))],
    closeOnComplete: true,
  });
}
