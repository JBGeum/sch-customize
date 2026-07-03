import { describe, it, expect, vi, afterEach } from "vitest";
import { isDirectoryPickerSupported, readExistingCss, writeTextFile, writeImagesToDir } from "../src/archive/dir-target";

afterEach(() => { vi.unstubAllGlobals(); });

// 가짜 FileSystemDirectoryHandle — files/subdirs를 메모리에 캡처
function fakeDir(): any {
  const files: Record<string, any> = {};
  const subdirs: Record<string, any> = {};
  return {
    files, subdirs,
    async getFileHandle(name: string, opts?: any) {
      if (!(name in files) && !opts?.create) { const e: any = new Error("nf"); e.name = "NotFoundError"; throw e; }
      return {
        async getFile() { return { text: async () => String(files[name] ?? "") }; },
        async createWritable() { return { write: async (d: any) => { files[name] = d; }, close: async () => {} }; },
      };
    },
    async getDirectoryHandle(name: string) { subdirs[name] = subdirs[name] || fakeDir(); return subdirs[name]; },
  };
}

describe("isDirectoryPickerSupported", () => {
  it("window.showDirectoryPicker 유무로 판정", () => {
    vi.stubGlobal("window", {});
    expect(isDirectoryPickerSupported()).toBe(false);
    vi.stubGlobal("window", { showDirectoryPicker: () => {} });
    expect(isDirectoryPickerSupported()).toBe(true);
  });
});

describe("readExistingCss", () => {
  it("파일 있으면 텍스트, 없으면 null", async () => {
    const dir = fakeDir();
    expect(await readExistingCss(dir)).toBeNull();
    dir.files["chat-styles.css"] = "body{}";
    expect(await readExistingCss(dir)).toBe("body{}");
  });
});

describe("writeTextFile", () => {
  it("폴더에 텍스트 파일 기록(덮어쓰기)", async () => {
    const dir = fakeDir();
    await writeTextFile(dir, "chat-styles.css", "a{}");
    expect(dir.files["chat-styles.css"]).toBe("a{}");
    await writeTextFile(dir, "chat-styles.css", "b{}");
    expect(dir.files["chat-styles.css"]).toBe("b{}");
  });
});

describe("writeImagesToDir", () => {
  it("하위폴더에 fetch한 이미지 기록", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ blob: async () => new Blob([url]) })));
    const dir = fakeDir();
    await writeImagesToDir(dir, ["http://x/a.png"], "images");
    expect(Object.keys(dir.subdirs.images.files)).toContain("a.png");
  });
});
