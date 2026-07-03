import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildExportModeFormHtml,
  findExportForm,
  attachExportFormHandlers,
  readExportFormValues,
} from "../src/archive/export-form";

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as any).showDirectoryPicker;
  document.body.innerHTML = "";
});

describe("buildExportModeFormHtml", () => {
  it("지원 시 solo/directory/file-upload 라디오 + 모드별 설명 div + 파일 input(file-upload 설명 내)", () => {
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k }, settings: { get: () => false } });
    (window as any).showDirectoryPicker = () => {};
    const html = buildExportModeFormHtml();
    expect(html).toContain(`value="solo"`);
    expect(html).toContain(`value="directory"`);
    expect(html).toContain(`value="file-upload"`);
    expect(html).toContain(`class="sch-mode-desc" data-mode="solo"`);
    expect(html).toContain(`data-mode="file-upload"`);
    expect(html).toContain(`name="sch-existing-css"`);
    expect(html).toContain("width:24rem"); // 다이얼로그 가로 고정(텍스트 줄바꿈)
  });

  it("미지원 시 directory 라디오 없음", () => {
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k }, settings: { get: () => false } });
    delete (window as any).showDirectoryPicker;
    const html = buildExportModeFormHtml();
    expect(html).not.toContain(`value="directory"`);
    expect(html).toContain(`value="file-upload"`);
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

  it("저장된 모드(file-upload)를 프리선택(checked)", () => {
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k },
      settings: { get: (_m: string, k: string) => (k === "lastExportMode" ? "file-upload" : false) } });
    (window as any).showDirectoryPicker = () => {};
    const html = buildExportModeFormHtml();
    const fu = html.match(/<input[^>]*value="file-upload"[^>]*>/)?.[0] ?? "";
    const solo = html.match(/<input[^>]*value="solo"[^>]*>/)?.[0] ?? "";
    expect(fu).toContain("checked");
    expect(solo).not.toContain("checked");
  });
  it("저장 모드 directory인데 미지원 → solo 프리선택(폴백)", () => {
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k },
      settings: { get: (_m: string, k: string) => (k === "lastExportMode" ? "directory" : false) } });
    delete (window as any).showDirectoryPicker;
    const html = buildExportModeFormHtml();
    const solo = html.match(/<input[^>]*value="solo"[^>]*>/)?.[0] ?? "";
    expect(solo).toContain("checked");
  });
  it("GM 전용 제외 체크박스 존재", () => {
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k }, settings: { get: () => false } });
    const html = buildExportModeFormHtml();
    expect(html).toContain(`name="sch-exclude-gm-whisper"`);
  });
  it("excludeGmWhisper 저장값 true면 프리필(checked)", () => {
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k }, settings: { get: () => true } });
    const html = buildExportModeFormHtml();
    const gm = html.match(/<input[^>]*name="sch-exclude-gm-whisper"[^>]*>/)?.[0] ?? "";
    expect(gm).toContain("checked");
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
        <label><input type="radio" name="sch-export-mode" value="solo" checked></label>
        <div class="sch-mode-desc" data-mode="solo" style="display:none"></div>
        <label><input type="radio" name="sch-export-mode" value="directory"></label>
        <div class="sch-mode-desc" data-mode="directory" style="display:none"></div>
        <label><input type="radio" name="sch-export-mode" value="file-upload"></label>
        <div class="sch-mode-desc" data-mode="file-upload" style="display:none">
          <input type="file" name="sch-existing-css">
        </div>
      </div>`;
    return root;
  }
  function setMode(root: HTMLElement, mode: string) {
    const r = root.querySelector(`input[value="${mode}"]`) as HTMLInputElement;
    r.checked = true;
    r.dispatchEvent(new Event("change"));
  }
  const desc = (root: HTMLElement, mode: string) =>
    root.querySelector(`.sch-mode-desc[data-mode="${mode}"]`) as HTMLElement;

  it("선택한 모드 설명만 표시(초기 solo)", () => {
    const root = buildForm();
    attachExportFormHandlers(root);
    expect(desc(root, "solo").style.display).not.toBe("none");
    expect(desc(root, "directory").style.display).toBe("none");
    expect(desc(root, "file-upload").style.display).toBe("none");
  });
  it("file-upload 선택 → file-upload 설명만(파일 input 포함)", () => {
    const root = buildForm();
    attachExportFormHandlers(root);
    setMode(root, "file-upload");
    expect(desc(root, "file-upload").style.display).not.toBe("none");
    expect(desc(root, "solo").style.display).toBe("none");
    expect(desc(root, "file-upload").querySelector(`input[name="sch-existing-css"]`)).not.toBeNull();
  });
  it("directory 선택 → directory 설명만", () => {
    const root = buildForm();
    attachExportFormHandlers(root);
    setMode(root, "directory");
    expect(desc(root, "directory").style.display).not.toBe("none");
    expect(desc(root, "solo").style.display).toBe("none");
  });
});

describe("readExportFormValues", () => {
  function buildForm(mode: string, withFile?: { text: () => Promise<string> }) {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="sch-customize-export-form">
        <input type="radio" name="sch-export-mode" value="solo">
        <input type="radio" name="sch-export-mode" value="directory">
        <input type="radio" name="sch-export-mode" value="file-upload">
        <input type="checkbox" name="sch-include-whisper">
        <input type="checkbox" name="sch-hide-whisper">
        <input type="checkbox" name="sch-exclude-gm-whisper">
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
    expect(await readExportFormValues(buildForm("solo"))).toEqual({ mode: "solo", existingCssText: null, includeWhisper: false, hideWhisper: false, excludeGmWhisper: false });
  });
  it("directory + 무파일 → existingCssText null", async () => {
    expect(await readExportFormValues(buildForm("directory"))).toEqual({ mode: "directory", existingCssText: null, includeWhisper: false, hideWhisper: false, excludeGmWhisper: false });
  });
  it("file-upload + 파일 → 파일 텍스트", async () => {
    const root = buildForm("file-upload", { text: async () => "css-body" });
    expect(await readExportFormValues(root)).toEqual({ mode: "file-upload", existingCssText: "css-body", includeWhisper: false, hideWhisper: false, excludeGmWhisper: false });
  });
  it("directory + 파일 → existingCssText null (폴더가 소스)", async () => {
    const root = buildForm("directory", { text: async () => "css-body" });
    expect(await readExportFormValues(root)).toEqual({ mode: "directory", existingCssText: null, includeWhisper: false, hideWhisper: false, excludeGmWhisper: false });
  });
  it("체크박스 켜짐 → includeWhisper/hideWhisper true", async () => {
    const root = buildForm("solo");
    (root.querySelector(`input[name="sch-include-whisper"]`) as HTMLInputElement).checked = true;
    (root.querySelector(`input[name="sch-hide-whisper"]`) as HTMLInputElement).checked = true;
    expect(await readExportFormValues(root)).toEqual({ mode: "solo", existingCssText: null, includeWhisper: true, hideWhisper: true, excludeGmWhisper: false });
  });
  it("GM 전용 체크박스 켜짐 → excludeGmWhisper true", async () => {
    const root = buildForm("solo");
    (root.querySelector(`input[name="sch-exclude-gm-whisper"]`) as HTMLInputElement).checked = true;
    expect(await readExportFormValues(root)).toEqual({ mode: "solo", existingCssText: null, includeWhisper: false, hideWhisper: false, excludeGmWhisper: true });
  });
  it("폼 없으면 null", async () => {
    expect(await readExportFormValues({})).toBeNull();
  });
});
