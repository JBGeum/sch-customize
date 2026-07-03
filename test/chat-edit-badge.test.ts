import { describe, it, expect } from "vitest";
import { injectEditedBadge, onRenderEditedBadge, EDITED_BADGE_CLASS } from "../src/chat-edit/badge";

(globalThis as any).game = { i18n: { localize: (k: string) => k } };

function li(): HTMLElement {
  const el = document.createElement("li");
  el.className = "message";
  el.innerHTML = `<div class="message-content">안녕</div>`;
  return el;
}

describe("injectEditedBadge", () => {
  it(".message-content 하단에 배지 1개 추가", () => {
    const el = li();
    injectEditedBadge(el, "(수정됨)");
    const badge = el.querySelector(`.${EDITED_BADGE_CLASS}`) as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe("(수정됨)");
    expect(badge.parentElement!.classList.contains("message-content")).toBe(true);
  });
  it("멱등: 두 번 호출해도 1개", () => {
    const el = li();
    injectEditedBadge(el, "(수정됨)");
    injectEditedBadge(el, "(수정됨)");
    expect(el.querySelectorAll(`.${EDITED_BADGE_CLASS}`).length).toBe(1);
  });
  it(".message-content 없으면 el 자체에 추가", () => {
    const el = document.createElement("li");
    injectEditedBadge(el, "(수정됨)");
    expect(el.querySelector(`.${EDITED_BADGE_CLASS}`)).not.toBeNull();
  });
});

describe("onRenderEditedBadge", () => {
  it("edited 메시지면 배지 주입", () => {
    const el = li();
    onRenderEditedBadge({ flags: { "sch-customize": { edited: true } } }, el);
    expect(el.querySelector(`.${EDITED_BADGE_CLASS}`)).not.toBeNull();
  });
  it("edited 아니면 배지 없음", () => {
    const el = li();
    onRenderEditedBadge({ flags: {} }, el);
    expect(el.querySelector(`.${EDITED_BADGE_CLASS}`)).toBeNull();
  });
});
