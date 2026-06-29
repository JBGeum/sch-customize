import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function load(lang: string): Record<string, string> {
  return JSON.parse(readFileSync(resolve(process.cwd(), `public/languages/${lang}.json`), "utf-8"));
}

describe("i18n: dialog.download.error 키", () => {
  for (const lang of ["en", "ko"]) {
    it(`${lang}.json 에 존재하고 비어있지 않다`, () => {
      const v = load(lang)["sch-customize.dialog.download.error"];
      expect(typeof v).toBe("string");
      expect(v.trim().length).toBeGreaterThan(0);
    });
  }
});

describe("i18n: archive.whisperUnknownUser 키", () => {
  for (const lang of ["en", "ko"]) {
    it(`${lang}.json 에 존재하고 비어있지 않다`, () => {
      const v = load(lang)["sch-customize.archive.whisperUnknownUser"];
      expect(typeof v).toBe("string");
      expect(v.trim().length).toBeGreaterThan(0);
    });
  }
});

describe("i18n: dialog.open.error 키", () => {
  for (const lang of ["en", "ko"]) {
    it(`${lang}.json 에 존재하고 비어있지 않다`, () => {
      const v = load(lang)["sch-customize.dialog.open.error"];
      expect(typeof v).toBe("string");
      expect(v.trim().length).toBeGreaterThan(0);
    });
  }
});
