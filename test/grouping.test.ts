import { describe, it, expect, beforeEach } from "vitest";
import { onRenderChatMessage, resetRenderState } from "../src/chitchat/render";
import {
  resolveMessageStyle,
  resolveAuthorId,
  speakerKey,
  shouldMergeBaseMessage,
  decideRounding,
} from "../src/chitchat/grouping";

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
  settings.privTalkSpeakerLineChange = false; // false → speaker-inline 부착
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

describe("merge 비활성 경로 & 리셋", () => {
  it("privTalkMerge=false → 잡담 연속에도 그룹 클래스 미부착", () => {
    settings.privTalkMerge = false;
    const e1 = render(priv("1"));
    const e2 = render(priv("1"));
    expect(e1.classList.contains("top")).toBe(false);
    expect(e2.classList.contains("end")).toBe(false);
    expect(e2.classList.contains("middle")).toBe(false);
  });

  it("privTalkMerge=false 라도 privTalkIndex 증가는 유지되어 잡담이 일반 그룹을 끊는다", () => {
    settings.privTalkMerge = false;
    render(base(0, "A", { actor: "a" })); // lastBaseMsg=base1, privTalkIndex=0
    render(priv("1"));                     // merge off: 라운딩 없음, 그러나 privTalkIndex++ → 1
    const b2 = render(base(0, "A", { actor: "a" })); // prevWasPrivTalk=true → 머지 안 됨
    expect(b2.classList.contains("end")).toBe(false);
  });

  it("baseMessageMerge=false → 일반 메시지 연속에도 그룹 클래스 미부착", () => {
    settings.baseMessageMerge = false;
    const e1 = render(base(0, "A", { actor: "a" }));
    const e2 = render(base(0, "A", { actor: "a" }));
    expect(e1.classList.contains("top")).toBe(false);
    expect(e2.classList.contains("end")).toBe(false);
  });

  it("resetRenderState()는 그룹 상태를 초기화한다", () => {
    render(priv("1"));
    const e2 = render(priv("1"));
    expect(e2.classList.contains("end")).toBe(true); // 리셋 전: 그룹 형성
    resetRenderState();
    const e3 = render(priv("1")); // 리셋 후 첫 메시지 → 그룹 없음
    expect(e3.classList.contains("end")).toBe(false);
    expect(e3.classList.contains("top")).toBe(false);
    expect(e3.classList.contains("middle")).toBe(false);
  });
});

describe("speaker-inline 부착 방향", () => {
  it("privTalkSpeakerLineChange=false → speaker-inline 부착", () => {
    settings.privTalkSpeakerLineChange = false;
    expect(render(priv("1")).classList.contains("speaker-inline")).toBe(true);
  });
  it("privTalkSpeakerLineChange=true → 미부착", () => {
    settings.privTalkSpeakerLineChange = true;
    expect(render(priv("1")).classList.contains("speaker-inline")).toBe(false);
  });
});

describe("resolveMessageStyle", () => {
  it("style 우선", () => expect(resolveMessageStyle({ style: 1, type: 2 })).toBe(1));
  it("style 없으면 type 폴백", () => expect(resolveMessageStyle({ type: 2 })).toBe(2));
});

describe("resolveAuthorId", () => {
  it("author.id 우선", () => expect(resolveAuthorId({ author: { id: "A" }, user: { id: "U" } })).toBe("A"));
  it("author 없으면 user.id", () => expect(resolveAuthorId({ user: { id: "U" } })).toBe("U"));
  it("스칼라 author 폴백", () => expect(resolveAuthorId({ author: "A" })).toBe("A"));
  it("스칼라 user 폴백", () => expect(resolveAuthorId({ user: "U" })).toBe("U"));
});

describe("speakerKey", () => {
  it("actor 우선", () => expect(speakerKey({ actor: "a", token: "t", alias: "x" })).toBe("a"));
  it("actor 없으면 token", () => expect(speakerKey({ token: "t" })).toBe("t"));
  it("token 없으면 alias", () => expect(speakerKey({ alias: "x" })).toBe("x"));
  it("전부 없으면 빈 문자열", () => expect(speakerKey({})).toBe(""));
});

describe("shouldMergeBaseMessage", () => {
  const mk = (style: number, author: string, actor: string) =>
    ({ style, author: { id: author }, speaker: { actor } });
  it("전부 일치 → true", () =>
    expect(shouldMergeBaseMessage(mk(0, "A", "a"), mk(0, "A", "a"), false)).toBe(true));
  it("style 불일치 → false", () =>
    expect(shouldMergeBaseMessage(mk(0, "A", "a"), mk(1, "A", "a"), false)).toBe(false));
  it("author 불일치 → false", () =>
    expect(shouldMergeBaseMessage(mk(0, "A", "a"), mk(0, "B", "a"), false)).toBe(false));
  it("speaker 불일치 → false", () =>
    expect(shouldMergeBaseMessage(mk(0, "A", "a"), mk(0, "A", "b"), false)).toBe(false));
  it("prevWasPrivTalk → false", () =>
    expect(shouldMergeBaseMessage(mk(0, "A", "a"), mk(0, "A", "a"), true)).toBe(false));
});

describe("decideRounding", () => {
  it("prevHasEnd=true → end→middle, curr end", () =>
    expect(decideRounding(true)).toEqual({ prevRemove: ["end"], prevAdd: ["middle"], currAdd: ["end"] }));
  it("prevHasEnd=false → prev top, curr end", () =>
    expect(decideRounding(false)).toEqual({ prevRemove: [], prevAdd: ["top"], currAdd: ["end"] }));
});
