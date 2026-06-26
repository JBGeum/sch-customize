import { describe, it, expect, beforeEach } from "vitest";
import { onRenderChatMessage, resetRenderState } from "../src/chitchat/render";

// game.settings.get 스텁 — 키별 설정값을 settings 맵에서 반환
const settings: Record<string, unknown> = {};
(globalThis as any).game = {
  settings: { get: (_mod: string, key: string) => settings[key] },
  release: { generation: 13 },
};

function makeEl(): HTMLElement {
  const el = document.createElement("li");
  el.className = "chat-message message";
  el.innerHTML = "<header></header><div class=\"message-content\"></div>";
  return el;
}

// 잡담 메시지 — flags 3경로 중 sch-customize 경로로 식별
function priv(userId: string) {
  return {
    flags: { "sch-customize": { priv_talk: true } },
    user: { id: userId },
    speaker: { alias: "U" + userId },
    content: "hi",
  } as any;
}

// 일반 메시지 — flags 비어 잡담 아님
function base(style: number, authorId: string, speaker: unknown) {
  return { flags: {}, style, author: { id: authorId }, speaker } as any;
}

function render(msg: any): HTMLElement {
  const el = makeEl();
  onRenderChatMessage(msg, el);
  return el;
}

beforeEach(() => {
  resetRenderState();
  settings.privTalkMerge = true;
  settings.baseMessageMerge = true;
  settings.privTalkSpeakerLineChange = false; // false → line-change 부착
});

describe("잡담 연속 그룹화", () => {
  it("3연속 잡담은 top / middle / end", () => {
    const e1 = render(priv("1"));
    const e2 = render(priv("1"));
    const e3 = render(priv("1"));
    expect(e1.classList.contains("top")).toBe(true);
    expect(e1.classList.contains("end")).toBe(false);
    expect(e2.classList.contains("middle")).toBe(true);
    expect(e3.classList.contains("end")).toBe(true);
    expect(e1.classList.contains("priv_talk")).toBe(true);
    expect(e1.classList.contains("user-1")).toBe(true);
    // M1, M2 — e2는 end를 잃고, e3은 top/middle 없이 end만 가짐
    expect(e2.classList.contains("end")).toBe(false);
    expect(e3.classList.contains("top")).toBe(false);
    expect(e3.classList.contains("middle")).toBe(false);
  });

  it("4연속 잡담은 top / middle / middle / end", () => {
    const e1 = render(priv("1"));
    const e2 = render(priv("1"));
    const e3 = render(priv("1"));
    const e4 = render(priv("1"));
    expect(e1.classList.contains("top")).toBe(true);
    expect(e2.classList.contains("middle")).toBe(true);
    expect(e3.classList.contains("middle")).toBe(true);
    expect(e4.classList.contains("end")).toBe(true);
  });
});

describe("일반 메시지 그룹화", () => {
  it("같은 author·style·speaker 연속은 top/end", () => {
    const sp = { actor: "a" };
    const e1 = render(base(0, "A", sp));
    const e2 = render(base(0, "A", sp));
    expect(e1.classList.contains("top")).toBe(true);
    expect(e2.classList.contains("end")).toBe(true);
  });

  it("author 다르면 그룹 끊김", () => {
    const e1 = render(base(0, "A", { actor: "a" }));
    const e2 = render(base(0, "B", { actor: "b" }));
    expect(e1.classList.contains("top")).toBe(false);
    expect(e2.classList.contains("end")).toBe(false);
  });

  it("같은 author라도 speaker(actor) 다르면 끊김 (GM NPC 전환)", () => {
    render(base(0, "A", { actor: "npc1" }));
    const e2 = render(base(0, "A", { actor: "npc2" }));
    expect(e2.classList.contains("end")).toBe(false);
  });

  it("연속 그룹 도중 author가 바뀌면 직전 end가 middle로 승격되지 않음", () => {
    const e1 = render(base(0, "A", { actor: "a" }));
    const e2 = render(base(0, "A", { actor: "a" }));
    const e3 = render(base(0, "B", { actor: "b" }));
    expect(e1.classList.contains("top")).toBe(true);
    expect(e2.classList.contains("end")).toBe(true);
    expect(e2.classList.contains("middle")).toBe(false);
    expect(e3.classList.contains("end")).toBe(false);
    expect(e3.classList.contains("top")).toBe(false);
  });

  it("중간에 잡담이 끼면 privTalkIndex 리셋으로 그룹 끊김", () => {
    render(base(0, "A", { actor: "a" }));
    render(priv("1"));
    const b2 = render(base(0, "A", { actor: "a" }));
    expect(b2.classList.contains("end")).toBe(false);
  });
});

describe("line-change 부착 방향", () => {
  it("privTalkSpeakerLineChange=false → line-change 부착", () => {
    settings.privTalkSpeakerLineChange = false;
    expect(render(priv("1")).classList.contains("line-change")).toBe(true);
  });
  it("privTalkSpeakerLineChange=true → 미부착", () => {
    settings.privTalkSpeakerLineChange = true;
    expect(render(priv("1")).classList.contains("line-change")).toBe(false);
  });
});
