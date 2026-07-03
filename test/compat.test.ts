import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isPrivTalkMessage,
  toElement,
  isV13Plus,
  getRenderChatMessageHook,
  getChatStyles,
  renderChatMessageElement,
} from "../src/compat/foundry";

describe("isPrivTalkMessage — priv_talk 3경로 폴백(보존 필수)", () => {
  const make = (flags: unknown) => ({ flags }) as any;

  it("flags['sch-customize'].priv_talk → true (현재 네임스페이스)", () => {
    expect(isPrivTalkMessage(make({ "sch-customize": { priv_talk: true } }))).toBe(true);
  });

  it("flags['chat-tailor'].priv_talk → true (레거시 보존 — 핵심)", () => {
    expect(isPrivTalkMessage(make({ "chat-tailor": { priv_talk: true } }))).toBe(true);
  });

  it("flags['priv_talk'] → true (최초 네임스페이스 없음)", () => {
    expect(isPrivTalkMessage(make({ priv_talk: true }))).toBe(true);
  });

  it("무관 플래그만 → false", () => {
    expect(isPrivTalkMessage(make({ "other-module": { foo: true } }))).toBe(false);
  });

  it("flags undefined → false", () => {
    expect(isPrivTalkMessage(make(undefined))).toBe(false);
  });
});

describe("toElement — jQuery/HTMLElement 통일", () => {
  it("HTMLElement → 그대로 반환", () => {
    const el = document.createElement("div");
    expect(toElement(el)).toBe(el);
  });

  it("jQuery-like {0: el, length: 1} → el", () => {
    const el = document.createElement("span");
    expect(toElement({ 0: el, length: 1 } as any)).toBe(el);
  });

  it("null → null", () => {
    expect(toElement(null)).toBe(null);
  });

  it("undefined → null", () => {
    expect(toElement(undefined)).toBe(null);
  });

  it("[0] 없는 객체 → null", () => {
    expect(toElement({ length: 0 } as any)).toBe(null);
  });
});

describe("버전/상수 호환 (game·CONST 전역 스텁)", () => {
  let savedGame: unknown;
  let savedCONST: unknown;

  beforeEach(() => {
    savedGame = (globalThis as any).game;
    savedCONST = (globalThis as any).CONST;
  });
  afterEach(() => {
    if (savedGame === undefined) delete (globalThis as any).game;
    else (globalThis as any).game = savedGame;
    if (savedCONST === undefined) delete (globalThis as any).CONST;
    else (globalThis as any).CONST = savedCONST;
  });

  describe("isV13Plus", () => {
    it("generation 13 → true", () => {
      (globalThis as any).game = { release: { generation: 13 } };
      expect(isV13Plus()).toBe(true);
    });
    it("generation 12 → false", () => {
      (globalThis as any).game = { release: { generation: 12 } };
      expect(isV13Plus()).toBe(false);
    });
    it("generation undefined → false (?? 0)", () => {
      (globalThis as any).game = { release: {} };
      expect(isV13Plus()).toBe(false);
    });
  });

  describe("getRenderChatMessageHook", () => {
    it("v13+ → 'renderChatMessageHTML'", () => {
      (globalThis as any).game = { release: { generation: 13 } };
      expect(getRenderChatMessageHook()).toBe("renderChatMessageHTML");
    });
    it("v12 → 'renderChatMessage'", () => {
      (globalThis as any).game = { release: { generation: 12 } };
      expect(getRenderChatMessageHook()).toBe("renderChatMessage");
    });
  });

  describe("getChatStyles", () => {
    it("CHAT_MESSAGE_STYLES 존재 → STYLES 반환", () => {
      const styles = { OOC: 1, IC: 2 };
      (globalThis as any).CONST = { CHAT_MESSAGE_STYLES: styles, CHAT_MESSAGE_TYPES: { OOC: 9 } };
      expect(getChatStyles()).toBe(styles);
    });
    it("STYLES 없고 TYPES만 → TYPES 반환", () => {
      const types = { OOC: 0, IC: 1 };
      (globalThis as any).CONST = { CHAT_MESSAGE_TYPES: types };
      expect(getChatStyles()).toBe(types);
    });
  });
});

describe("renderChatMessageElement — renderHTML/getHTML feature detection", () => {
  it("renderHTML 함수 존재 → 그 결과 반환 (v13+)", async () => {
    const el = document.createElement("div");
    const chat = { renderHTML: async () => el } as any;
    expect(await renderChatMessageElement(chat)).toBe(el);
  });

  it("renderHTML 없고 getHTML → [0] 반환 (v12)", async () => {
    const el = document.createElement("p");
    const chat = { getHTML: async () => ({ 0: el, length: 1 }) } as any;
    expect(await renderChatMessageElement(chat)).toBe(el);
  });

  it("getHTML 결과 [0] 없음 → null", async () => {
    const chat = { getHTML: async () => ({ length: 0 }) } as any;
    expect(await renderChatMessageElement(chat)).toBe(null);
  });
});
