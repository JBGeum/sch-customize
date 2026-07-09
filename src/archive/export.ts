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
import { SETTINGS } from "../settings/keys";
import { readWhisperSettings } from "../settings/whisper";
import { renderChatMessageElement, callRenderChatMessageHooks, isPrivTalkMessage } from "../compat/foundry";
import { isEditedMessage } from "../chat-edit/predicate";
import { injectEditedBadge } from "../chat-edit/badge";
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
  stripInteractiveElements,
} from "./util";
import { createCssList } from "./css";
import { mergeCss } from "./css-merge";
import { isWhisper, shouldExcludeWhisper, resolveChatMergeFlag, selectBodySource, buildMessageClasses, maskWhisperSpeaker, isGmOnlyWhisper } from "./message-view";
import ARCHIVE_INTERACTIVE_SCRIPT from "./archive-interactive.js?raw";
import { getArchiveDirectory, readExistingCss, writeTextFile, writeImagesToDir } from "./dir-target";

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
    console.warn("[sch-customize] baseline CSS 추출 실패:", e);
    return "";
  }
}

/**
 * 채팅 메시지들을 zip(HTML + images/ + portraits/)으로 패키징한 Blob을 반환.
 * 저장 동작과 분리되어 있어 테스트/재사용이 용이하다.
 */
async function packageChatsToZipBlob(chats: any[], settings: { includeWhisper: boolean; hideWhisper: boolean; excludeGmWhisper: boolean }): Promise<Blob> {
  const [htmlContent, contentImg, portraitImg] = await generateHtmlFromChats(chats, settings);

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
export async function downloadArchiveFile(chats: any[], settings: { includeWhisper: boolean; hideWhisper: boolean; excludeGmWhisper: boolean }): Promise<void> {
  const filename = buildArchiveFilename("chat-log", "zip");
  const target = await requestSaveTarget(filename);
  if (!target) return;

  const blob = await packageChatsToZipBlob(chats, settings);
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
 * @param {object} opts
 * @param {string|null} [opts.existingCssText=null] - 머지 대상 기존 chat-styles.css 텍스트
 * @param {boolean} opts.includeWhisper - 귓속말 포함 여부 (required)
 * @param {boolean} opts.hideWhisper - 귓속말 수신자 마스킹 여부 (required)
 * @param {boolean} opts.excludeGmWhisper - GM 전용(수신자 전원 GM) 카드 제외 여부 (required)
 */
export async function downloadIncrementalArchive(chats: any[], opts: { existingCssText?: string | null; includeWhisper: boolean; hideWhisper: boolean; excludeGmWhisper: boolean }): Promise<void> {
  const { existingCssText = null, includeWhisper, hideWhisper, excludeGmWhisper } = opts;

  // user gesture가 살아있는 동안 picker를 *먼저* 호출 — 사용자가 위치를 선택하는
  // 시간 동안 백그라운드로 무거운 generate/merge/zip 작업이 진행된다.
  const filename = buildArchiveFilename("chat-log-incremental", "zip");
  const target = await requestSaveTarget(filename);
  if (!target) return;

  const [htmlContent, contentImg, portraitImg, cssText] =
    await generateIncrementalHtmlFromChats(chats, { existingCssText, includeWhisper, hideWhisper, excludeGmWhisper });

  const zip = new JSZip();
  await zipInsideFolder(zip, contentImg, "images");
  await zipInsideFolder(zip, portraitImg, "portraits");
  zip.file(SHARED_CSS_FILENAME, cssText);
  zip.file(buildArchiveFilename("chat-log", "html"), htmlContent);

  const blob = await zip.generateAsync({ type: "blob" });
  await writeToSaveTarget(target, blob);
}

/**
 * 폴더선택 export — File System Access로 선택 폴더에 낱개 파일 직접 기록.
 * 폴더의 기존 chat-styles.css를 자동 read→merge→write(누적). 재업로드·zip 불필요.
 * 핸들을 **먼저** 확보(사용자 제스처)한 뒤 무거운 생성/기록을 진행한다.
 */
export async function exportIncrementalToDirectory(chats: any[], settings: { includeWhisper: boolean; hideWhisper: boolean; excludeGmWhisper: boolean }): Promise<void> {
  const dir = await getArchiveDirectory(game.world!.id);
  if (!dir) return;

  const existingCssText = await readExistingCss(dir);
  const [htmlContent, contentImg, portraitImg, cssText] =
    await generateIncrementalHtmlFromChats(chats, { existingCssText, includeWhisper: settings.includeWhisper, hideWhisper: settings.hideWhisper, excludeGmWhisper: settings.excludeGmWhisper });

  // css를 *먼저* 기록(누적 union의 상위집합) — 이후 html/이미지 기록이 실패해도 기존 챕터 HTML은 유효.
  // (File System Access는 트랜잭션이 없어 원자적 기록 불가; css-first가 부분실패 시 가장 안전.)
  await writeTextFile(dir, SHARED_CSS_FILENAME, cssText);
  await writeTextFile(dir, buildArchiveFilename("chat-log", "html", { includeTime: true }), htmlContent);
  await writeImagesToDir(dir, contentImg, "images");
  await writeImagesToDir(dir, portraitImg, "portraits");

  ui.notifications?.info(game.i18n!.localize("sch-customize.dialog.export.directory.done"));
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

  const settings = readWhisperSettings();

  let htmlContent: string;
  try {
    [htmlContent] = await generateSimpleHtmlFromChats(chats, settings);
  } catch (e) {
    console.error("[sch-customize] openChatArchive 실패:", e);
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

/** 템플릿 doc의 .foundry-chat-container에 chats를 필터·머지 처리해 채운다. 3개 generate*가 공유. */
export async function populateChatDoc(doc: Document, chats: any[], settings: { includeWhisper: boolean; hideWhisper: boolean; excludeGmWhisper: boolean }): Promise<void> {
  const container = doc.querySelector(".foundry-chat-container")!;
  let prevPtFlag: boolean | undefined;
  let prevSpeaker: string | undefined;

  // GM 전용 필터가 켜졌을 때만 GM id 수집(전역 game.users가 iterable/filter 지원 시).
  const gmIds = new Set<string>();
  if (settings.excludeGmWhisper) {
    const users = (game as any).users;
    if (users && typeof users.filter === "function") {
      for (const u of users.filter((x: any) => x.isGM)) gmIds.add(u.id);
    }
  }

  for (const chat of chats) {
    const whisperFlag = isWhisper(chat);
    if (shouldExcludeWhisper(chat, settings.includeWhisper)) continue;
    if (settings.excludeGmWhisper && isGmOnlyWhisper(chat, gmIds)) continue;

    const chatMergeFlag = prevSpeaker === chat.alias;
    prevPtFlag = await appendChatContents(chat, chatMergeFlag, prevPtFlag, whisperFlag, container, settings.hideWhisper, settings.excludeGmWhisper);
    prevSpeaker = chat.alias;
  }

  rewriteInlineRolls(doc);
}

/** Download/Incremental 공통: 본문/초상화 이미지 src 집합 수집. */
export function extractImageSets(doc: Document): { contentImg: Set<string>; portraitImg: Set<string> } {
  const resolveSrc = (img: HTMLImageElement) =>
    img.src ? img.src
      : window.location.href.replace(/\/game(?=\/|$|\?|#)/, "") + img?.getAttribute("src");

  const contentImg = new Set([...doc.querySelectorAll<HTMLImageElement>(".chat-text img")].map(resolveSrc));
  const portraitImg = new Set([...doc.querySelectorAll<HTMLImageElement>(".chat-image img")].map(resolveSrc));

  return { contentImg, portraitImg };
}

/**
 * 별도 창 표시용 — 이미지 src를 재매핑하지 않는다.
 * `extractImageSets`가 빠진 경량 버전.
 */
export async function generateSimpleHtmlFromChats(chats: any[], settings: { includeWhisper: boolean; hideWhisper: boolean; excludeGmWhisper: boolean }): Promise<[string]> {
  const response = await fetch(TEMPLATE_PATH);
  const templateHtml = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, "text/html");

  await populateChatDoc(doc, chats, settings);

  injectInlineCss(doc);
  injectRuntimeScript(doc);
  return [doc.documentElement.outerHTML];
}

/**
 * 누적(외부 CSS) 모드 — 단독 모드와 같은 본문을 만들되 CSS는 doc에 인라인하지 않고 별도 텍스트로 반환한다.
 *
 * 반환: [htmlContent, contentImg, portraitImg, cssText]
 *   - cssText는 단독 템플릿의 baseline + `createCssList` 결과를 합친 뒤,
 *     `existingCssText`가 있으면 union 머지한 결과.
 */
export async function generateIncrementalHtmlFromChats(chats: any[], opts: { existingCssText?: string | null; includeWhisper: boolean; hideWhisper: boolean; excludeGmWhisper: boolean }): Promise<[string, Set<string>, Set<string>, string]> {
  const { existingCssText = null, includeWhisper, hideWhisper, excludeGmWhisper } = opts;

  const response = await fetch(INCREMENTAL_TEMPLATE_PATH);
  const templateHtml = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, "text/html");

  await populateChatDoc(doc, chats, { includeWhisper, hideWhisper, excludeGmWhisper });

  const { contentImg, portraitImg } = extractImageSets(doc);

  const baselineCss = await getBaselineCss();
  const dynamicCss = createCssList(null, doc);
  const freshCss = `${baselineCss}\n${dynamicCss}`;
  const cssText = existingCssText ? mergeCss(existingCssText, freshCss) : freshCss;

  injectRuntimeScript(doc);
  updateImageSources(doc);
  return [doc.documentElement.outerHTML, contentImg, portraitImg, cssText];
}

/**
 * 다운로드용 — 이미지 src를 zip 상대경로로 매핑하고, 이미지 URL 집합을 함께 반환한다.
 */
export async function generateHtmlFromChats(chats: any[], settings: { includeWhisper: boolean; hideWhisper: boolean; excludeGmWhisper: boolean }): Promise<[string, Set<string>, Set<string>]> {
  const response = await fetch(TEMPLATE_PATH);
  const templateHtml = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, "text/html");

  await populateChatDoc(doc, chats, settings);

  const { contentImg, portraitImg } = extractImageSets(doc);

  injectInlineCss(doc);
  injectRuntimeScript(doc);
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
 */
function injectInlineCss(doc: Document): void {
  const styleElement = doc.createElement("style");
  styleElement.type = "text/css";
  styleElement.appendChild(doc.createTextNode(createCssList(null, doc)));

  const headElement = doc.head || doc.getElementsByTagName("head")[0];
  headElement.appendChild(styleElement);
}

/**
 * 아카이브 문서 head에 인터랙션 스크립트(주사위/귓속말/카드 접기 토글)를 주입한다.
 * 두 템플릿이 복붙하던 `<script>`의 단일 출처 — 모든 생성 모드가 이 함수로 삽입.
 */
export function injectRuntimeScript(doc: Document): void {
  const script = doc.createElement("script");
  script.textContent = ARCHIVE_INTERACTIVE_SCRIPT;
  const headElement = doc.head || doc.getElementsByTagName("head")[0];
  headElement.appendChild(script);
}

/**
 * 단일 ChatMessage를 컨테이너에 append한다.
 * 잡담/일반 메시지 머지/귓속말 가림 등 표시 정책을 모두 여기서 결정.
 *
 * @returns {Promise<boolean>} 현재 메시지가 priv_talk인지 여부 (다음 루프의 `prevPtFlag`로 전달)
 */
export async function appendChatContents(chat: any, chatMergeFlag: boolean, prevPtFlag: boolean | undefined, whisperFlag: boolean, container: Element, hideWhisperSetting: any, stripInteractive: boolean): Promise<boolean> {
  const { author } = chat;
  let speaker: string = chat.alias;

  const privTalkFlag = isPrivTalkMessage(chat);

  let text: string;
  const bodySource = selectBodySource(chat);
  switch (bodySource) {
    case "roll":     text = await getRollResultContent(chat); break;
    case "privtalk": text = extractPrivTalkFromContent(chat.content); break;
    default:         text = chat.content;
  }

  const imageUrl = getChatImageUrl(chat);
  const mergeFlag = resolveChatMergeFlag({ candidateMerge: chatMergeFlag, prevPtFlag, privTalkFlag, whisperFlag });

  const div = createDivWithClasses(buildMessageClasses({
    privTalkFlag, whisperFlag, hideWhisper: hideWhisperSetting, authorId: author ? author.id : null,
  }));

  if (whisperFlag) {
    const whisperTo = chat.whisper.map((i: string) =>
      game.users!.get(i)?.name ?? game.i18n!.localize("sch-customize.archive.whisperUnknownUser"));
    speaker = maskWhisperSpeaker(chat.alias, whisperTo);
  }

  const nameDiv = createDivWithClasses("chat-name", !mergeFlag ? speaker : null);
  const imageDiv = createDivWithClasses("chat-image");
  const imageElement = getChatImageElement(imageUrl, mergeFlag, privTalkFlag);
  if (imageElement) imageDiv.appendChild(imageElement);

  const textDivClasses = ["chat-text", mergeFlag ? "chat-merge" : null];
  const textDiv = createDivWithClasses(textDivClasses, text, true);
  // 최종 렌더 DOM에서 조작 버튼 제거 — roll/plain/잡담 모든 경로 커버(plain 경로의
  // MidiQOL 카드처럼 chat.content에 버튼이 그대로 들어오는 경우까지 잡는다).
  if (stripInteractive) stripInteractiveElements(textDiv);

  // 편집된 메시지에 "(수정됨)" 배지 — roll 경로는 renderChatMessageHTML 훅(getRollResultContent)이
  // 이미 배지를 태우므로, 중복 방지를 위해 plain/privtalk 경로에서만 직접 추가한다.
  if (isEditedMessage(chat) && bodySource !== "roll" && (game.settings as any).get(MODULE_ID, SETTINGS.showEditedBadge)) {
    injectEditedBadge(textDiv, game.i18n!.localize("sch-customize.edit.editedBadge"));
  }

  appendChildren(div, [imageDiv, nameDiv, textDiv]);
  container.appendChild(div);

  return privTalkFlag;
}

/**
 * Roll / Item 카드는 Foundry가 직접 렌더해줘야 정확한 결과가 나오므로,
 * 임시 컨테이너에서 `renderHTML()`로 렌더한 뒤 그 결과 element만 빼낸다.
 * 동시에 다른 모듈의 후처리(`renderChatMessageHTML` 훅 등)도 호출해 주어 호환성을 유지한다.
 */
async function getRollResultContent(chat: any): Promise<string> {
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

  return result;
}
