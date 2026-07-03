import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveCurrentSpeaker, overrideSpeaker } from "../src/speaker-bar";
import { MODULE_ID } from "../src/constants";

// jsdom엔 game/canvas가 없다. 각 테스트가 전역을 stub하고 afterEach에서 제거한다.
// 모든 필드 기본 제공(optional-chaining/폴백 안전) → 잠금 시나리오도 reader의 eager-read에 안전.
function setupFoundry(opts: any = {}) {
  (globalThis as any).game = {
    user: {
      getFlag: (_s: string, key: string) => (key === "lockedSpeaker" ? (opts.locked ?? undefined) : undefined),
      isGM: opts.isGM ?? false,
      character: opts.character ?? null,
      name: opts.userName ?? "User",
      avatar: opts.userAvatar,
    },
    scenes: { get: (id: string) => opts.scenes?.[id] ?? null },
    actors: { get: (id: string) => opts.actors?.[id] ?? null },
    modules: { get: () => (opts.cgmpActive ? { active: true } : undefined) },
    settings: { get: () => opts.cgmpMode },
  };
  (globalThis as any).canvas = { tokens: { controlled: opts.controlled ?? [] } };
}

afterEach(() => {
  delete (globalThis as any).game;
  delete (globalThis as any).canvas;
});

describe("resolveCurrentSpeaker (characterization, global stubs)", () => {
  it("잠금: alias=name, token.texture.src=img, locked:true", () => {
    setupFoundry({
      locked: { sceneId: "s1", tokenId: "t1", actorId: "a1", alias: "Hero" },
      scenes: { s1: { tokens: { get: (id: string) => (id === "t1" ? { name: "Tok", texture: { src: "tok.png" } } : null) } } },
      actors: { a1: { name: "Act", img: "act.png" } },
    });
    const r = resolveCurrentSpeaker();
    expect(r).toMatchObject({ img: "tok.png", name: "Hero", locked: true });
    expect(r.token).toMatchObject({ name: "Tok" });
    expect(r.actor).toMatchObject({ name: "Act" });
  });

  it("선택 토큰(무잠금, CGMP 비활성): 토큰 img/name, locked:false", () => {
    setupFoundry({
      controlled: [{ document: { name: "Tok", texture: { src: "t.png" } }, actor: { name: "Act", img: "a.png", hasPlayerOwner: true } }],
    });
    const r = resolveCurrentSpeaker();
    expect(r).toMatchObject({ img: "t.png", name: "Tok", locked: false });
  });

  it("CGMP ALWAYS_OOC(3)가 선택 토큰보다 우선 → user OOC", () => {
    setupFoundry({
      cgmpActive: true, cgmpMode: 3, userName: "Player", userAvatar: "av.png",
      controlled: [{ document: { name: "Tok", texture: { src: "t.png" } }, actor: { name: "Act" } }],
    });
    const r = resolveCurrentSpeaker();
    expect(r).toMatchObject({ img: "av.png", name: "Player", locked: false, actor: null, token: null });
  });

  it("배정 캐릭터 폴백(무잠금/무토큰/무CGMP)", () => {
    setupFoundry({ character: { name: "Char", img: "char.png" } });
    const r = resolveCurrentSpeaker();
    expect(r).toMatchObject({ img: "char.png", name: "Char", locked: false });
  });

  it("유저 최종 폴백", () => {
    setupFoundry({ userName: "Solo" });
    const r = resolveCurrentSpeaker();
    expect(r).toMatchObject({ img: "icons/svg/mystery-man.svg", name: "Solo", locked: false, actor: null, token: null });
  });
});

describe("overrideSpeaker (characterization)", () => {
  it("잠금: data.speaker 덮어쓰기 + updateSource 호출 + true", () => {
    setupFoundry({ locked: { sceneId: "s1", tokenId: "t1", actorId: "a1", alias: "Hero" } });
    const updateSource = vi.fn();
    const data: any = { speaker: { alias: "orig" }, flags: {} };
    const result = overrideSpeaker({ updateSource } as any, data);
    expect(result).toBe(true);
    expect(data.speaker).toEqual({ scene: "s1", actor: "a1", token: "t1", alias: "Hero" });
    expect(updateSource).toHaveBeenCalledWith({ speaker: { scene: "s1", actor: "a1", token: "t1", alias: "Hero" } });
  });

  it("무잠금: 변이 없음 + updateSource 미호출 + false (CGMP 보존)", () => {
    setupFoundry({ locked: undefined });
    const updateSource = vi.fn();
    const data: any = { speaker: { alias: "x" } };
    const result = overrideSpeaker({ updateSource } as any, data);
    expect(result).toBe(false);
    expect(data.speaker).toEqual({ alias: "x" });
    expect(updateSource).not.toHaveBeenCalled();
  });

  it("잡담(priv_talk): 변이 없음 + updateSource 미호출 + false", () => {
    setupFoundry({ locked: { sceneId: "s1", tokenId: "t1", actorId: "a1", alias: "Hero" } });
    const updateSource = vi.fn();
    const data: any = { speaker: { alias: "x" }, flags: { [MODULE_ID]: { priv_talk: true } } };
    const result = overrideSpeaker({ updateSource } as any, data);
    expect(result).toBe(false);
    expect(data.speaker).toEqual({ alias: "x" });
    expect(updateSource).not.toHaveBeenCalled();
  });
});
