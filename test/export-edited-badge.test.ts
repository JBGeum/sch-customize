import { describe, it, expect, beforeEach } from "vitest";
import { appendChatContents } from "../src/archive/export";

beforeEach(() => {
  (globalThis as any).game = {
    i18n: { localize: (k: string) => k },
    users: { get: () => ({ name: "x" }) },
    // getChatImageUrl(chat)이 무조건 game.actors.getName(...)을 호출하므로 최소 스텁 필요.
    actors: { getName: () => undefined },
    settings: { get: () => true },
  };
});

function plainChat(edited: boolean): any {
  return {
    alias: "Alice",
    author: { id: "u1" },
    content: "hello world",
    whisper: [],
    flags: edited ? { "sch-customize": { edited: true } } : {},
  };
}

describe("appendChatContents: edited badge in export", () => {
  it("편집된 plain 메시지 → .sch-edited-badge 추가", async () => {
    const container = document.createElement("div");
    await appendChatContents(plainChat(true), false, undefined, false, container, false, false);
    const badge = container.querySelector(".sch-edited-badge") as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.getAttribute("title")).toBe("sch-customize.edit.editedBadge");
  });
  it("편집 안 된 메시지 → 배지 없음", async () => {
    const container = document.createElement("div");
    await appendChatContents(plainChat(false), false, undefined, false, container, false, false);
    expect(container.querySelector(".sch-edited-badge")).toBeNull();
  });
  it("stripInteractive=true여도 배지 유지", async () => {
    const container = document.createElement("div");
    await appendChatContents(plainChat(true), false, undefined, false, container, false, true);
    expect(container.querySelector(".sch-edited-badge")).not.toBeNull();
  });
  it("showEditedBadge off면 export 배지 없음", async () => {
    (globalThis as any).game.settings = { get: () => false };
    const container = document.createElement("div");
    await appendChatContents(plainChat(true), false, undefined, false, container, false, false);
    expect(container.querySelector(".sch-edited-badge")).toBeNull();
  });
});
