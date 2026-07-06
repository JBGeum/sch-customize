import { describe, it, expect } from "vitest";
import { SETTINGS } from "../src/settings/keys";

describe("SETTINGS 키 값 고정(리셋 방지)", () => {
  it("등록 문자열과 정확히 일치", () => {
    expect(SETTINGS).toEqual({
      enableSpeakerBar: "enableSpeakerBar",
      enableSpeakerFavorites: "enableSpeakerFavorites",
      favoriteChipMode: "favoriteChipMode",
      includeWhisper: "includeWhisper",
      hideWhisper: "hideWhisper",
      lastExportMode: "lastExportMode",
      excludeGmWhisper: "excludeGmWhisper",
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
    });
  });
});
