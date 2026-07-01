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
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k }, settings: { get: () => false } });
    const html = buildExportModeFormHtml();
    expect(html).toContain(`name="sch-export-mode" value="solo"`);
    expect(html).toContain(`value="merge"`);
    expect(html).toContain(`value="full"`);
    expect(html).toContain("sch-existing-css-section");
    expect(html).toContain(`name="sch-existing-css"`);
  });

  it("귓속말 체크박스 2개 존재", () => {
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k }, settings: { get: () => false } });
    const html = buildExportModeFormHtml();
    expect(html).toContain(`name="sch-include-whisper"`);
    expect(html).toContain(`name="sch-hide-whisper"`);
  });

  it("저장값 true면 체크박스 프리필(checked)", () => {
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k }, settings: { get: () => true } });
    const html = buildExportModeFormHtml();
    const inc = html.match(/<input[^>]*name="sch-include-whisper"[^>]*>/)?.[0] ?? "";
    const hide = html.match(/<input[^>]*name="sch-hide-whisper"[^>]*>/)?.[0] ?? "";
    expect(inc).toContain("checked");
    expect(hide).toContain("checked");
  });

  it("저장값 false면 미체크", () => {
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k }, settings: { get: () => false } });
    const html = buildExportModeFormHtml();
    const inc = html.match(/<input[^>]*name="sch-include-whisper"[^>]*>/)?.[0] ?? "";
    expect(inc).not.toContain("checked");
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
  it("merge만 기존CSS 섹션 표시, solo/full은 숨김", () => {
    const root = buildForm();
    attachExportFormHandlers(root);
    const section = root.querySelector(".sch-existing-css-section") as HTMLElement;
    expect(section.style.display).toBe("none"); // 초기 solo
    setMode(root, "merge");
    expect(section.style.display).toBe("");
    setMode(root, "full");
    expect(section.style.display).toBe("none");
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
        <input type="checkbox" name="sch-include-whisper">
        <input type="checkbox" name="sch-hide-whisper">
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
    expect(await readExportFormValues(buildForm("solo"))).toEqual({ mode: "solo", existingCssText: null, includeWhisper: false, hideWhisper: false });
  });
  it("merge + 무파일 → existingCssText null", async () => {
    expect(await readExportFormValues(buildForm("merge"))).toEqual({ mode: "merge", existingCssText: null, includeWhisper: false, hideWhisper: false });
  });
  it("merge + 파일 → 파일 텍스트", async () => {
    const root = buildForm("merge", { text: async () => "css-body" });
    expect(await readExportFormValues(root)).toEqual({ mode: "merge", existingCssText: "css-body", includeWhisper: false, hideWhisper: false });
  });
  it("full + 파일 → existingCssText null (누적 안 함)", async () => {
    const root = buildForm("full", { text: async () => "css-body" });
    expect(await readExportFormValues(root)).toEqual({ mode: "full", existingCssText: null, includeWhisper: false, hideWhisper: false });
  });
  it("체크박스 켜짐 → includeWhisper/hideWhisper true", async () => {
    const root = buildForm("solo");
    (root.querySelector(`input[name="sch-include-whisper"]`) as HTMLInputElement).checked = true;
    (root.querySelector(`input[name="sch-hide-whisper"]`) as HTMLInputElement).checked = true;
    expect(await readExportFormValues(root)).toEqual({ mode: "solo", existingCssText: null, includeWhisper: true, hideWhisper: true });
  });
  it("폼 없으면 null", async () => {
    expect(await readExportFormValues({})).toBeNull();
  });
});
