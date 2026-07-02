import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  appendChatContents,
  populateChatDoc,
  extractImageSets,
  injectRuntimeScript,
  generateSimpleHtmlFromChats,
  generateHtmlFromChats,
  generateIncrementalHtmlFromChats,
} from "../src/archive/export";
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

function chatDoc() {
  const doc = document.implementation.createHTMLDocument("t");
  const c = doc.createElement("div");
  c.className = "foundry-chat-container";
  doc.body.appendChild(c);
  return doc;
}

describe("populateChatDoc", () => {
  it("같은 alias 연속 → 2번째 chat-merge, 속삭임은 필터 제외", async () => {
    const doc = chatDoc();
    const chats = [
      plain({ content: "a" }),
      plain({ content: "b" }), // 같은 alias "Alice" → merge
      plain({ alias: "Eve", speaker: { alias: "Eve" }, whisper: ["u1"], content: "w" }), // 속삭임 → include off 제외
    ];
    await populateChatDoc(doc, chats, { includeWhisper: false, hideWhisper: false });
    const boxes = doc.querySelectorAll(".chat-box");
    expect(boxes.length).toBe(2); // 속삭임 1건 제외
    expect(boxes[0].querySelector(".chat-text")!.classList.contains("chat-merge")).toBe(false);
    expect(boxes[1].querySelector(".chat-text")!.classList.contains("chat-merge")).toBe(true);
  });

  it("잡담↔일반 전환 시 merge 끊김", async () => {
    const doc = chatDoc();
    await populateChatDoc(doc, [privtalk(), plain({ content: "x" })], { includeWhisper: false, hideWhisper: false });
    const boxes = doc.querySelectorAll(".chat-box");
    // 2번째(일반)는 직전이 잡담이라 prevPtFlag(true) !== privTalkFlag(false) → merge 안 됨
    expect(boxes[1].querySelector(".chat-text")!.classList.contains("chat-merge")).toBe(false);
  });

  it("필터로 제외된 속삭임은 prevSpeaker 연속성을 끊지 않는다", async () => {
    const doc = chatDoc();
    const chats = [
      plain({ content: "a" }),                                                         // Alice
      plain({ alias: "Eve", speaker: { alias: "Eve" }, whisper: ["u1"], content: "w" }), // 제외됨(includeWhisper=false)
      plain({ content: "c" }),                                                         // Alice 다시
    ];
    await populateChatDoc(doc, chats, { includeWhisper: false, hideWhisper: false });
    const boxes = doc.querySelectorAll(".chat-box");
    expect(boxes.length).toBe(2); // 속삭임 1건 제외
    // 제외된 속삭임이 prevSpeaker(continue가 갱신 앞에 위치)를 바꾸지 않으므로 2번째 Alice가 1번째와 merge
    expect(boxes[1].querySelector(".chat-text")!.classList.contains("chat-merge")).toBe(true);
  });

  it("includeWhisper=true: 속삭임이 추가되고 같은 alias여도 merge 강제 false", async () => {
    const doc = chatDoc();
    const chats = [
      plain({ content: "a" }),                  // Alice
      plain({ whisper: ["u1"], content: "w" }), // Alice의 속삭임(포함됨)
    ];
    await populateChatDoc(doc, chats, { includeWhisper: true, hideWhisper: false });
    const boxes = doc.querySelectorAll(".chat-box");
    expect(boxes.length).toBe(2);                                  // 속삭임 포함
    expect(boxes[1].classList.contains("whisper")).toBe(true);
    expect(boxes[1].querySelector(".chat-text")!.classList.contains("chat-merge")).toBe(false);
  });
});

describe("extractImageSets", () => {
  it(".chat-text img → contentImg, .chat-image img → portraitImg", () => {
    const doc = document.implementation.createHTMLDocument("t");
    doc.body.innerHTML =
      '<div class="chat-text"><img src="http://x/a.png"></div>' +
      '<div class="chat-image"><img src="http://x/p.png"></div>';
    const { contentImg, portraitImg } = extractImageSets(doc);
    expect([...contentImg]).toEqual(["http://x/a.png"]);
    expect([...portraitImg]).toEqual(["http://x/p.png"]);
  });
});

describe("appendChatContents — 삭제된 속삭임 수신자(C6)", () => {
  const origGet = (globalThis as any).game.users.get;
  const origI18n = (globalThis as any).game.i18n;
  beforeEach(() => {
    (globalThis as any).game.users.get = (id: string) =>
      id === "gone" ? undefined : { name: "RCP-" + id };
    (globalThis as any).game.i18n = {
      localize: (k: string) =>
        k === "sch-customize.archive.whisperUnknownUser" ? "Unknown user" : k,
    };
  });
  afterEach(() => {
    (globalThis as any).game.users.get = origGet;
    (globalThis as any).game.i18n = origI18n;
  });

  it("삭제된 수신자는 placeholder로 표시(throw 없음, 수신자 수 보존)", async () => {
    const chat = plain({ alias: "Bob", speaker: { alias: "Bob" }, content: "secret", whisper: ["u1", "gone"] });
    const box = await append(chat, { whisper: true, hideWhisper: true });
    expect(box.querySelector(".chat-name")!.textContent).toBe("Bob\n→[RCP-u1,Unknown user]");
  });

  it("정상 수신자 전원 유효 → 기존과 동일", async () => {
    const chat = plain({ alias: "Bob", speaker: { alias: "Bob" }, content: "secret", whisper: ["u1", "u2"] });
    const box = await append(chat, { whisper: true, hideWhisper: true });
    expect(box.querySelector(".chat-name")!.textContent).toBe("Bob\n→[RCP-u1,RCP-u2]");
  });
});

describe("injectRuntimeScript", () => {
  it("head에 인터랙션 <script>를 주입하고 핵심 동작 토큰을 포함한다", () => {
    const doc = document.implementation.createHTMLDocument("t");
    injectRuntimeScript(doc);
    const scripts = doc.head.querySelectorAll("script");
    expect(scripts.length).toBe(1);
    const text = scripts[0].textContent ?? "";
    expect(text).toContain("dice-tooltip");
    expect(text).toContain("whisper-hidden");
    expect(text).toContain("collapsible");
  });
});

// 회귀 방지: 3개 generate* 경로가 각각 인터랙션 <script>를 정확히 한 번 주입하는지 end-to-end 검증.
// (<script> 텍스트가 템플릿에서 빠지고 injectRuntimeScript 런타임 주입으로 바뀌었으므로,
//  향후 어느 한 경로에서 주입 호출이 누락돼도 이 블록이 잡아낸다.)
describe("generate* 경로 — 인터랙션 <script> 주입 (회귀 방지)", () => {
  // populateChatDoc 는 .foundry-chat-container 를, getBaselineCss 는 첫 <style> 를 요구한다.
  const TEMPLATE =
    '<!DOCTYPE html><html><head><style>html,body{margin:0}</style></head><body><div class="foundry-chat-container"></div></body></html>';

  // createCssList/injectInlineCss 는 game.users 를 for..of 로 순회(사용자 색상 룰)하므로 iterable 필요.
  // 상단 전역 game.users 는 { get } 객체(비-iterable)라, 이 블록 동안만 빈 배열로 교체 후 복원한다.
  const origUsers = (globalThis as any).game.users;

  beforeEach(() => {
    (globalThis as any).game.users = [];
    // 두 템플릿 URL 모두 동일한 최소 HTML 로 응답. 코드가 쓰는 건 response.text() 뿐.
    vi.stubGlobal("fetch", vi.fn(async () => ({ text: async () => TEMPLATE })));
  });
  afterEach(() => {
    (globalThis as any).game.users = origUsers;
    vi.unstubAllGlobals();
  });

  // outerHTML 을 재파싱해 실제 <script> 엘리먼트 수를 센다. (단순 문자열 매칭은 스크립트 본문
  // 주석에 들어 있는 리터럴 "<script>" 까지 세어 오탐하므로, 엘리먼트 카운트가 견고하다.)
  function assertSingleInteractionScript(html: string) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const scripts = parsed.querySelectorAll("script");
    expect(scripts.length).toBe(1);
    const text = scripts[0].textContent ?? "";
    expect(text).toContain("dice-tooltip");
    expect(text).toContain("whisper-hidden");
    expect(text).toContain("collapsible");
  }

  it("generateSimpleHtmlFromChats (창 열기 경로)", async () => {
    const [html] = await generateSimpleHtmlFromChats([], { includeWhisper: false, hideWhisper: false });
    assertSingleInteractionScript(html);
  });

  it("generateHtmlFromChats (다운로드 경로)", async () => {
    const [html] = await generateHtmlFromChats([], { includeWhisper: false, hideWhisper: false });
    assertSingleInteractionScript(html);
  });

  it("generateIncrementalHtmlFromChats (누적 경로)", async () => {
    const [html] = await generateIncrementalHtmlFromChats([], { includeWhisper: false, hideWhisper: false });
    assertSingleInteractionScript(html);
  });
});
