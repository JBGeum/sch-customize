import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../src/chat-edit/dialog", () => ({ showEditMessageDialog: vi.fn() }));

import { buildEditContextEntry } from "../src/chat-edit/context-menu";
import { showEditMessageDialog } from "../src/chat-edit/dialog";

function li(id: string): HTMLElement {
  const el = document.createElement("li");
  el.className = "message";
  el.dataset.messageId = id;
  el.innerHTML = `<div class="message-content">안녕</div>`;
  return el;
}

function setupGame(msg: any): void {
  (globalThis as any).game = {
    i18n: { localize: (k: string) => k },
    user: { id: "u1" },
    messages: { get: (id: string) => (id === "m1" ? msg : null) },
  };
}

afterEach(() => { vi.clearAllMocks(); });

describe("buildEditContextEntry.condition", () => {
  it("편집 가능 + 권한 있으면 true", () => {
    setupGame({ rolls: [], canUserModify: () => true });
    expect(buildEditContextEntry().condition(li("m1"))).toBe(true);
  });
  it("권한 없으면 false", () => {
    setupGame({ rolls: [], canUserModify: () => false });
    expect(buildEditContextEntry().condition(li("m1"))).toBe(false);
  });
  it("굴림 메시지면 false", () => {
    setupGame({ rolls: [{}], canUserModify: () => true });
    expect(buildEditContextEntry().condition(li("m1"))).toBe(false);
  });
  it("메시지 조회 실패면 false", () => {
    setupGame({ rolls: [], canUserModify: () => true });
    expect(buildEditContextEntry().condition(li("unknown"))).toBe(false);
  });
});

describe("buildEditContextEntry.callback", () => {
  it("클릭 시 showEditMessageDialog(message) 호출", () => {
    const msg = { rolls: [], canUserModify: () => true };
    setupGame(msg);
    buildEditContextEntry().callback(li("m1"));
    expect(showEditMessageDialog).toHaveBeenCalledWith(msg);
  });
});

describe("buildEditContextEntry 메타", () => {
  it("name/icon 지정", () => {
    setupGame({ rolls: [], canUserModify: () => true });
    const e = buildEditContextEntry();
    expect(e.name).toBe("sch-customize.edit.contextLabel");
    expect(e.icon).toContain("fa-pen");
  });
});
