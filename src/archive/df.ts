/**
 * 구버전 **DF Chat Archive** JSON을 본 모듈 형식의 zip 아카이브로 변환한다.
 *
 * settings에서 `convertDFchatArchive` 경로가 .json 파일로 설정되면 자동 호출.
 * 변환 후에는 설정값을 초기화한다.
 */

import { MODULE_ID } from "../constants";
import { downloadArchiveFile } from "./export";
import { SETTINGS } from "../settings/keys";

export async function getDFchatArchive(filepath: string): Promise<void> {
  try {
    const response = await fetch(filepath);
    if (!response.ok) {
      throw new Error("Could not access the archive from server side: " + filepath);
    }
    const jsonDataArray = await response.json();
    const chats = jsonDataArray.map((data: unknown) => new ChatMessage(data as any));
    const gs = game.settings as any;
    await downloadArchiveFile(chats, {
      includeWhisper: gs.get(MODULE_ID, SETTINGS.includeWhisper),
      hideWhisper: gs.get(MODULE_ID, SETTINGS.hideWhisper),
    });
  } catch (error) {
    console.error(`Failed to read JSON for archive ${filepath}\n${error}`);
    throw error;
  } finally {
    (game.settings as any).set(MODULE_ID, SETTINGS.convertDFchatArchive, "");
  }
}
