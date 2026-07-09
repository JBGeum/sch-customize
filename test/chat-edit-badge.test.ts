import { describe, it, expect } from "vitest";
import { injectEditedBadge, onRenderEditedBadge, EDITED_BADGE_CLASS } from "../src/chat-edit/badge";

(globalThis as any).game = { i18n: { localize: (k: string) => k }, settings: { get: () => true } };

function li(): HTMLElement {
  const el = document.createElement("li");
  el.className = "message";
  el.innerHTML = `<div class="message-content">안녕</div>`;
  return el;
}

describe("injectEditedBadge", () => {
  it("아이콘(i.fa-pen)으로 title/aria-label 세팅, 마지막 블록(<p>) 안쪽 배치", () => {
    const el = document.createElement("li");
    el.className = "message";
    el.innerHTML = `<div class="message-content"><p>안녕</p></div>`;
    injectEditedBadge(el, "수정됨");
    const badge = el.querySelector(`.${EDITED_BADGE_CLASS}`) as HTMLElement;
    expect(badge.tagName).toBe("I");
    expect(badge.classList.contains("fa-pen")).toBe(true);
    expect(badge.getAttribute("title")).toBe("수정됨");
    expect(badge.getAttribute("aria-label")).toBe("수정됨");
    expect(badge.parentElement!.tagName).toBe("P");
  });
  it("블록 자식 없으면 .message-content 끝에 배치", () => {
    const el = li();
    injectEditedBadge(el, "수정됨");
    const badge = el.querySelector(`.${EDITED_BADGE_CLASS}`) as HTMLElement;
    expect(badge.parentElement!.classList.contains("message-content")).toBe(true);
  });
  it("중첩 블록(<div><p>)이어도 가장 안쪽 <p> 안에 배치(형제 줄바꿈 방지)", () => {
    const el = document.createElement("li");
    el.innerHTML = `<div class="message-content"><div class="wrap"><p>sssdd</p></div></div>`;
    injectEditedBadge(el, "수정됨");
    const badge = el.querySelector(`.${EDITED_BADGE_CLASS}`) as HTMLElement;
    expect(badge.parentElement!.tagName).toBe("P");
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
  it("showEditedBadge off면 주입 안 함", () => {
    (globalThis as any).game.settings = { get: () => false };
    const el = li();
    onRenderEditedBadge({ flags: { "sch-customize": { edited: true } } }, el);
    expect(el.querySelector(`.${EDITED_BADGE_CLASS}`)).toBeNull();
    (globalThis as any).game.settings = { get: () => true };
  });
});
