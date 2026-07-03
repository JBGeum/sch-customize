import { describe, it, expect } from "vitest";
import {
  buildEditFormHtml,
  readEditFormValue,
  buildEditUpdate,
} from "../src/chat-edit/dialog";

describe("buildEditFormHtml", () => {
  it("에디터 마운트 컨테이너(.sch-edit-form)를 포함", () => {
    const html = buildEditFormHtml();
    expect(html).toContain("sch-edit-form");
  });
});

describe("readEditFormValue", () => {
  it("prose-mirror 엘리먼트의 value를 읽는다", () => {
    const root = document.createElement("div");
    const pm = document.createElement("prose-mirror");
    (pm as any).value = "수정된 내용";
    root.appendChild(pm);
    expect(readEditFormValue(root)).toBe("수정된 내용");
  });
  it("에디터가 없으면 빈 문자열", () => {
    expect(readEditFormValue(document.createElement("div"))).toBe("");
  });
});

describe("buildEditUpdate", () => {
  it("content + edited flag(dotted key) 포함", () => {
    const u = buildEditUpdate("새 내용");
    expect(u.content).toBe("새 내용");
    expect(u["flags.sch-customize.edited"]).toBe(true);
  });
});
