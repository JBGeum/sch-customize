import { describe, it, expect } from "vitest";
import { htmlToPlainText } from "../src/chitchat/plain-text";

describe("htmlToPlainText", () => {
  it("v14 ProseMirror <p> 래퍼를 벗겨 평문만 남긴다", () => {
    expect(htmlToPlainText("<p>안녕</p>")).toBe("안녕");
  });

  it("평문(v12/v13)은 그대로 통과", () => {
    expect(htmlToPlainText("안녕")).toBe("안녕");
  });

  it("~ 문자는 리터럴로 보존(A~ B~ — 원치 않는 취소선 방지)", () => {
    expect(htmlToPlainText("<p>A~ B~</p>")).toBe("A~ B~");
  });

  it("인라인 서식 태그는 제거하고 텍스트만 남긴다", () => {
    expect(htmlToPlainText("<p>안녕 <strong>철수</strong></p>")).toBe("안녕 철수");
  });

  it("HTML 엔티티는 디코드", () => {
    expect(htmlToPlainText("<p>a &amp; b</p>")).toBe("a & b");
    expect(htmlToPlainText("<p>a&lt;b</p>")).toBe("a<b");
  });

  it("앞뒤 공백은 트림", () => {
    expect(htmlToPlainText("<p>  안녕  </p>")).toBe("안녕");
  });
});
