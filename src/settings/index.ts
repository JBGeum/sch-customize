/**
 * 모듈의 모든 `game.settings.register` 및 `game.settings.registerMenu` 호출을 모은다.
 *
 * 등록 순서 자체는 동작에 영향을 주지 않으므로 가독성 좋은 순서로 묶었다:
 *   1. Speaker Bar
 *   2. Chat Archive 메뉴 & 옵션
 *   3. Chitchat 동작
 *   4. 머지(그룹화) 토글
 *   5. 외관(폰트/색상/여백/밝기)
 *
 * `applyAllCssSettings()`는 모든 설정 등록이 끝난 뒤 호출해야 한다(init 마지막).
 */

import { MODULE_ID } from "../constants";
import { ExportChatArchiveMenu, openChatArchiveWindow } from "../archive/dialog";
import { getDFchatArchive } from "../archive/df";
import { updateCssProperty } from "../appearance";

export function registerAllSettings(): void {
  // game.settings is typed to only accept "core" as module id; cast to any for third-party module use.
  const gs = game.settings as any;

  // ─── Speaker Bar ───
  gs.register(MODULE_ID, "enableSpeakerBar", {
    name: `${MODULE_ID}.settings.enableSpeakerBar.name`,
    hint: `${MODULE_ID}.settings.enableSpeakerBar.hint`,
    scope: "client",
    config: true,
    default: true,
    type: Boolean,
    onChange: () => window.location.reload(),
  });

  // ─── Chat Archive 메뉴 ───
  // 단일 진입점에서 단독 / 누적+머지 / 누적+전체덤프 3 모드를 선택한다.
  gs.registerMenu(MODULE_ID, "downloadChatArchiveMenu", {
    name: `${MODULE_ID}.settings.downloadChatArchiveMenu.name`,
    hint: `${MODULE_ID}.settings.downloadChatArchiveMenu.hint`,
    icon: "fas fa-download",
    type: ExportChatArchiveMenu,
  });

  gs.registerMenu(MODULE_ID, "openChatArchiveWindow", {
    name: `${MODULE_ID}.settings.openChatArchiveWindow.name`,
    hint: `${MODULE_ID}.settings.openChatArchiveWindow.hint`,
    icon: "fas fa-arrow-up-right-from-square",
    type: openChatArchiveWindow,
  });

  // ─── Chat Archive 옵션 ───
  gs.register(MODULE_ID, "includeWhisper", {
    name: `${MODULE_ID}.settings.includeWhisper.name`,
    hint: `${MODULE_ID}.settings.includeWhisper.hint`,
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
  });

  gs.register(MODULE_ID, "hideWhisper", {
    name: `${MODULE_ID}.settings.hideWhisper.name`,
    hint: `${MODULE_ID}.settings.hideWhisper.hint`,
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
  });

  // ─── DF Chat Archive 변환 (GM 전용) ───
  gs.register(MODULE_ID, "convertDFchatArchive", {
    name: `${MODULE_ID}.settings.convertDFchatArchive.name`,
    restricted: true,
    config: true,
    type: String,
    filePicker: "any",
    default: "",
    onChange: (value: string) => {
      if (value.endsWith(".json")) {
        getDFchatArchive(value);
      } else if (value.length > 0) {
        alert(game.i18n!.localize(`${MODULE_ID}.settings.convertDFchatArchive.alert`));
      }
    },
  });

  // ─── Chitchat 동작 ───
  gs.register(MODULE_ID, "customPrivTalkAlias", {
    name: `${MODULE_ID}.settings.customPrivTalkAlias.name`,
    hint: `${MODULE_ID}.settings.customPrivTalkAlias.hint`,
    scope: "client",
    config: true,
    default: "/p",
    type: String,
    onChange: () => window.location.reload(),
  });

  gs.register(MODULE_ID, "markdownDelUse", {
    name: `${MODULE_ID}.settings.markdownDelUse.name`,
    hint: `${MODULE_ID}.settings.markdownDelUse.hint`,
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => window.location.reload(),
  });

  gs.register(MODULE_ID, "privTalkAsOOC", {
    name: `${MODULE_ID}.settings.privTalkAsOOC.name`,
    hint: `${MODULE_ID}.settings.privTalkAsOOC.hint`,
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
  });

  gs.register(MODULE_ID, "privTalkSpeakerLineChange", {
    name: `${MODULE_ID}.settings.privTalkSpeakerLineChange.name`,
    hint: `${MODULE_ID}.settings.privTalkSpeakerLineChange.hint`,
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => window.location.reload(),
  });

  // ─── 머지(그룹화) 토글 ───
  gs.register(MODULE_ID, "baseMessageMerge", {
    name: `${MODULE_ID}.settings.baseMessageMerge.name`,
    hint: `${MODULE_ID}.settings.baseMessageMerge.hint`,
    scope: "client",
    config: true,
    default: true,
    type: Boolean,
    onChange: () => window.location.reload(),
  });

  gs.register(MODULE_ID, "privTalkMerge", {
    name: `${MODULE_ID}.settings.privTalkMerge.name`,
    hint: `${MODULE_ID}.settings.privTalkMerge.hint`,
    scope: "client",
    config: true,
    default: true,
    type: Boolean,
    onChange: () => window.location.reload(),
  });

  // ─── 외관 슬라이더 ───
  gs.register(MODULE_ID, "setChatLogFontSize", {
    name: `${MODULE_ID}.settings.setChatLogFontSize.name`,
    hint: `${MODULE_ID}.settings.setChatLogFontSize.hint`,
    config: true,
    type: Number,
    scope: "client",
    range: { min: 14, max: 30, step: 0.5 },
    default: 14,
    onChange: (value: number) => updateCssProperty("clFontSize", `${value}px`),
  });

  gs.register(MODULE_ID, "setPrivTalkFontSize", {
    name: `${MODULE_ID}.settings.setPrivTalkFontSize.name`,
    hint: `${MODULE_ID}.settings.setPrivTalkFontSize.hint`,
    config: true,
    type: Number,
    scope: "client",
    range: { min: 10, max: 30, step: 0.5 },
    default: 12,
    onChange: (value: number) => updateCssProperty("ptFontSize", `${value}px`),
  });

  gs.register(MODULE_ID, "setPrivTalkFontOpacity", {
    name: `${MODULE_ID}.settings.setPrivTalkFontOpacity.name`,
    hint: `${MODULE_ID}.settings.setPrivTalkFontOpacity.hint`,
    config: true,
    type: Number,
    scope: "client",
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.8,
    onChange: (value: number) => updateCssProperty("fontColor", `rgba(0,0,0,${value})`),
  });

  gs.register(MODULE_ID, "setPrivTalkMarginLeft", {
    name: `${MODULE_ID}.settings.setPrivTalkMarginLeft.name`,
    hint: `${MODULE_ID}.settings.setPrivTalkMarginLeft.hint`,
    config: true,
    type: Number,
    scope: "client",
    range: { min: 0, max: 40, step: 1 },
    default: 10,
    onChange: (value: number) => updateCssProperty("marginLeft", `${value}px`),
  });

  gs.register(MODULE_ID, "setPrivTalkBgBrightness", {
    name: `${MODULE_ID}.settings.setPrivTalkBgBrightness.name`,
    hint: `${MODULE_ID}.settings.setPrivTalkBgBrightness.hint`,
    config: true,
    type: Number,
    scope: "client",
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.7,
    onChange: (value: number) => updateCssProperty("brightness", `${value}`),
  });
}
