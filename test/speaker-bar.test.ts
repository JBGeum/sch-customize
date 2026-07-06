import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveCurrentSpeaker, overrideSpeaker,
  getFavorites, addCurrentToFavorites, removeFavoriteAt, switchToFavorite, snapshotCurrentSpeaker,
  createSpeakerBarElement, updateSpeakerBar,
} from "../src/speaker-bar";
import { MODULE_ID } from "../src/constants";

// jsdom엔 game/canvas가 없다. 각 테스트가 전역을 stub하고 afterEach에서 제거한다.
// 모든 필드 기본 제공(optional-chaining/폴백 안전) → 잠금 시나리오도 reader의 eager-read에 안전.
function setupFoundry(opts: any = {}) {
  const setFlag = opts.setFlag ?? vi.fn();
  const unsetFlag = opts.unsetFlag ?? vi.fn();
  (globalThis as any).game = {
    user: {
      getFlag: (_s: string, key: string) =>
        key === "lockedSpeaker" ? (opts.locked ?? undefined)
        : key === "favoriteSpeakers" ? (opts.favorites ?? undefined)
        : undefined,
      setFlag,
      unsetFlag,
      isGM: opts.isGM ?? false,
      character: opts.character ?? null,
      name: opts.userName ?? "User",
      avatar: opts.userAvatar,
    },
    scenes: { get: (id: string) => opts.scenes?.[id] ?? null },
    actors: { get: (id: string) => opts.actors?.[id] ?? null },
    modules: { get: () => (opts.cgmpActive ? { active: true } : undefined) },
    settings: {
      get: (_m: string, key: string) =>
        key === "enableSpeakerFavorites" ? (opts.favEnabled ?? true)
        : key === "favoriteChipMode" ? (opts.favChipMode ?? "portrait")
        : opts.cgmpMode,
    },
  };
  (globalThis as any).canvas = { scene: opts.scene ?? { id: opts.sceneId ?? "scene1" }, tokens: { controlled: opts.controlled ?? [] } };
  (globalThis as any).ui = { notifications: { warn: opts.warn ?? vi.fn(), info: vi.fn() } };
  return { setFlag, unsetFlag };
}

afterEach(() => {
  delete (globalThis as any).game;
  delete (globalThis as any).canvas;
  delete (globalThis as any).ui;
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

describe("snapshotCurrentSpeaker", () => {
  it("선택 토큰 → sceneId/tokenId/actorId/alias 스냅샷", () => {
    setupFoundry({
      sceneId: "sc1",
      controlled: [{ document: { id: "t1", name: "Tok", texture: { src: "t.png" } }, actor: { id: "a1", name: "Act", hasPlayerOwner: false } }],
    });
    expect(snapshotCurrentSpeaker()).toEqual({ sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "Tok" });
  });
});

describe("getFavorites", () => {
  it("flag 없음 → 빈 배열", () => {
    setupFoundry({ favorites: undefined });
    expect(getFavorites()).toEqual([]);
  });
  it("flag 값 반환", () => {
    const favs = [{ sceneId: "s", tokenId: "t", actorId: "a", alias: "H" }];
    setupFoundry({ favorites: favs });
    expect(getFavorites()).toEqual(favs);
  });
});

describe("addCurrentToFavorites", () => {
  it("성공: setFlag로 스냅샷 append", async () => {
    const { setFlag } = setupFoundry({
      sceneId: "sc1", favorites: [],
      controlled: [{ document: { id: "t1", name: "Tok", texture: { src: "t.png" } }, actor: { id: "a1", name: "Act" } }],
    });
    await addCurrentToFavorites();
    expect(setFlag).toHaveBeenCalledWith(MODULE_ID, "favoriteSpeakers", [{ sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "Tok" }]);
  });
  it("빈 화자(무토큰/무캐릭터) → warn, setFlag 미호출", async () => {
    const warn = vi.fn();
    const { setFlag } = setupFoundry({ favorites: [], userName: "Solo", warn });
    await addCurrentToFavorites();
    expect(warn).toHaveBeenCalled();
    expect(setFlag).not.toHaveBeenCalled();
  });
  it("중복 → warn, setFlag 미호출", async () => {
    const warn = vi.fn();
    const existing = { sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "Tok" };
    const { setFlag } = setupFoundry({
      sceneId: "sc1", favorites: [existing], warn,
      controlled: [{ document: { id: "t1", name: "Tok", texture: { src: "t.png" } }, actor: { id: "a1", name: "Act" } }],
    });
    await addCurrentToFavorites();
    expect(warn).toHaveBeenCalled();
    expect(setFlag).not.toHaveBeenCalled();
  });
});

describe("switchToFavorite", () => {
  it("setLockedSpeaker 경유 → setFlag(lockedSpeaker) 호출", async () => {
    const { setFlag } = setupFoundry({ favorites: [] });
    const fav = { sceneId: "s", tokenId: "t", actorId: "a", alias: "H" };
    await switchToFavorite(fav);
    expect(setFlag).toHaveBeenCalledWith(MODULE_ID, "lockedSpeaker", fav);
  });
});

describe("removeFavoriteAt", () => {
  it("인덱스 제거 후 setFlag", async () => {
    const favs = [
      { sceneId: "s", tokenId: "t1", actorId: "a", alias: "1" },
      { sceneId: "s", tokenId: "t2", actorId: "a", alias: "2" },
    ];
    const { setFlag } = setupFoundry({ favorites: favs });
    await removeFavoriteAt(0);
    expect(setFlag).toHaveBeenCalledWith(MODULE_ID, "favoriteSpeakers", [favs[1]]);
  });
});

describe("칩 줄 렌더 (DOM 통합)", () => {
  function mountBar() {
    document.body.innerHTML = "";
    const bar = createSpeakerBarElement();
    document.body.appendChild(bar);
    return bar;
  }
  afterEach(() => { document.body.innerHTML = ""; });

  it("즐겨찾기 2개 → 칩 2개 + [+] 렌더", () => {
    setupFoundry({
      favorites: [
        { sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "고블린" },
        { sceneId: "sc1", tokenId: "t2", actorId: "a2", alias: "상인" },
      ],
      scenes: { sc1: { tokens: { get: (id: string) => ({ name: id, texture: { src: `${id}.png` } }) } } },
    });
    const bar = mountBar();
    updateSpeakerBar();
    expect(bar.querySelectorAll(".sch-fav-chip").length).toBe(2);
    expect(bar.querySelector(".sch-fav-add")).not.toBeNull();
  });

  it("현재 lock 일치 칩에 .active", () => {
    setupFoundry({
      locked: { sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "고블린" },
      favorites: [{ sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "고블린" }],
      scenes: { sc1: { tokens: { get: () => ({ name: "고블린", texture: { src: "g.png" } }) } } },
      actors: { a1: { name: "고블린", img: "g.png" } },
    });
    const bar = mountBar();
    updateSpeakerBar();
    expect(bar.querySelector(".sch-fav-chip")!.classList.contains("active")).toBe(true);
  });

  it("설정 off → 칩 줄 숨김(display:none), 칩 미렌더", () => {
    setupFoundry({
      favEnabled: false,
      favorites: [{ sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "고블린" }],
    });
    const bar = mountBar();
    updateSpeakerBar();
    const strip = bar.querySelector(".sch-fav-strip") as HTMLElement;
    expect(strip.style.display).toBe("none");
    expect(bar.querySelectorAll(".sch-fav-chip").length).toBe(0);
  });

  it("칩 클릭 → 그 화자로 lock 전환(setFlag lockedSpeaker)", () => {
    const { setFlag } = setupFoundry({
      favorites: [{ sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "고블린" }],
      scenes: { sc1: { tokens: { get: () => ({ name: "고블린", texture: { src: "g.png" } }) } } },
    });
    const bar = mountBar();
    updateSpeakerBar();
    (bar.querySelector(".sch-fav-chip") as HTMLElement).click();
    expect(setFlag).toHaveBeenCalledWith(MODULE_ID, "lockedSpeaker", { sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "고블린" });
  });

  it("x 클릭 → 삭제(setFlag favoriteSpeakers []), 전환 미발생", () => {
    const { setFlag } = setupFoundry({
      favorites: [{ sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "고블린" }],
      scenes: { sc1: { tokens: { get: () => ({ name: "고블린", texture: { src: "g.png" } }) } } },
    });
    const bar = mountBar();
    updateSpeakerBar();
    (bar.querySelector(".sch-fav-chip-remove") as HTMLElement).click();
    expect(setFlag).toHaveBeenCalledWith(MODULE_ID, "favoriteSpeakers", []);
    expect(setFlag).not.toHaveBeenCalledWith(MODULE_ID, "lockedSpeaker", expect.anything());
  });

  it("portrait 모드(기본): 칩에 img, label 없음", () => {
    setupFoundry({
      favorites: [{ sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "고블린" }],
      scenes: { sc1: { tokens: { get: () => ({ name: "고블린", texture: { src: "g.png" } }) } } },
    });
    const bar = mountBar();
    updateSpeakerBar();
    const chip = bar.querySelector(".sch-fav-chip")!;
    expect(chip.querySelector(".sch-fav-chip-img")).not.toBeNull();
    expect(chip.querySelector(".sch-fav-chip-label")).toBeNull();
    expect(chip.classList.contains("mode-name")).toBe(false);
  });

  it("이름 모드: 칩에 .mode-name + label(텍스트), img 없음", () => {
    setupFoundry({
      favChipMode: "name",
      favorites: [{ sceneId: "sc1", tokenId: "t1", actorId: "a1", alias: "고블린" }],
      scenes: { sc1: { tokens: { get: () => ({ name: "고블린", texture: { src: "g.png" } }) } } },
    });
    const bar = mountBar();
    updateSpeakerBar();
    const chip = bar.querySelector(".sch-fav-chip")!;
    expect(chip.classList.contains("mode-name")).toBe(true);
    const label = chip.querySelector(".sch-fav-chip-label");
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("고블린");
    expect(chip.querySelector(".sch-fav-chip-img")).toBeNull();
  });
});
