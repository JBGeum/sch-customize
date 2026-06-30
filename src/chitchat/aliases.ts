/**
 * 현재 잡담 트리거 목록을 game.settings에서 구성한다(impure).
 * 고정 트리거 `/pt`,`` ` ``,`!` + 사용자 지정 alias(customPrivTalkAlias).
 * 제출 핸들러(command.ts)와 타이핑 표시기(indicator.ts)가 공유한다.
 * (matchChitchatTrigger가 빈 값/중복을 정리하므로 여기선 가공하지 않는다.)
 */
import { MODULE_ID } from "../constants";
import { SETTINGS } from "../settings/keys";

export function getChitchatAliases(): string[] {
  const custom = (game.settings as any).get(MODULE_ID, SETTINGS.customPrivTalkAlias) as string;
  return ["/pt", "`", "!", custom];
}
