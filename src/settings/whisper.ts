/**
 * 귓속말 export 설정(includeWhisper/hideWhisper)을 game.settings에서 읽어 반환한다.
 * export 진입점들(openChatArchive · getDFchatArchive · module.api)이 공유한다.
 *
 * leaf 모듈(constants + settings/keys만 import) — settings/index.ts에 두면
 * export.ts → settings/index.ts → dialog.ts → export.ts 순환이 생기므로 분리.
 */
import { MODULE_ID } from "../constants";
import { SETTINGS } from "./keys";

export function readWhisperSettings(): { includeWhisper: boolean; hideWhisper: boolean } {
  const gs = game.settings as any;
  return {
    includeWhisper: gs.get(MODULE_ID, SETTINGS.includeWhisper),
    hideWhisper: gs.get(MODULE_ID, SETTINGS.hideWhisper),
  };
}
