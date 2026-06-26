import { describe, it, expect, vi, afterEach } from "vitest";
import {
  hexToRgba,
  cleanImageFilename,
  filenameFromUrl,
  buildArchiveFilename,
} from "../src/archive/util";

describe("hexToRgba", () => {
  it("#rrggbb 와 opacity 를 rgba 로 변환", () => {
    expect(hexToRgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });
  it("# 없는 hex 도 허용", () => {
    expect(hexToRgba("00ff00", 1)).toBe("rgba(0, 255, 0, 1)");
  });
  it("opacity 를 [0,1] 로 클램프", () => {
    expect(hexToRgba("#000000", 2)).toBe("rgba(0, 0, 0, 1)");
    expect(hexToRgba("#000000", -1)).toBe("rgba(0, 0, 0, 0)");
  });
});

describe("cleanImageFilename", () => {
  it("확장자 뒤 쿼리/트랜스폼 제거", () => {
    expect(cleanImageFilename("portrait.png?w=64&h=64")).toBe("portrait.png");
  });
  it("확장자만 있으면 그대로", () => {
    expect(cleanImageFilename("a.webp")).toBe("a.webp");
  });
  it("jpeg 가 jpg 보다 먼저 매칭되지 않음", () => {
    expect(cleanImageFilename("img.jpeg-thumb")).toBe("img.jpeg");
  });
  it("확장자 없으면 원본 반환", () => {
    expect(cleanImageFilename("noext")).toBe("noext");
  });
});

describe("filenameFromUrl", () => {
  it("절대 URL 의 파일명을 퍼센트 디코딩", () => {
    expect(filenameFromUrl("https://x.com/p/My%20Image.png")).toBe("My Image.png");
  });
  it("상대 경로의 파일명", () => {
    expect(filenameFromUrl("/a/b/c.webp")).toBe("c.webp");
  });
  it("빈 입력은 빈 문자열", () => {
    expect(filenameFromUrl("")).toBe("");
  });
});

describe("buildArchiveFilename", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("world 명의 금지문자를 _ 로 치환하고 형식을 만든다", () => {
    vi.stubGlobal("game", { world: { title: "Test/World:1" } });
    expect(buildArchiveFilename("log", "zip")).toMatch(/^log-\d{8}-Test_World_1\.zip$/);
  });
  it("world 명이 없으면 'world' 폴백", () => {
    vi.stubGlobal("game", { world: {} });
    expect(buildArchiveFilename("chat", "zip")).toMatch(/^chat-\d{8}-world\.zip$/);
  });
});
