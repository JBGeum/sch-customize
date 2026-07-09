import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../src/archive/export", () => ({ openChatArchive: vi.fn() }));

import { placeOpenLogButton, findControlButtons } from "../src/open-log-button";
import { openChatArchive } from "../src/archive/export";

afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = ""; });

(globalThis as any).game = { i18n: { localize: (k: string) => k }, messages: { contents: [{ id: "m1" }] } };

function controls(withChild = true): HTMLElement {
  const cb = document.createElement("div");
  cb.className = "control-buttons";
  if (withChild) { const b = document.createElement("button"); b.className = "native"; cb.appendChild(b); }
  return cb;
}

describe("placeOpenLogButton", () => {
  it("control-buttons의 첫 자식으로 .sch-open-log 버튼 삽입(Foundry ui-control 스타일 + FA 아이콘)", () => {
    const cb = controls();
    placeOpenLogButton(cb);
    const first = cb.firstElementChild as HTMLElement;
    expect(first.classList.contains("sch-open-log")).toBe(true);
    // 옆 Foundry 기본 버튼과 같은 불투명 스타일을 위해 ui-control 클래스를 공유
    expect(first.classList.contains("ui-control")).toBe(true);
    expect(first.getAttribute("aria-label")).toBe("sch-customize.chat.openLog.title");
    // 아이콘은 버튼 자체 FontAwesome 클래스로 렌더(자식 <i> 없음)
    expect(first.classList.contains("fa-solid")).toBe(true);
  });
  it("멱등: 두 번 호출해도 버튼 1개, 여전히 첫 자식", () => {
    const cb = controls();
    placeOpenLogButton(cb);
    placeOpenLogButton(cb);
    expect(cb.querySelectorAll(".sch-open-log").length).toBe(1);
    expect((cb.firstElementChild as HTMLElement).classList.contains("sch-open-log")).toBe(true);
  });
  it("클릭 → openChatArchive(현재 메시지들) 호출", () => {
    const cb = controls();
    placeOpenLogButton(cb);
    (cb.querySelector(".sch-open-log") as HTMLElement).click();
    expect(openChatArchive).toHaveBeenCalledTimes(1);
    expect((openChatArchive as any).mock.calls[0][0]).toEqual([{ id: "m1" }]);
  });
});

describe("findControlButtons", () => {
  it("root 내 우선, 없으면 document 폴백", () => {
    const root = document.createElement("div");
    const inner = controls(); root.appendChild(inner);
    expect(findControlButtons(root)).toBe(inner);
    const bodyCb = controls(); document.body.appendChild(bodyCb);
    expect(findControlButtons(document.createElement("div"))).toBe(bodyCb);
  });
});
