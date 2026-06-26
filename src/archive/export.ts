/**
 * Chat 메시지 컬렉션을 HTML 문서로 변환하는 메인 파이프라인.
 *
 *  - `downloadArchiveFile(chats)`        → 단독 zip (CSS 인라인, 자기완결)
 *  - `downloadIncrementalArchive(chats)` → 누적 zip (외부 CSS 링크, 기존 chat-styles.css와 union 머지 가능)
 *  - `openChatArchive(chats)`            → 새 브라우저 창에 단독 HTML로 열기
 *
 * 단독/창열기 모드는 `template/chat-archive-template.html`(인라인 `<style>` 포함)을,
 * 누적 모드는 `template/chat-archive-template-incremental.html`(`<link>`만 포함)을 로드한다.
 * 누적 모드의 chat-styles.css는 단독 템플릿의 baseline + `createCssList`로 수집된 동적 CSS를
 * 합친 뒤, `existingCssText`가 제공되면 `mergeCss`로 union 머지한 결과를 사용한다.
 */

import JSZip from "jszip";
import { MODULE_ID, TEMPLATE_BASE } from "../constants";
import { renderChatMessageElement, callRenderChatMessageHooks, isPrivTalkMessage } from "../compat/foundry";
import {
  requestSaveTarget,
  writeToSaveTarget,
  buildArchiveFilename,
  zipInsideFolder,
  createDivWithClasses,
  appendChildren,
  getChatImageUrl,
  getChatImageElement,
  extractPrivTalkFromContent,
  extractMessageContent,
  updateImageSources,
} from "./util";
import { createCssList } from "./css";
import { mergeCss } from "./css-merge";

const TEMPLATE_PATH = `${TEMPLATE_BASE}/chat-archive-template.html`;
const INCREMENTAL_TEMPLATE_PATH = `${TEMPLATE_BASE}/chat-archive-template-incremental.html`;
const SHARED_CSS_FILENAME = "chat-styles.css";

/**
 * 기존(단독) 템플릿의 `<style>` 블록 내용을 그대로 추출해 baseline CSS로 사용한다.
 */
async function getBaselineCss(): Promise<string> {
  try {
    const response = await fetch(TEMPLATE_PATH);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const styleEl = doc.querySelector("style");
    return styleEl ? styleEl.textContent || "" : "";
  } catch (e) {
    console.warn("[chat-tailor] baseline CSS 추출 실패:", e);
    return "";
  }
}

/**
 * 채팅 메시지들을 zip(HTML + images/ + portraits/)으로 패키징한 Blob을 반환.
 * 저장 동작과 분리되어 있어 테스트/재사용이 용이하다.
 */
async function packageChatsToZipBlob(chats: any[]): Promise<Blob> {
  const [htmlContent, contentImg, portraitImg] = await generateHtmlFromChats(chats);

  const zip = new JSZip();
  await zipInsideFolder(zip, contentImg, "images");
  await zipInsideFolder(zip, portraitImg, "portraits");
  zip.file("chat.html", htmlContent);

  return zip.generateAsync({ type: "blob" });
}

/**
 * 채팅 로그를 zip 파일로 저장한다.
 *
 * 처리 순서 — *순서가 중요*:
 *   1. `buildArchiveFilename`   — `chat-log-yyyyMMdd-worldName.zip` 파일명 생성
 *   2. `requestSaveTarget`      — 사용자 제스처가 살아 있는 동안 picker 호출 → 핸들 확보
 *   3. `packageChatsToZipBlob`  — 메시지 → Blob 변환 (무거운 작업, 사용자가 picker에서
 *                                 위치 선택하는 동안 백그라운드로 진행)
 *   4. `writeToSaveTarget`      — 핸들에 blob 기록
 *
 * picker를 *먼저* 호출하지 않으면 zip 생성 후 호출 시점에 user gesture가 만료되어
 * `about:blank#blocked` 차단이 발생할 수 있다.
 */
export async function downloadArchiveFile(chats: any[]): Promise<void> {
  const filename = buildArchiveFilename("chat-log", "zip");
  const target = await requestSaveTarget(filename);
  if (!target) return;

  const blob = await packageChatsToZipBlob(chats);
  await writeToSaveTarget(target, blob);
}

/**
 * 누적 export — 외부 CSS 링크 방식 zip.
 *
 * zip 구성:
 *   chat-styles.css                          ← (선택) 기존 CSS와 union 머지된 결과
 *   chat-log-yyyyMMdd-{world}.html           ← 외부 CSS 링크
 *   images/...
 *   portraits/...
 *
 * 같은 폴더에 챕터별 zip을 차례로 풀면 HTML은 챕터별 보존, CSS와 이미지는 폴더 단위 덮어쓰기로 갱신된다.
 *
 * @param {Array} chats
 * @param {object} [opts]
 * @param {'filtered'|'full'} [opts.mode='filtered']
 * @param {string|null} [opts.existingCssText=null] - 머지 대상 기존 chat-styles.css 텍스트
 */
export async function downloadIncrementalArchive(chats: any[], opts: { mode?: "filtered" | "full"; existingCssText?: string | null } = {}): Promise<void> {
  const { mode = "filtered", existingCssText = null } = opts;

  // user gesture가 살아있는 동안 picker를 *먼저* 호출 — 사용자가 위치를 선택하는
  // 시간 동안 백그라운드로 무거운 generate/merge/zip 작업이 진행된다.
  const filename = buildArchiveFilename("chat-log-incremental", "zip");
  const target = await requestSaveTarget(filename);
  if (!target) return;

  const [htmlContent, contentImg, portraitImg, cssText] =
    await generateIncrementalHtmlFromChats(chats, { mode, existingCssText });

  const zip = new JSZip();
  await zipInsideFolder(zip, contentImg, "images");
  await zipInsideFolder(zip, portraitImg, "portraits");
  zip.file(SHARED_CSS_FILENAME, cssText);
  zip.file(buildArchiveFilename("chat-log", "html"), htmlContent);

  const blob = await zip.generateAsync({ type: "blob" });
  await writeToSaveTarget(target, blob);
}

/**
 * 채팅 로그를 별도 창에서 열기 — 이미지 zip 없이 인라인 src 그대로 사용.
 *
 * 구현 메모:
 *  - `window.open(..., "_blank")`은 **사용자 제스처(user activation)가 살아 있을 때만**
 *    팝업 차단을 우회한다. HTML 생성(`generateSimpleHtmlFromChats`)이 수 초 이상 걸리면
 *    그 사이 user activation이 만료되어 새 탭이 `about:blank#blocked`로 차단된다.
 *  - 그래서 무거운 작업 *전에* 빈 창을 먼저 열어 핸들을 확보하고, 로딩 안내를 표시한 뒤,
 *    HTML이 준비되면 같은 창의 document를 갈아끼운다.
 *  - 팝업 차단이 명시적으로 켜져 있으면 `window.open`이 `null`을 반환하므로 사용자에게 알린다.
 */
export async function openChatArchive(chats: any[]): Promise<void> {
  const newWindow = window.open("", "_blank");
  if (!newWindow) {
    ui.notifications?.error(
      "팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도하세요."
    );
    return;
  }

  // 무거운 빌드 동안 사용자에게 보여줄 placeholder
  newWindow.document.write(
    "<!doctype html><html><head><meta charset='utf-8'><title>Loading…</title></head>"
    + "<body style='font-family:sans-serif;padding:2rem;color:#444;'>"
    + "채팅 로그를 생성 중입니다… 잠시만 기다려 주세요."
    + "</body></html>"
  );
  newWindow.document.close();

  let htmlContent: string;
  try {
    [htmlContent] = await generateSimpleHtmlFromChats(chats);
  } catch (e) {
    console.error("[chat-tailor] openChatArchive 실패:", e);
    if (!newWindow.closed) {
      newWindow.document.body.textContent = "채팅 로그 생성 중 오류가 발생했습니다.";
    }
    ui.notifications?.error("채팅 로그 생성 중 오류가 발생했습니다.");
    return;
  }

  // 사용자가 로딩 중에 창을 닫았을 수 있음
  if (newWindow.closed) return;

  newWindow.document.open();
  newWindow.document.write(htmlContent);
  newWindow.document.close();
}

/**
 * 별도 창 표시용 — 이미지 src를 재매핑하지 않는다.
 * `extractImageSets`가 빠진 경량 버전.
 */
async function generateSimpleHtmlFromChats(chats: any[]): Promise<[string]> {
  console.time("[DEBUG] generateSimpleHtmlFromChats 전체");
  console.time("[DEBUG] 1. 템플릿 로드");

  const response = await fetch(TEMPLATE_PATH);
  const templateHtml = await response.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, "text/html");
  console.timeEnd("[DEBUG] 1. 템플릿 로드");

  const container = doc.querySelector(".foundry-chat-container")!;
  let prevPtFlag: boolean | undefined;
  let prevSpeaker: string | undefined;

  // 설정값을 루프 밖에서 한 번만 가져옴 (성능 최적화)
  const includeWhisperFlag = (game.settings as any).get(MODULE_ID, "includeWhisper");
  const hideWhisperSetting = (game.settings as any).get(MODULE_ID, "hideWhisper");

  console.time("[DEBUG] 2. 채팅 처리 루프");
  let chatCount = 0;
  let rollCount = 0;
  let privTalkCount = 0;
  for (const chat of chats) {
    const whisperFlag = chat.whisper && chat.whisper.length > 0;
    if (whisperFlag && (!includeWhisperFlag || !chat.isContentVisible)) continue;

    chatCount++;
    if (chat.rolls && chat.rolls.length > 0) rollCount++;
    if (isPrivTalkMessage(chat)) privTalkCount++;

    const chatMergeFlag = prevSpeaker === chat.alias;
    prevPtFlag = await appendChatContents(chat, chatMergeFlag, prevPtFlag, whisperFlag, container, hideWhisperSetting);
    prevSpeaker = chat.alias;
  }
  console.timeEnd("[DEBUG] 2. 채팅 처리 루프");
  console.log(`[DEBUG] 처리된 채팅: ${chatCount}개, Roll: ${rollCount}개, PrivTalk: ${privTalkCount}개`);

  console.time("[DEBUG] 3. 인라인 롤 처리");
  rewriteInlineRolls(doc);
  console.timeEnd("[DEBUG] 3. 인라인 롤 처리");

  console.time("[DEBUG] 4. CSS 처리");
  injectInlineCss(doc);
  console.timeEnd("[DEBUG] 4. CSS 처리");

  console.timeEnd("[DEBUG] generateSimpleHtmlFromChats 전체");
  return [doc.documentElement.outerHTML];
}

/**
 * 누적(외부 CSS) 모드 — 단독 모드와 같은 본문을 만들되 CSS는 doc에 인라인하지 않고 별도 텍스트로 반환한다.
 *
 * 반환: [htmlContent, contentImg, portraitImg, cssText]
 *   - cssText는 단독 템플릿의 baseline + `createCssList(mode)` 결과를 합친 뒤,
 *     `existingCssText`가 있으면 union 머지한 결과.
 */
async function generateIncrementalHtmlFromChats(chats: any[], opts: { mode?: "filtered" | "full"; existingCssText?: string | null } = {}): Promise<[string, Set<string>, Set<string>, string]> {
  const { mode = "filtered", existingCssText = null } = opts;

  const response = await fetch(INCREMENTAL_TEMPLATE_PATH);
  const templateHtml = await response.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, "text/html");

  const container = doc.querySelector(".foundry-chat-container")!;
  let prevPtFlag: boolean | undefined;
  let prevSpeaker: string | undefined;

  const includeWhisperFlag = (game.settings as any).get(MODULE_ID, "includeWhisper");
  const hideWhisperSetting = (game.settings as any).get(MODULE_ID, "hideWhisper");

  for (const chat of chats) {
    const whisperFlag = chat.whisper && chat.whisper.length > 0;
    if (whisperFlag && (!includeWhisperFlag || !chat.isContentVisible)) continue;

    const chatMergeFlag = prevSpeaker === chat.alias;
    prevPtFlag = await appendChatContents(chat, chatMergeFlag, prevPtFlag, whisperFlag, container, hideWhisperSetting);
    prevSpeaker = chat.alias;
  }

  rewriteInlineRolls(doc);

  const contentImg = new Set([...doc.querySelectorAll<HTMLImageElement>(".chat-text img")]
    .map(img => img.src ? img.src
      : window.location.href.replace("game", "") + img?.getAttribute("src")));

  const portraitImg = new Set([...doc.querySelectorAll<HTMLImageElement>(".chat-image img")]
    .map(img => img.src ? img.src
      : window.location.href.replace("game", "") + img?.getAttribute("src")));

  const baselineCss = await getBaselineCss();
  const dynamicCss = createCssList(null, doc, { mode });
  const freshCss = `${baselineCss}\n${dynamicCss}`;
  const cssText = existingCssText ? mergeCss(existingCssText, freshCss) : freshCss;

  updateImageSources(doc);
  return [doc.documentElement.outerHTML, contentImg, portraitImg, cssText];
}

/**
 * 다운로드용 — 이미지 src를 zip 상대경로로 매핑하고, 이미지 URL 집합을 함께 반환한다.
 */
async function generateHtmlFromChats(chats: any[]): Promise<[string, Set<string>, Set<string>]> {
  const response = await fetch(TEMPLATE_PATH);
  const templateHtml = await response.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, "text/html");

  const container = doc.querySelector(".foundry-chat-container")!;
  let prevPtFlag: boolean | undefined;
  let prevSpeaker: string | undefined;

  const includeWhisperFlag = (game.settings as any).get(MODULE_ID, "includeWhisper");
  const hideWhisperSetting = (game.settings as any).get(MODULE_ID, "hideWhisper");

  for (const chat of chats) {
    const whisperFlag = chat.whisper && chat.whisper.length > 0;
    if (whisperFlag && (!includeWhisperFlag || !chat.isContentVisible)) continue;

    const chatMergeFlag = prevSpeaker === chat.alias;
    prevPtFlag = await appendChatContents(chat, chatMergeFlag, prevPtFlag, whisperFlag, container, hideWhisperSetting);
    prevSpeaker = chat.alias;
  }

  rewriteInlineRolls(doc);

  const contentImg = new Set([...doc.querySelectorAll<HTMLImageElement>(".chat-text img")]
    .map(img => img.src ? img.src
      : window.location.href.replace("game", "") + img?.getAttribute("src")));

  const portraitImg = new Set([...doc.querySelectorAll<HTMLImageElement>(".chat-image img")]
    .map(img => img.src ? img.src
      : window.location.href.replace("game", "") + img?.getAttribute("src")));

  injectInlineCss(doc);

  updateImageSources(doc);
  return [doc.documentElement.outerHTML, contentImg, portraitImg];
}

/**
 * `<a class="inline-roll inline-result">`를 일반 `<div class="inline-roll">`로 평탄화한다.
 * 아카이브에서는 클릭 핸들러가 없으므로 텍스트로 풀어둔다.
 */
function rewriteInlineRolls(doc: Document): void {
  const inlineRollLinks = doc.querySelectorAll<HTMLElement>("a.inline-roll.inline-result");
  inlineRollLinks.forEach((link) => {
    const newDiv = doc.createElement("div");
    newDiv.className = "inline-roll";
    newDiv.textContent = String(link.dataset.tooltip) + "=>" + link.textContent;
    link.parentNode!.insertBefore(newDiv, link.nextSibling);
    link.remove();
  });
}

/**
 * 페이지의 현재 styleSheets를 수집해 doc의 `<head>`에 인라인 `<style>`로 추가한다.
 *
 * @param {Document} doc
 * @param {{ mode?: 'filtered'|'full' }} [options]
 */
function injectInlineCss(doc: Document, options: { mode?: "filtered" | "full" } = {}): void {
  const styleElement = doc.createElement("style");
  styleElement.type = "text/css";
  styleElement.appendChild(doc.createTextNode(createCssList(null, doc, { mode: options.mode ?? "filtered" })));

  const headElement = doc.head || doc.getElementsByTagName("head")[0];
  headElement.appendChild(styleElement);
}

/**
 * 단일 ChatMessage를 컨테이너에 append한다.
 * 잡담/일반 메시지 머지/귓속말 가림 등 표시 정책을 모두 여기서 결정.
 *
 * @returns {Promise<boolean>} 현재 메시지가 priv_talk인지 여부 (다음 루프의 `prevPtFlag`로 전달)
 */
async function appendChatContents(chat: any, chatMergeFlag: boolean, prevPtFlag: boolean | undefined, whisperFlag: boolean, container: Element, hideWhisperSetting: any): Promise<boolean> {
  const { flags, author } = chat;
  let speaker: string = chat.alias;

  const privTalkFlag = isPrivTalkMessage(chat);
  const hasRolls = chat.isRoll;
  const isItemCard = flags?.item || false;

  let text: string;
  if (hasRolls || isItemCard) {
    // Roll/Item 카드만 무거운 렌더링 사용
    text = await getRollResultContent(chat);
  } else if (privTalkFlag) {
    // 잡담은 chat.content에서 직접 추출 (가볍게)
    text = extractPrivTalkFromContent(chat.content);
  } else {
    text = chat.content;
  }

  const imageUrl = getChatImageUrl(chat);
  if (prevPtFlag !== privTalkFlag) chatMergeFlag = false;

  const div = createDivWithClasses(["chat-box", "message",
    privTalkFlag ? "priv-talk" : null,
    whisperFlag ? "whisper" : null,
    whisperFlag && hideWhisperSetting ? "whisper-hidden" : null,
    author ? `user-${author.id}` : null]);

  if (whisperFlag) {
    chatMergeFlag = false;
    const whisperTo = chat.whisper.map((i: string) => game.users!.get(i)!.name);
    speaker = `${chat.alias}\n→[${whisperTo}]`;
  }

  const nameDiv = createDivWithClasses("chat-name", !chatMergeFlag ? speaker : null);
  const imageDiv = createDivWithClasses("chat-image");
  const imageElement = getChatImageElement(imageUrl, chatMergeFlag, privTalkFlag);
  if (imageElement) imageDiv.appendChild(imageElement);

  const textDivClasses = ["chat-text", chatMergeFlag ? "chat-merge" : null];
  const textDiv = createDivWithClasses(textDivClasses, text, true);

  appendChildren(div, [imageDiv, nameDiv, textDiv]);
  container.appendChild(div);

  return !!privTalkFlag;
}

// 디버그용 누적 통계
let _debugRollCount = 0;
let _debugRollTotalTime = 0;

/**
 * Roll / Item 카드는 Foundry가 직접 렌더해줘야 정확한 결과가 나오므로,
 * 임시 컨테이너에서 `renderHTML()`로 렌더한 뒤 그 결과 element만 빼낸다.
 * 동시에 다른 모듈의 후처리(`renderChatMessageHTML` 훅 등)도 호출해 주어 호환성을 유지한다.
 */
async function getRollResultContent(chat: any): Promise<string> {
  const startTime = performance.now();
  _debugRollCount++;

  const isPrivTalk = isPrivTalkMessage(chat);

  const element = await renderChatMessageElement(chat);
  if (!element) return "";

  const tempContainer = document.createElement("div");
  tempContainer.style.display = "none";
  document.body.appendChild(tempContainer);
  tempContainer.appendChild(element);

  callRenderChatMessageHooks(chat, element);

  const result = extractMessageContent(element, isPrivTalk);
  tempContainer.remove();

  const elapsed = performance.now() - startTime;
  _debugRollTotalTime += elapsed;

  if (_debugRollCount % 10 === 0 || elapsed > 100) {
    console.log(`[DEBUG] getRollResultContent #${_debugRollCount}: ${elapsed.toFixed(1)}ms (누적: ${_debugRollTotalTime.toFixed(0)}ms)`);
  }
  return result;
}
