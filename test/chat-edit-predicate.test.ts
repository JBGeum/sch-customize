import { describe, it, expect } from "vitest";
import {
  messageHasRoll,
  elementHasCard,
  isEditableMessage,
  isEditedMessage,
} from "../src/chat-edit/predicate";

function li(inner: string): HTMLElement {
  const el = document.createElement("li");
  el.className = "message";
  el.innerHTML = `<div class="message-content">${inner}</div>`;
  return el;
}

describe("messageHasRoll", () => {
  it("rolls 있으면 true", () => expect(messageHasRoll({ rolls: [{}] })).toBe(true));
  it("rolls 비었으면 false", () => expect(messageHasRoll({ rolls: [] })).toBe(false));
  it("rolls 없으면 false", () => expect(messageHasRoll({})).toBe(false));
});

describe("elementHasCard", () => {
  it(".chat-card 있으면 true", () => expect(elementHasCard(li(`<div class="chat-card"></div>`))).toBe(true));
  it(".dice-roll 있으면 true", () => expect(elementHasCard(li(`<div class="dice-roll"></div>`))).toBe(true));
  it("순수 텍스트면 false", () => expect(elementHasCard(li("안녕하세요"))).toBe(false));
});

describe("isEditableMessage", () => {
  it("굴림·카드 없으면 true", () => expect(isEditableMessage({ rolls: [] }, li("hi"))).toBe(true));
  it("굴림 있으면 false", () => expect(isEditableMessage({ rolls: [{}] }, li("hi"))).toBe(false));
  it("카드 있으면 false", () =>
    expect(isEditableMessage({ rolls: [] }, li(`<div class="chat-card"></div>`))).toBe(false));
});

describe("isEditedMessage", () => {
  it("edited flag 있으면 true", () =>
    expect(isEditedMessage({ flags: { "sch-customize": { edited: true } } })).toBe(true));
  it("flag 없으면 false", () => expect(isEditedMessage({ flags: {} })).toBe(false));
  it("flags 없으면 false", () => expect(isEditedMessage({})).toBe(false));
});
