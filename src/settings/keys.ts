/**
 * 모든 game.settings **value 설정** 키의 단일 출처.
 * 값은 등록 문자열과 정확히 동일해야 한다(변경 시 저장 설정이 리셋됨).
 * registerMenu 메뉴 키(downloadChatArchiveMenu/openChatArchiveWindow)는 value 설정이 아니라 제외.
 */
export const SETTINGS = {
  enableSpeakerBar: "enableSpeakerBar",
  includeWhisper: "includeWhisper",
  hideWhisper: "hideWhisper",
  lastExportMode: "lastExportMode",
  customPrivTalkAlias: "customPrivTalkAlias",
  markdownDelUse: "markdownDelUse",
  privTalkAsOOC: "privTalkAsOOC",
  privTalkSpeakerLineChange: "privTalkSpeakerLineChange",
  baseMessageMerge: "baseMessageMerge",
  privTalkMerge: "privTalkMerge",
  setChatLogFontSize: "setChatLogFontSize",
  setPrivTalkFontSize: "setPrivTalkFontSize",
  setPrivTalkFontOpacity: "setPrivTalkFontOpacity",
  setPrivTalkMarginLeft: "setPrivTalkMarginLeft",
  setPrivTalkBgBrightness: "setPrivTalkBgBrightness",
} as const;
