import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildExportModeFormHtml,
  findExportForm,
  attachExportFormHandlers,
  readExportFormValues,
} from "../src/archive/export-form";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("buildExportModeFormHtml", () => {
  it("radio 3개(solo checked) + 기존 CSS 섹션 + 파일 input", () => {
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k } });
    const html = buildExportModeFormHtml();
    expect(html).toContain(`name="sch-export-mode" value="solo"`);
    expect(html).toContain("checked");
    expect(html).toContain(`value="merge"`);
    expect(html).toContain(`value="full"`);
    expect(html).toContain("sch-existing-css-section");
    expect(html).toContain(`name="sch-existing-css"`);
  });
});

describe("findExportForm", () => {
  function formRoot() {
    const root = document.createElement("div");
    root.innerHTML = `<div class="sch-customize-export-form"></div>`;
    return root;
  }
  it("직접 querySelector", () => {
    expect(findExportForm(formRoot())?.classList.contains("sch-customize-export-form")).toBe(true);
  });
  it("rootEl.element 경유", () => {
    expect(findExportForm({ element: formRoot() })).not.toBeNull();
  });
  it("rootEl[0] 경유", () => {
    expect(findExportForm({ 0: formRoot() })).not.toBeNull();
  });
  it("document 폴백", () => {
    const f = document.createElement("div");
    f.className = "sch-customize-export-form";
    document.body.appendChild(f);
    expect(findExportForm(null)).not.toBeNull();
  });
});

describe("attachExportFormHandlers", () => {
  function buildForm() {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="sch-customize-export-form">
        <input type="radio" name="sch-export-mode" value="solo" checked>
        <input type="radio" name="sch-export-mode" value="merge">
        <input type="radio" name="sch-export-mode" value="full">
        <div class="sch-existing-css-section"></div>
      </div>`;
    return root;
  }
  function setMode(root: HTMLElement, mode: string) {
    const r = root.querySelector(`input[value="${mode}"]`) as HTMLInputElement;
    r.checked = true;
    r.dispatchEvent(new Event("change"));
  }
  it("solo→숨김, merge/full→표시 토글", () => {
    const root = buildForm();
    attachExportFormHandlers(root);
    const section = root.querySelector(".sch-existing-css-section") as HTMLElement;
    expect(section.style.display).toBe("none"); // 초기 solo
    setMode(root, "merge");
    expect(section.style.display).toBe("");
    setMode(root, "full");
    expect(section.style.display).toBe("");
    setMode(root, "solo");
    expect(section.style.display).toBe("none");
  });
});

describe("readExportFormValues", () => {
  function buildForm(mode: string, withFile?: { text: () => Promise<string> }) {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="sch-customize-export-form">
        <input type="radio" name="sch-export-mode" value="solo">
        <input type="radio" name="sch-export-mode" value="merge">
        <input type="radio" name="sch-export-mode" value="full">
        <input type="file" name="sch-existing-css">
      </div>`;
    (root.querySelector(`input[value="${mode}"]`) as HTMLInputElement).checked = true;
    if (withFile) {
      const fi = root.querySelector(`input[name="sch-existing-css"]`) as HTMLInputElement;
      Object.defineProperty(fi, "files", { value: [withFile], configurable: true });
    }
    return root;
  }
  it("solo + 무파일 → existingCssText null", async () => {
    expect(await readExportFormValues(buildForm("solo"))).toEqual({ mode: "solo", existingCssText: null });
  });
  it("merge + 무파일 → existingCssText null", async () => {
    expect(await readExportFormValues(buildForm("merge"))).toEqual({ mode: "merge", existingCssText: null });
  });
  it("merge + 파일 → 파일 텍스트", async () => {
    const root = buildForm("merge", { text: async () => "css-body" });
    expect(await readExportFormValues(root)).toEqual({ mode: "merge", existingCssText: "css-body" });
  });
  it("폼 없으면 null", async () => {
    expect(await readExportFormValues({})).toBeNull();
  });
});
