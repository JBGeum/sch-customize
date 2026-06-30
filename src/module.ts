/**
 * Chat Tailor — Foundry VTT 모듈 진입점.
 *
 * 이 파일은 가능한 한 작게 유지한다. 실제 로직은 다음 모듈에 분산되어 있다:
 *
 *   compat/foundry.js     — Foundry 버전(v12/v13/v14) 호환 헬퍼
 *   settings/index.js     — 모든 game.settings.register / registerMenu
 *   chitchat/command.js   — /pt chat command 등록
 *   chitchat/render.js    — 잡담/일반 메시지 그룹화 렌더 hook
 *   speaker-bar.js        — 발화자 바
 *   appearance.js         — CSS 변수 갱신, 유저 색상 배경
 *   archive/dialog.js     — 채팅 로그 다운로드/표시 다이얼로그
 *   archive/export.js     — 채팅 → HTML/zip 변환
 *   archive/css.js        — 아카이브 HTML에 인라인할 CSS 수집기
 *   archive/util.js       — 순수 유틸 (저장 타깃, hexToRgba, 이미지 헬퍼 등)
 *
 * Foundry 라이프사이클 hook 등록 순서:
 *   init   → 설정 등록 + 렌더 hook 등록 + 적용된 CSS 값 한번 반영
 *   setup  → /pt command 등록 + (옵션) 발화자 바 활성화
 *   ready  → 사용자별 색상 배경 스타일 주입
 */

import "./styles/main.scss";
import { MODULE_ID } from "./constants";
import { SETTINGS } from "./settings/keys";
import { registerAllSettings } from "./settings/index";
import { registerChitchatCommand } from "./chitchat/command";
import { registerChitchatRender, resetRenderState } from "./chitchat/render";
import { registerSpeakerBar } from "./speaker-bar";
import { applyAllCssSettings, applyUserColorBackgrounds } from "./appearance";
import {
  openChatArchive,
  downloadArchiveFile,
  downloadIncrementalArchive,
} from "./archive/export";
import { readWhisperSettings } from "./settings/whisper";

/**
 * 외부(매크로/타 모듈)에서 호출 가능한 공개 API를 module.api에 노출한다.
 *
 * - `openChatArchive(chats?)`            → 새 창에 채팅 로그 표시
 * - `downloadArchiveFile(chats?)`        → 단독 zip 다운로드
 * - `downloadIncrementalArchive(chats?, opts?)` → 누적 zip 다운로드
 *
 * 인자를 생략하면 현재 월드의 모든 메시지(game.messages.contents)를 사용한다.
 * 매크로 호환성을 위해 wrapper에서 기본값을 채워주는 형태로 둔다.
 */
function registerModuleApi() {
  const mod = game.modules!.get(MODULE_ID);
  if (!mod) return;

  const allChats = () => [...(game.messages?.contents ?? [])];

  (mod as unknown as { api: unknown }).api = {
    openChatArchive: (chats: any) => openChatArchive(chats ?? allChats()),
    downloadArchiveFile: (chats: any) => downloadArchiveFile(chats ?? allChats(), readWhisperSettings()),
    downloadIncrementalArchive: (chats: any, opts: any) =>
      downloadIncrementalArchive(chats ?? allChats(), { ...readWhisperSettings(), ...opts }),
  };
}

Hooks.once("init", () => {
  registerAllSettings();
  registerChitchatRender();
  applyAllCssSettings();
  registerModuleApi();
});

Hooks.once("setup", () => {
  resetRenderState();
  if ((game.settings as any).get(MODULE_ID, SETTINGS.enableSpeakerBar)) {
    registerSpeakerBar();
  }
  registerChitchatCommand();
});

Hooks.once("ready", () => {
  applyUserColorBackgrounds();
});
