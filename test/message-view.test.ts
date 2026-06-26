import { describe, it, expect } from "vitest";
import { appendChatContents } from "../src/archive/export";
import { isWhisper, shouldExcludeWhisper, resolveChatMergeFlag, selectBodySource, buildMessageClasses, maskWhisperSpeaker } from "../src/archive/message-view";

// Foundry 전역 스텁 — whisper 수신자명 / actor 조회(초상화 없음 경로)
(globalThis as any).game = {
  users: { get: (id: string) => ({ name: "RCP-" + id }) },
  actors: { get: () => undefined, getName: () => undefined },
};

// 잡담 식별은 flags["sch-customize"].priv_talk 경로 사용
function plain(over: any = {}) {
  return { flags: {}, author: { id: "A" }, alias: "Alice", speaker: { alias: "Alice" },
    content: "hello", whisper: [], isRoll: false, isContentVisible: true, ...over };
}
function privtalk(over: any = {}) {
  return { flags: { "sch-customize": { priv_talk: true } }, author: { id: "A" }, alias: "Alice",
    speaker: { alias: "Alice" },
    content: '<div class="pt priv_user">Alice</div> <div class="pt">hi there</div>',
    whisper: [], isRoll: false, ...over };
}

// 현 시그니처로 호출 → 컨테이너의 .chat-box 반환
async function append(chat: any, opts: { merge?: boolean; prevPt?: boolean | undefined; whisper?: boolean; hideWhisper?: boolean } = {}) {
  const container = document.createElement("div");
  await appendChatContents(chat, opts.merge ?? false, opts.prevPt, opts.whisper ?? false, container, opts.hideWhisper ?? false);
  return container.querySelector(".chat-box") as HTMLElement;
}

describe("appendChatContents — 일반 메시지", () => {
  it("기본: chat-box/message/user-{id} 클래스, 화자명, 본문", async () => {
    const box = await append(plain());
    expect(box.classList.contains("chat-box")).toBe(true);
    expect(box.classList.contains("message")).toBe(true);
    expect(box.classList.contains("user-A")).toBe(true);
    expect(box.classList.contains("priv-talk")).toBe(false);
    expect(box.querySelector(".chat-name")!.textContent).toBe("Alice");
    expect(box.querySelector(".chat-text")!.innerHTML).toBe("hello");
  });

  it("merge=true(+prevPt 일치): chat-text에 chat-merge, 화자명/초상화 생략", async () => {
    // 현 코드는 prevPtFlag !== privTalkFlag 면 merge 무효화 → 일반(privTalkFlag=false)이므로 prevPt=false 로 맞춤
    const box = await append(plain(), { merge: true, prevPt: false });
    expect(box.querySelector(".chat-text")!.classList.contains("chat-merge")).toBe(true);
    expect(box.querySelector(".chat-name")!.textContent).toBe("");
    expect(box.querySelector("img.chat-image")).toBeNull();
  });

  it("prevPtFlag !== privTalkFlag 면 merge 무효화", async () => {
    // 직전이 잡담(prevPt=true), 현재 일반(privTalkFlag=false) → merge 끊김
    const box = await append(plain(), { merge: true, prevPt: true });
    expect(box.querySelector(".chat-text")!.classList.contains("chat-merge")).toBe(false);
    expect(box.querySelector(".chat-name")!.textContent).toBe("Alice");
  });
});

describe("appendChatContents — 잡담", () => {
  it("priv-talk 클래스 + 본문은 .pt에서 추출", async () => {
    const box = await append(privtalk(), { prevPt: true });
    expect(box.classList.contains("priv-talk")).toBe(true);
    expect(box.querySelector(".chat-text")!.innerHTML).toBe("hi there");
  });
});

describe("appendChatContents — 속삭임", () => {
  it("whisper+hideWhisper: 클래스 + 마스킹 화자명 + merge 강제 false", async () => {
    const chat = plain({ author: { id: "B" }, alias: "Bob", speaker: { alias: "Bob" },
      content: "secret", whisper: ["u1", "u2"] });
    const box = await append(chat, { merge: true, prevPt: false, whisper: true, hideWhisper: true });
    expect(box.classList.contains("whisper")).toBe(true);
    expect(box.classList.contains("whisper-hidden")).toBe(true);
    expect(box.querySelector(".chat-name")!.textContent).toBe("Bob\n→[RCP-u1,RCP-u2]");
    expect(box.querySelector(".chat-text")!.classList.contains("chat-merge")).toBe(false);
  });

  it("whisper+hideWhisper=false: whisper-hidden 미부착", async () => {
    const chat = plain({ whisper: ["u1"], content: "x" });
    const box = await append(chat, { whisper: true, hideWhisper: false });
    expect(box.classList.contains("whisper")).toBe(true);
    expect(box.classList.contains("whisper-hidden")).toBe(false);
  });
});

describe("isWhisper", () => {
  it("whisper 배열 있음", () => expect(isWhisper({ whisper: ["a"] })).toBe(true));
  it("빈 배열", () => expect(isWhisper({ whisper: [] })).toBe(false));
  it("없음", () => expect(isWhisper({})).toBe(false));
});

describe("shouldExcludeWhisper", () => {
  it("비속삭임 → false", () => expect(shouldExcludeWhisper({ whisper: [] }, false)).toBe(false));
  it("속삭임+include off → true", () => expect(shouldExcludeWhisper({ whisper: ["a"], isContentVisible: true }, false)).toBe(true));
  it("속삭임+include on+visible → false", () => expect(shouldExcludeWhisper({ whisper: ["a"], isContentVisible: true }, true)).toBe(false));
  it("속삭임+include on+invisible → true", () => expect(shouldExcludeWhisper({ whisper: ["a"], isContentVisible: false }, true)).toBe(true));
});

describe("resolveChatMergeFlag", () => {
  const A = { candidateMerge: true, prevPtFlag: false, privTalkFlag: false, whisperFlag: false };
  it("후보 true + 조건 충족 → true", () => expect(resolveChatMergeFlag(A)).toBe(true));
  it("후보 false → false", () => expect(resolveChatMergeFlag({ ...A, candidateMerge: false })).toBe(false));
  it("ptFlag 전환 → false", () => expect(resolveChatMergeFlag({ ...A, prevPtFlag: true })).toBe(false));
  it("첫 메시지(prevPtFlag undefined) → false", () => expect(resolveChatMergeFlag({ ...A, prevPtFlag: undefined })).toBe(false));
  it("whisper → false", () => expect(resolveChatMergeFlag({ ...A, whisperFlag: true })).toBe(false));
});

describe("selectBodySource", () => {
  it("isRoll → roll", () => expect(selectBodySource({ isRoll: true })).toBe("roll"));
  it("flags.item → roll", () => expect(selectBodySource({ flags: { item: {} } })).toBe("roll"));
  it("roll이 잡담보다 우선", () => expect(selectBodySource({ isRoll: true, flags: { "sch-customize": { priv_talk: true } } })).toBe("roll"));
  it("잡담 → privtalk", () => expect(selectBodySource({ flags: { "sch-customize": { priv_talk: true } } })).toBe("privtalk"));
  it("일반 → plain", () => expect(selectBodySource({ flags: {} })).toBe("plain"));
});

describe("buildMessageClasses", () => {
  it("일반(author 있음)", () =>
    expect(buildMessageClasses({ privTalkFlag: false, whisperFlag: false, hideWhisper: false, authorId: "A" }))
      .toEqual(["chat-box", "message", null, null, null, "user-A"]));
  it("잡담+속삭임+hide", () =>
    expect(buildMessageClasses({ privTalkFlag: true, whisperFlag: true, hideWhisper: true, authorId: null }))
      .toEqual(["chat-box", "message", "priv-talk", "whisper", "whisper-hidden", null]));
  it("속삭임이지만 hide=false → whisper-hidden 위치 null", () =>
    expect(buildMessageClasses({ privTalkFlag: false, whisperFlag: true, hideWhisper: false, authorId: "B" }))
      .toEqual(["chat-box", "message", null, "whisper", null, "user-B"]));
});

describe("maskWhisperSpeaker", () => {
  it("단일 수신자", () => expect(maskWhisperSpeaker("Bob", ["Carol"])).toBe("Bob\n→[Carol]"));
  it("복수 수신자(쉼표결합)", () => expect(maskWhisperSpeaker("Bob", ["Carol", "Dave"])).toBe("Bob\n→[Carol,Dave]"));
});
