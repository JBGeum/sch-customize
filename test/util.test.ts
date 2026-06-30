import { describe, it, expect, vi, afterEach } from "vitest";
import {
  hexToRgba,
  cleanImageFilename,
  filenameFromUrl,
  buildArchiveFilename,
  createDivWithClasses,
  appendChildren,
  extractPrivTalkFromContent,
  extractMessageContent,
  updateImageSources,
  getChatImageElement,
  getChatImageUrl,
  requestSaveTarget,
  writeToSaveTarget,
  zipInsideFolder,
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

describe("createDivWithClasses", () => {
  it("단일 클래스 div", () => {
    const el = createDivWithClasses("solo");
    expect(el.tagName).toBe("DIV");
    expect(el.classList.contains("solo")).toBe(true);
  });
  it("배열 클래스 + null/undefined 필터 + textContent", () => {
    const el = createDivWithClasses(["a", null, "b", undefined], "text");
    expect(el.classList.contains("a")).toBe(true);
    expect(el.classList.contains("b")).toBe(true);
    expect(el.textContent).toBe("text");
    expect(el.children.length).toBe(0);
  });
  it("isHtml=true → container > div + innerHTML", () => {
    const el = createDivWithClasses("msg", "<b>hi</b>", true);
    expect(el.classList.contains("container")).toBe(true);
    const inner = el.firstElementChild as HTMLElement;
    expect(inner.classList.contains("msg")).toBe(true);
    expect(inner.innerHTML).toBe("<b>hi</b>");
  });
});

describe("appendChildren", () => {
  it("모든 자식을 append", () => {
    const parent = document.createElement("div");
    const c1 = document.createElement("span");
    const c2 = document.createElement("span");
    appendChildren(parent, [c1, c2]);
    expect(parent.children.length).toBe(2);
  });
});

describe("extractPrivTalkFromContent", () => {
  it("div.pt:not(.priv_user) 의 innerHTML", () => {
    const html = `<div class="pt priv_user">name</div><div class="pt">body text</div>`;
    expect(extractPrivTalkFromContent(html)).toBe("body text");
  });
  it("pt 없으면 원본 반환", () => {
    const html = `<p>no pt here</p>`;
    expect(extractPrivTalkFromContent(html)).toBe(html);
  });
});

describe("extractMessageContent", () => {
  it("privtalk: message-content 내 pt 본문", () => {
    const el = document.createElement("div");
    el.innerHTML = `<div class="message-content"><div class="pt priv_user">n</div><div class="pt">PT body</div></div>`;
    expect(extractMessageContent(el, true)).toBe("PT body");
  });
  it("일반: flavor-text + message-content, exclude selector 제거", () => {
    const el = document.createElement("div");
    el.innerHTML =
      `<div class="message-header"><span class="flavor-text">Flav</span></div>` +
      `<div class="message-content">Body<h4 class="chat-portrait-text-content-name-generic chat-portrait-flexrow">X</h4></div>`;
    const out = extractMessageContent(el, false);
    expect(out).toContain(`<div class="flavor-text">Flav</div>`);
    expect(out).toContain("Body");
    expect(out).not.toContain("chat-portrait-text-content-name-generic");
  });
  it("content 없으면 outerHTML 폴백", () => {
    const el = document.createElement("div");
    el.className = "lonely";
    el.textContent = "hi";
    expect(extractMessageContent(el, false)).toContain("lonely");
  });
});

describe("updateImageSources", () => {
  it("chat-text img → images/, chat-image → portraits/", () => {
    const doc = new DOMParser().parseFromString(
      `<html><body>` +
        `<div class="chat-text"><img src="https://x.com/p/pic.png?w=64"></div>` +
        `<img class="chat-image" src="/actors/Hero.webp">` +
      `</body></html>`, "text/html");
    updateImageSources(doc);
    const ti = doc.querySelector(".chat-text img") as HTMLImageElement;
    const pi = doc.querySelector("img.chat-image") as HTMLImageElement;
    expect(ti.getAttribute("src")).toBe("images/pic.png");
    expect(pi.getAttribute("src")).toBe("portraits/Hero.webp");
  });
});

describe("getChatImageElement", () => {
  it("url + 무merge + 무privtalk → img.chat-image[src]", () => {
    const img = getChatImageElement("foo.png", false, false);
    expect(img).not.toBeNull();
    expect(img!.tagName).toBe("IMG");
    expect(img!.classList.contains("chat-image")).toBe(true);
    expect(img!.getAttribute("src")).toBe("foo.png");
  });
  it("merge → null", () => { expect(getChatImageElement("foo.png", true, false)).toBeNull(); });
  it("privtalk → null", () => { expect(getChatImageElement("foo.png", false, true)).toBeNull(); });
  it("무url → null", () => { expect(getChatImageElement(null, false, false)).toBeNull(); });
});

describe("getChatImageUrl", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("portrait flag + speaker.actor → actors.get(actor).img", () => {
    vi.stubGlobal("game", { actors: { get: (id: string) => (id === "a1" ? { img: "actor.png" } : null), getName: () => null } });
    const chat = { flags: { "chat-portrait": { src: "p.png" } }, speaker: { actor: "a1" } };
    expect(getChatImageUrl(chat)).toBe("actor.png");
  });
  it("portrait flag + actor 없음 → portrait.src 폴백", () => {
    vi.stubGlobal("game", { actors: { get: () => null, getName: () => null } });
    const chat = { flags: { "chat-portrait": { src: "p.png" } }, speaker: { actor: "missing" } };
    expect(getChatImageUrl(chat)).toBe("p.png");
  });
  it("named lookup → img", () => {
    vi.stubGlobal("game", { actors: { get: () => null, getName: (n: string) => (n === "Hero" ? { img: "named.png" } : null) } });
    const chat = { flags: {}, speaker: { alias: "Hero" } };
    expect(getChatImageUrl(chat)).toBe("named.png");
  });
  it("아무것도 없으면 null", () => {
    vi.stubGlobal("game", { actors: { get: () => null, getName: () => null } });
    const chat = { flags: {}, speaker: { alias: "Nobody" } };
    expect(getChatImageUrl(chat)).toBeNull();
  });
});

describe("requestSaveTarget", () => {
  afterEach(() => { delete (window as any).showSaveFilePicker; });
  it("picker 미지원 → data-uri", async () => {
    delete (window as any).showSaveFilePicker;
    expect(await requestSaveTarget("a.zip")).toEqual({ kind: "data-uri", filename: "a.zip" });
  });
  it("picker 성공 → file-handle", async () => {
    const handle = { name: "h" };
    (window as any).showSaveFilePicker = async () => handle;
    expect(await requestSaveTarget("a.zip")).toEqual({ kind: "file-handle", handle });
  });
  it("AbortError → null", async () => {
    (window as any).showSaveFilePicker = async () => { const e: any = new Error("x"); e.name = "AbortError"; throw e; };
    expect(await requestSaveTarget("a.zip")).toBeNull();
  });
  it("기타 error → data-uri", async () => {
    (window as any).showSaveFilePicker = async () => { throw new Error("boom"); };
    expect(await requestSaveTarget("a.zip")).toEqual({ kind: "data-uri", filename: "a.zip" });
  });
});

describe("writeToSaveTarget", () => {
  it("null target → false", async () => {
    expect(await writeToSaveTarget(null, new Blob(["x"]))).toBe(false);
  });
  it("file-handle → createWritable write/close + true", async () => {
    const writes: any[] = [];
    const writable = { write: async (b: any) => { writes.push(b); }, close: async () => { writes.push("closed"); } };
    const handle = { createWritable: async () => writable };
    const blob = new Blob(["data"]);
    const r = await writeToSaveTarget({ kind: "file-handle", handle }, blob);
    expect(r).toBe(true);
    expect(writes[0]).toBe(blob);
    expect(writes[1]).toBe("closed");
  });
});

describe("zipInsideFolder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeFakeZip() {
    const files: Record<string, unknown> = {};
    let folderCalls = 0;
    const folder = { file: (name: string, blob: unknown) => { files[name] = blob; } };
    return {
      zip: { folder: (_n: string) => { folderCalls++; return folder; } },
      files,
      folderCalls: () => folderCalls,
    };
  }

  it("모든 이미지를 cleaned filename 으로 fetch·add", async () => {
    const fetchMock = vi.fn(async (url: string) => ({ blob: async () => `blob:${url}` }));
    vi.stubGlobal("fetch", fetchMock);
    const { zip, files, folderCalls } = makeFakeZip();

    await zipInsideFolder(zip, ["http://x/a.png", "http://x/b.jpg"], "images");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(folderCalls()).toBe(1);
    expect(files["a.png"]).toBe("blob:http://x/a.png");
    expect(files["b.jpg"]).toBe("blob:http://x/b.jpg");
  });

  it("한 이미지 fetch 실패 시 로그+스킵, 나머지는 add", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("bad")) throw new Error("boom");
      return { blob: async () => `blob:${url}` };
    });
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { zip, files } = makeFakeZip();

    await zipInsideFolder(zip, ["http://x/good.png", "http://x/bad.png", "http://x/good2.png"], "images");

    expect(files["good.png"]).toBe("blob:http://x/good.png");
    expect(files["good2.png"]).toBe("blob:http://x/good2.png");
    expect(files["bad.png"]).toBeUndefined();
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it("같은 cleaned filename 충돌 시 삽입 순서상 마지막 blob 이 최종(직렬과 동일)", async () => {
    const fetchMock = vi.fn(async (url: string) => ({ blob: async () => `blob:${url}` }));
    vi.stubGlobal("fetch", fetchMock);
    const { zip, files } = makeFakeZip();

    // 두 url 모두 cleaned filename "img.png" 로 매핑
    await zipInsideFolder(zip, ["http://a/img.png", "http://b/img.png"], "images");

    expect(files["img.png"]).toBe("blob:http://b/img.png");
  });

  it("동시 in-flight 가 상한(6) 을 초과하지 않고, 병렬화되어 상한에 도달한다", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.fn((_url: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<{ blob: () => Promise<string> }>((resolve) => {
        // 마이크로태스크 뒤 resolve — 같은 청크의 fetch 들이 동시에 in-flight 가 되도록
        queueMicrotask(() => { inFlight--; resolve({ blob: async () => "b" }); });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { zip } = makeFakeZip();
    const urls = Array.from({ length: 13 }, (_, i) => `http://x/img${i}.png`);

    await zipInsideFolder(zip, urls, "images");

    expect(fetchMock).toHaveBeenCalledTimes(13);
    expect(maxInFlight).toBeLessThanOrEqual(6);
    expect(maxInFlight).toBe(6); // 13개 → 첫 청크가 정확히 6 동시 in-flight
  });
});
