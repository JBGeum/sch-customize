import { describe, it, expect } from "vitest";
import {
  resolveSpeaker, resolveCgmpForcedSpeaker, userSpeakerInfo, assignedCharacterSpeakerInfo,
  resolveOverrideSpeaker, CGMP_SPEAKER_MODE, DEFAULT_IMG, type SpeakerContext,
} from "../src/speaker-resolve";
import { MODULE_ID } from "../src/constants";

function ctx(over: Partial<SpeakerContext> = {}): SpeakerContext {
  return {
    locked: null, lockedToken: null, lockedActor: null,
    cgmpMode: null, isGM: false, controlled: null,
    assignedCharacter: null, userName: "User", userAvatar: "user.png",
    ...over,
  };
}

describe("resolveSpeaker — 우선순위", () => {
  it("1. 잠금: alias>token.name, token.texture.src>actor.img, locked:true", () => {
    const token = { name: "Tok", texture: { src: "tok.png" } };
    const actor = { name: "Act", img: "act.png" };
    const r = resolveSpeaker(ctx({ locked: { sceneId: "s", tokenId: "t", actorId: "a", alias: "Hero" }, lockedToken: token, lockedActor: actor }));
    expect(r).toEqual({ img: "tok.png", name: "Hero", locked: true, actor, token });
  });

  it("1. 잠금 scene 불일치(lockedToken=null): img=actor.img, name=alias 유지", () => {
    const actor = { name: "Act", img: "act.png" };
    const r = resolveSpeaker(ctx({ locked: { sceneId: "gone", tokenId: "t", actorId: "a", alias: "Hero" }, lockedToken: null, lockedActor: actor }));
    expect(r).toMatchObject({ img: "act.png", name: "Hero", locked: true, token: null, actor });
  });

  it("1. 잠금 token+actor 모두 없음: img=DEFAULT, name=alias", () => {
    const r = resolveSpeaker(ctx({ locked: { sceneId: null, tokenId: null, actorId: null, alias: "Hero" } }));
    expect(r).toMatchObject({ img: DEFAULT_IMG, name: "Hero", locked: true });
  });

  it("2. CGMP 강제(ALWAYS_OOC)가 선택 토큰보다 우선", () => {
    const r = resolveSpeaker(ctx({ cgmpMode: CGMP_SPEAKER_MODE.ALWAYS_OOC, userName: "P", userAvatar: "p.png", controlled: { token: { name: "Tok", texture: { src: "t.png" } }, actor: null, isPc: false } }));
    expect(r).toMatchObject({ img: "p.png", name: "P", locked: false, actor: null, token: null });
  });

  it("3. 선택 토큰: token.texture.src>actor.img", () => {
    const token = { name: "Tok", texture: { src: "t.png" } };
    const actor = { name: "Act", img: "a.png" };
    const r = resolveSpeaker(ctx({ controlled: { token, actor, isPc: true } }));
    expect(r).toEqual({ img: "t.png", name: "Tok", locked: false, actor, token });
  });

  it("3. 선택 토큰 img 폴백: token.texture 없음 → actor.img", () => {
    const r = resolveSpeaker(ctx({ controlled: { token: { name: "Tok" }, actor: { name: "Act", img: "a.png" }, isPc: false } }));
    expect(r).toMatchObject({ img: "a.png", name: "Tok" });
  });

  it("4. 배정 캐릭터", () => {
    const character = { name: "Char", img: "c.png" };
    const r = resolveSpeaker(ctx({ assignedCharacter: character }));
    expect(r).toEqual({ img: "c.png", name: "Char", locked: false, actor: character, token: null });
  });

  it("5. 유저 최종 폴백", () => {
    const r = resolveSpeaker(ctx({ userName: "Solo" }));
    expect(r).toEqual({ img: DEFAULT_IMG, name: "Solo", locked: false, actor: null, token: null });
  });
});

describe("resolveCgmpForcedSpeaker — 5모드", () => {
  it("null/DEFAULT → null", () => {
    expect(resolveCgmpForcedSpeaker(ctx({ cgmpMode: null }))).toBeNull();
    expect(resolveCgmpForcedSpeaker(ctx({ cgmpMode: CGMP_SPEAKER_MODE.DEFAULT }))).toBeNull();
  });
  it("DISABLE_GM_AS_PC(1): !isGM → null", () => {
    expect(resolveCgmpForcedSpeaker(ctx({ cgmpMode: 1, isGM: false, controlled: { token: null, actor: null, isPc: true } }))).toBeNull();
  });
  it("DISABLE_GM_AS_PC(1): isGM + PC토큰 → user OOC", () => {
    const r = resolveCgmpForcedSpeaker(ctx({ cgmpMode: 1, isGM: true, userName: "GM", userAvatar: "g.png", controlled: { token: null, actor: null, isPc: true } }));
    expect(r).toMatchObject({ img: "g.png", name: "GM", actor: null, token: null });
  });
  it("DISABLE_GM_AS_PC(1): isGM + NPC토큰 → null", () => {
    expect(resolveCgmpForcedSpeaker(ctx({ cgmpMode: 1, isGM: true, controlled: { token: null, actor: null, isPc: false } }))).toBeNull();
  });
  it("FORCE_IN_CHARACTER(2)/IN_CHARACTER_ALWAYS_ASSIGNED(4) → 배정 캐릭터", () => {
    const character = { name: "Char", img: "c.png" };
    expect(resolveCgmpForcedSpeaker(ctx({ cgmpMode: 2, assignedCharacter: character }))).toMatchObject({ name: "Char", actor: character });
    expect(resolveCgmpForcedSpeaker(ctx({ cgmpMode: 4, assignedCharacter: character }))).toMatchObject({ name: "Char", actor: character });
  });
  it("FORCE_IN_CHARACTER(2): 배정 없음 → user OOC", () => {
    expect(resolveCgmpForcedSpeaker(ctx({ cgmpMode: 2, assignedCharacter: null, userName: "U" }))).toMatchObject({ name: "U", actor: null });
  });
  it("ALWAYS_OOC(3) → user OOC", () => {
    expect(resolveCgmpForcedSpeaker(ctx({ cgmpMode: 3, userName: "U", userAvatar: "u.png" }))).toMatchObject({ img: "u.png", name: "U" });
  });
});

describe("userSpeakerInfo / assignedCharacterSpeakerInfo", () => {
  it("userSpeakerInfo", () => {
    expect(userSpeakerInfo(ctx({ userName: "U", userAvatar: "u.png" }))).toEqual({ img: "u.png", name: "U", locked: false, actor: null, token: null });
  });
  it("assignedCharacterSpeakerInfo: 캐릭터 있음", () => {
    const c = { name: "C", img: "c.png" };
    expect(assignedCharacterSpeakerInfo(ctx({ assignedCharacter: c }))).toEqual({ img: "c.png", name: "C", locked: false, actor: c, token: null });
  });
  it("assignedCharacterSpeakerInfo: img 없으면 DEFAULT", () => {
    const c = { name: "C" };
    expect(assignedCharacterSpeakerInfo(ctx({ assignedCharacter: c }))).toMatchObject({ img: DEFAULT_IMG, name: "C" });
  });
  it("assignedCharacterSpeakerInfo: 캐릭터 없으면 user OOC", () => {
    expect(assignedCharacterSpeakerInfo(ctx({ assignedCharacter: null, userName: "U" }))).toMatchObject({ name: "U", actor: null });
  });
});

describe("resolveOverrideSpeaker", () => {
  it("!locked → null", () => {
    expect(resolveOverrideSpeaker(null, { speaker: {} })).toBeNull();
  });
  it("priv_talk → null", () => {
    expect(resolveOverrideSpeaker({ sceneId: "s", tokenId: "t", actorId: "a", alias: "H" }, { flags: { [MODULE_ID]: { priv_talk: true } } })).toBeNull();
  });
  it("speaker 객체 구성(alias 스냅샷)", () => {
    expect(resolveOverrideSpeaker({ sceneId: "s", tokenId: "t", actorId: "a", alias: "H" }, { speaker: { alias: "orig" }, flags: {} })).toEqual({ scene: "s", actor: "a", token: "t", alias: "H" });
  });
  it("alias 없으면 data.speaker.alias 폴백, id null 폴백", () => {
    expect(resolveOverrideSpeaker({ sceneId: null, tokenId: null, actorId: null, alias: undefined as any }, { speaker: { alias: "fromData" } })).toEqual({ scene: null, actor: null, token: null, alias: "fromData" });
  });
});
