import { describe, it, expect, beforeEach } from "vitest";
import { onRenderChatMessage, resetRenderState } from "../src/chitchat/render";
import {
  resolveMessageStyle,
  resolveAuthorId,
  speakerKey,
  whisperKey,
  shouldMergeBaseMessage,
  decideRounding,
  classForGrouping,
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
  document.body.appendChild(el); // 실제 Foundry처럼 로그 DOM에 부착(연속 판정의 isConnected 가드용)
  onRenderChatMessage(msg, el);
  return el;
}

beforeEach(() => {
  resetRenderState();
  document.body.innerHTML = "";
  settings.privTalkMerge = true;
  settings.baseMessageMerge = true;
  settings.privTalkSpeakerLineChange = false; // false → speaker-inline 부착
});

describe("잡담 연속 그룹화", () => {
  it("priv_talk user-{id} 는 author-first (v13 정답, .author 우선)", () => {
    const msg = {
      flags: { "sch-customize": { priv_talk: true } },
      author: { id: "A" }, user: { id: "U" },
      speaker: { alias: "x" }, content: "hi",
    } as any;
    const el = render(msg);
    expect(el.classList.contains("user-A")).toBe(true);
    expect(el.classList.contains("user-U")).toBe(false);
  });

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

  // 특성화(의도 핀): 서로 다른 유저의 잡담도 한 박스로 묶인다.
  // 잡담은 shouldMergeBaseMessage(=whisper 검사)를 타지 않고 user 무관 연속 그룹화하며,
  // user 배경색으로 구별된다. 이 동작은 사용자 확정 사항이므로 회귀로 깨지면 안 됨.
  it("서로 다른 유저의 잡담도 연속이면 top/end 로 merge (cross-user, 의도)", () => {
    const e1 = render(priv("1"));
    const e2 = render(priv("2"));
    expect(e1.classList.contains("top")).toBe(true);
    expect(e2.classList.contains("end")).toBe(true);
    expect(e1.classList.contains("user-1")).toBe(true);
    expect(e2.classList.contains("user-2")).toBe(true);
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

describe("편집 재렌더(in-place) — stale state merge 방지 (헤더 유지)", () => {
  function baseId(id: string, style: number, authorId: string, speaker: unknown) {
    return { id, flags: {}, style, author: { id: authorId }, speaker } as any;
  }
  function renderId(msg: any): HTMLElement {
    const el = makeEl();
    el.setAttribute("data-message-id", msg.id);
    document.body.appendChild(el);
    onRenderChatMessage(msg, el);
    return el;
  }

  it("편집 재렌더는 detached 훅→삽입 후 실제 이웃으로 재그룹(stale merge로 헤더 안 사라짐)", async () => {
    const m1 = baseId("m1", 0, "A", { actor: "a" }); // 화자 A (단독)
    const m2 = baseId("m2", 0, "B", { actor: "b" }); // 화자 B (그룹 시작)
    const m3 = baseId("m3", 0, "B", { actor: "b" }); // 화자 B (그룹 끝)
    (globalThis as any).game.messages = { get: (id: string) => ({ m1, m2, m3 } as any)[id] };

    const e1 = renderId(m1);
    const e2 = renderId(m2);
    const e3 = renderId(m3);
    // 초기 순차 렌더: e2=top, e3=end (B 그룹 시작/끝). state.lastBaseMsg=e3(B).
    expect(e2.classList.contains("top")).toBe(true);
    expect(e3.classList.contains("end")).toBe(true);

    // m2 편집 → Foundry는 새 엘리먼트를 detached(로그 밖)에서 렌더하며 훅 발화.
    const fresh = makeEl();
    fresh.setAttribute("data-message-id", "m2");
    document.createElement("div").appendChild(fresh); // temp 컨테이너 = 로그에 미연결
    onRenderChatMessage(m2, fresh);
    // 훅 시점엔 stale merge로 end가 붙지 않아야 한다(즉시 클래스 없음).
    expect(fresh.classList.contains("end")).toBe(false);

    // Foundry가 로그의 e2 자리에 삽입.
    e2.replaceWith(fresh);
    await Promise.resolve(); // microtask flush → 지연 재그룹 실행
    await Promise.resolve();

    // 실제 이웃(e1=A 비머지, e3=B 머지)으로 재그룹 → top → 헤더 표시.
    expect(fresh.classList.contains("end")).toBe(false);
    expect(fresh.classList.contains("top")).toBe(true);

    (globalThis as any).game.messages = undefined; // 다른 테스트 격리
  });
});

describe("잡담 편집/재렌더(in-place) — 실제 DOM 이웃 기준 재그룹", () => {
  function privId(id: string, userId: string) {
    return {
      id,
      flags: { "sch-customize": { priv_talk: true } },
      user: { id: userId },
      speaker: { alias: "U" + userId },
      content: "hi",
    } as any;
  }
  function renderPrivId(msg: any): HTMLElement {
    const el = makeEl();
    el.setAttribute("data-message-id", msg.id);
    document.body.appendChild(el);
    onRenderChatMessage(msg, el);
    return el;
  }

  it("가운데 잡담 재렌더는 순차 state가 아니라 실제 이웃 기준으로 middle 유지", async () => {
    const p1 = privId("p1", "1");
    const p2 = privId("p2", "1");
    const p3 = privId("p3", "1");
    (globalThis as any).game.messages = { get: (id: string) => ({ p1, p2, p3 } as any)[id] };

    const e1 = renderPrivId(p1);
    const e2 = renderPrivId(p2);
    const e3 = renderPrivId(p3);
    expect(e1.classList.contains("top")).toBe(true);
    expect(e2.classList.contains("middle")).toBe(true);
    expect(e3.classList.contains("end")).toBe(true);

    // p2 재렌더(편집 / 초기 로드 시 Foundry 재렌더): 새 el을 detached로 렌더한 뒤 e2 자리에 삽입.
    const fresh = makeEl();
    fresh.setAttribute("data-message-id", "p2");
    document.createElement("div").appendChild(fresh); // 로그 밖 임시 컨테이너(미연결)
    onRenderChatMessage(p2, fresh);
    e2.replaceWith(fresh);
    await Promise.resolve();
    await Promise.resolve();

    // 실제 이웃(e1·e3 모두 priv_talk) → middle. 순차 state 오염으로 end/none 받으면 회귀.
    expect(fresh.classList.contains("priv_talk")).toBe(true);
    expect(fresh.classList.contains("middle")).toBe(true);
    expect(fresh.classList.contains("end")).toBe(false);
    // 잡담 마크업도 재적용(헤더 숨김 + 본문 교체).
    expect(fresh.querySelector(".pt.priv_user")?.textContent).toBe("U1");
    expect((fresh.querySelector("header") as HTMLElement)?.style.display).toBe("none");

    (globalThis as any).game.messages = undefined;
  });

  it("끝 잡담 재렌더는 end 유지(top/middle 오염 없음)", async () => {
    const p1 = privId("p1", "1");
    const p2 = privId("p2", "1");
    (globalThis as any).game.messages = { get: (id: string) => ({ p1, p2 } as any)[id] };

    const e1 = renderPrivId(p1);
    const e2 = renderPrivId(p2);
    expect(e1.classList.contains("top")).toBe(true);
    expect(e2.classList.contains("end")).toBe(true);

    // e2 재렌더 → 실제 이웃(prev=e1 priv_talk, next=none) → end.
    const fresh = makeEl();
    fresh.setAttribute("data-message-id", "p2");
    document.createElement("div").appendChild(fresh);
    onRenderChatMessage(p2, fresh);
    e2.replaceWith(fresh);
    await Promise.resolve();
    await Promise.resolve();

    expect(fresh.classList.contains("end")).toBe(true);
    expect(fresh.classList.contains("top")).toBe(false);
    expect(fresh.classList.contains("middle")).toBe(false);

    (globalThis as any).game.messages = undefined;
  });
});

describe("새로고침(detached 배치 렌더) — 삽입 후 그룹화 유지", () => {
  // Foundry는 새로고침 시 메시지를 로그 밖(detached)에서 렌더하며 훅을 발화한 뒤 삽입한다.
  // 훅 시점 isConnected=false라 예전엔 merge가 스킵돼 그룹이 다 풀렸다 — 삽입 후 판정으로 수정.
  function renderDetached(msg: any): HTMLElement {
    const el = makeEl();
    document.createElement("div").appendChild(el); // 로그 밖 임시 컨테이너(미연결)
    onRenderChatMessage(msg, el);
    return el;
  }

  it("일반: detached로 훅 발화된 연속 같은 화자, 삽입 후 top/end merge", async () => {
    const sp = { actor: "a" };
    const e1 = renderDetached(base(0, "A", sp));
    const e2 = renderDetached(base(0, "A", sp));
    // 삽입 전에는 그룹 클래스 미적용
    expect(e1.classList.contains("top")).toBe(false);
    expect(e2.classList.contains("end")).toBe(false);
    // Foundry가 로그에 순서대로 삽입
    document.body.appendChild(e1);
    document.body.appendChild(e2);
    await Promise.resolve();
    await Promise.resolve();
    // 삽입 후 그룹화 적용(라이브와 동일)
    expect(e1.classList.contains("top")).toBe(true);
    expect(e2.classList.contains("end")).toBe(true);
  });

  it("잡담: detached 연속 잡담도 삽입 후 top/end", async () => {
    const e1 = renderDetached(priv("1"));
    const e2 = renderDetached(priv("1"));
    document.body.appendChild(e1);
    document.body.appendChild(e2);
    await Promise.resolve();
    await Promise.resolve();
    expect(e1.classList.contains("top")).toBe(true);
    expect(e2.classList.contains("end")).toBe(true);
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

describe("log clear 후 stale 상태 (직전 엘리먼트 detach)", () => {
  it("일반: clear 후 같은 화자 첫 메시지는 merge 안 됨 (헤더 유지)", () => {
    const sp = { actor: "a" };
    const e1 = render(base(0, "A", sp));
    e1.remove(); // 로그 clear로 직전 메시지 엘리먼트가 DOM에서 제거됨
    const e2 = render(base(0, "A", sp)); // 같은 author/speaker
    expect(e2.classList.contains("end")).toBe(false);
    expect(e2.classList.contains("middle")).toBe(false);
  });
  it("잡담: clear 후 첫 잡담도 stale 엘리먼트와 merge 안 됨", () => {
    const e1 = render(priv("1"));
    e1.remove();
    const e2 = render(priv("1"));
    expect(e2.classList.contains("end")).toBe(false);
    expect(e2.classList.contains("top")).toBe(false);
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
  it("둘 다 없으면 undefined", () => expect(resolveAuthorId({})).toBeUndefined());
});

describe("speakerKey", () => {
  it("actor 우선", () => expect(speakerKey({ actor: "a", token: "t", alias: "x" })).toBe("a"));
  it("actor 없으면 token", () => expect(speakerKey({ token: "t" })).toBe("t"));
  it("token 없으면 alias", () => expect(speakerKey({ alias: "x" })).toBe("x"));
  it("전부 없으면 빈 문자열", () => expect(speakerKey({})).toBe(""));
});

describe("whisperKey", () => {
  it("공개(whisper 없음)는 빈 문자열", () => expect(whisperKey({})).toBe(""));
  it("빈 배열도 빈 문자열", () => expect(whisperKey({ whisper: [] })).toBe(""));
  it("수신자 순서 무관하게 정렬 후 join", () => expect(whisperKey({ whisper: ["b", "a"] })).toBe("a,b"));
  it("id 를 문자열로 정규화", () => expect(whisperKey({ whisper: [2, 1] })).toBe("1,2"));
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

describe("shouldMergeBaseMessage — 귓속말 수신자", () => {
  const wmk = (whisper: string[]) =>
    ({ style: 0, author: { id: "A" }, speaker: { actor: "a" }, whisper });
  it("공개 + 귓속말은 merge 안 됨 (헤더 수신자정보 보존)", () =>
    expect(shouldMergeBaseMessage(wmk([]), wmk(["x"]), false)).toBe(false));
  it("수신자 다른 귓속말끼리 merge 안 됨", () =>
    expect(shouldMergeBaseMessage(wmk(["x"]), wmk(["y"]), false)).toBe(false));
  it("같은 수신자 귓속말끼리는 merge (순서 무관)", () =>
    expect(shouldMergeBaseMessage(wmk(["x", "y"]), wmk(["y", "x"]), false)).toBe(true));
});

describe("classForGrouping", () => {
  it("앞뒤 모두 머지 → middle", () => expect(classForGrouping(true, true)).toBe("middle"));
  it("앞만 머지 → end", () => expect(classForGrouping(true, false)).toBe("end"));
  it("뒤만 머지 → top", () => expect(classForGrouping(false, true)).toBe("top"));
  it("둘 다 아님 → null(단독)", () => expect(classForGrouping(false, false)).toBeNull());
});

describe("decideRounding", () => {
  it("prevHasEnd=true → end→middle, curr end", () =>
    expect(decideRounding(true)).toEqual({ prevRemove: ["end"], prevAdd: ["middle"], currAdd: ["end"] }));
  it("prevHasEnd=false → prev top, curr end", () =>
    expect(decideRounding(false)).toEqual({ prevRemove: [], prevAdd: ["top"], currAdd: ["end"] }));
});
