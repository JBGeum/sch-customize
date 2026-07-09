import { describe, it, expect } from "vitest";
import { matchChitchatTrigger } from "../src/chitchat/trigger";

// 기본 트리거: /pt + 백틱 + ! + 커스텀 기본 /p
const ALIASES = ["/pt", "`", "!", "/p"];

describe("matchChitchatTrigger", () => {
  it("기호/백틱 트리거는 공백 없이 즉시 매칭", () => {
    expect(matchChitchatTrigger("!안녕", ALIASES)).toEqual({ body: "안녕" });
    expect(matchChitchatTrigger("`안녕", ALIASES)).toEqual({ body: "안녕" });
  });

  it("슬래시 트리거는 뒤 공백을 요구", () => {
    expect(matchChitchatTrigger("/pt 안녕", ALIASES)).toEqual({ body: "안녕" });
    expect(matchChitchatTrigger("/p 안녕", ALIASES)).toEqual({ body: "안녕" });
  });

  it("슬래시 트리거에 공백 없으면 매칭 안 함", () => {
    expect(matchChitchatTrigger("/pt안녕", ALIASES)).toBeNull();
    expect(matchChitchatTrigger("/ptell", ALIASES)).toBeNull();
  });

  it("긴 트리거 우선: 접두가 겹치면 긴 쪽을 채택", () => {
    // "!"와 "!!"가 모두 있으면 "!!공지"는 "!!"로 매칭(body "공지"),
    // "!"로 잡혀 body "!공지"가 되면 안 된다.
    expect(matchChitchatTrigger("!!공지", ["!", "!!"])).toEqual({ body: "공지" });
  });

  it("body가 공백뿐이면 트리거 안 함(빈 잡담 방지)", () => {
    expect(matchChitchatTrigger("!", ALIASES)).toBeNull();
    expect(matchChitchatTrigger("!   ", ALIASES)).toBeNull();
    expect(matchChitchatTrigger("/pt ", ALIASES)).toBeNull();
    expect(matchChitchatTrigger("/pt    ", ALIASES)).toBeNull();
  });

  it("일반 메시지는 매칭 안 함", () => {
    expect(matchChitchatTrigger("안녕하세요", ALIASES)).toBeNull();
    expect(matchChitchatTrigger("hello world", ALIASES)).toBeNull();
  });

  it("커스텀 비슬래시 alias는 즉시 매칭", () => {
    expect(matchChitchatTrigger(";밀담", [";"])).toEqual({ body: "밀담" });
  });

  it("빈 문자열/중복 alias는 무시", () => {
    expect(matchChitchatTrigger("!hi", ["", "!", "!"])).toEqual({ body: "hi" });
  });

  // v14: ProseMirror 채팅 에디터는 입력을 HTML로 감싼다(예: "<p>`안녕</p>").
  // 평문(v12/v13)과 HTML(v14)을 모두 인식해야 한다.
  describe("v14 ProseMirror HTML 래핑", () => {
    it("<p>로 감싼 기호/백틱 트리거를 인식하고 감싼 태그를 보존", () => {
      expect(matchChitchatTrigger("<p>!안녕</p>", ALIASES)).toEqual({ body: "<p>안녕</p>" });
      expect(matchChitchatTrigger("<p>`안녕</p>", ALIASES)).toEqual({ body: "<p>안녕</p>" });
    });

    it("<p>로 감싼 슬래시 트리거(뒤 공백 포함)를 인식", () => {
      expect(matchChitchatTrigger("<p>/pt 안녕</p>", ALIASES)).toEqual({ body: "<p>안녕</p>" });
    });

    it("<p> 안 텍스트가 트리거로 시작하지 않으면 매칭 안 함", () => {
      expect(matchChitchatTrigger("<p>안녕하세요</p>", ALIASES)).toBeNull();
    });

    it("트리거만 있고 본문 텍스트가 비면 트리거 안 함(빈 잡담 방지)", () => {
      expect(matchChitchatTrigger("<p>!</p>", ALIASES)).toBeNull();
      expect(matchChitchatTrigger("<p>! </p>", ALIASES)).toBeNull();
      expect(matchChitchatTrigger("<p>!<br></p>", ALIASES)).toBeNull();
    });

    it("본문 안의 서식 태그(<strong> 등)는 body에 보존", () => {
      expect(matchChitchatTrigger("<p>!안녕 <strong>철수</strong></p>", ALIASES))
        .toEqual({ body: "<p>안녕 <strong>철수</strong></p>" });
    });
  });
});
