import { describe, it, expect, vi, afterEach } from "vitest";

// dir-target 부분 모킹: 실제 write 함수는 유지, getArchiveDirectory만 가짜 폴더 반환
vi.mock("../src/archive/dir-target", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/archive/dir-target")>();
  return { ...actual, getArchiveDirectory: vi.fn() };
});

import { exportIncrementalToDirectory } from "../src/archive/export";
import { getArchiveDirectory } from "../src/archive/dir-target";

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

const TEMPLATE = `<!DOCTYPE html><html><head><style>html,body{margin:0}</style><link rel="stylesheet" href="chat-styles.css"></head><body><div class="foundry-chat-container"></div></body></html>`;

afterEach(() => { vi.unstubAllGlobals(); });

describe("exportIncrementalToDirectory", () => {
  it("폴더에 chat-styles.css + 날짜시각 html 기록", async () => {
    const dir = fakeDir();
    (getArchiveDirectory as any).mockResolvedValue(dir);
    vi.stubGlobal("fetch", vi.fn(async () => ({ text: async () => TEMPLATE, blob: async () => new Blob(["x"]) })));
    vi.stubGlobal("game", { users: [], world: { title: "W", id: "w1" }, i18n: { localize: (k: string) => k } });
    (globalThis as any).ui = { notifications: { info: vi.fn() } };

    await exportIncrementalToDirectory([], { includeWhisper: false, hideWhisper: false, excludeGmWhisper: false });

    expect("chat-styles.css" in dir.files).toBe(true);
    expect(Object.keys(dir.files).some(n => /^chat-log-\d{8}-\d{4}-W\.html$/.test(n))).toBe(true);
  });

  it("getArchiveDirectory가 null이면 아무 것도 안 씀(취소)", async () => {
    vi.stubGlobal("game", { world: { id: "w1" } });
    (getArchiveDirectory as any).mockResolvedValue(null);
    await expect(exportIncrementalToDirectory([], { includeWhisper: false, hideWhisper: false, excludeGmWhisper: false })).resolves.toBeUndefined();
  });
});
