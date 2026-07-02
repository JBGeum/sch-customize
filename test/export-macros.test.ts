import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const load = (f: string) => JSON.parse(readFileSync(`packs/_source/macros/${f}`, "utf8"));

describe("export 매크로 소스", () => {
  it("open-log: script 타입 + openChatArchive 호출 + 16자 _id", () => {
    const m = load("open-log.json");
    expect(m.type).toBe("script");
    expect(m.name).toBeTruthy();
    expect(m._id).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(m.command).toContain("openChatArchive");
    expect(m.command).toContain("sch-customize");
    expect(m._key).toBe("!macros!" + m._id);
  });
  it("download: script 타입 + openExportDialog 호출 + 16자 _id", () => {
    const m = load("download.json");
    expect(m.type).toBe("script");
    expect(m._id).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(m.command).toContain("openExportDialog");
    expect(m._key).toBe("!macros!" + m._id);
  });
});
