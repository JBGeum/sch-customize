/**
 * Chat 메시지 컬렉션을 HTML 문서로 변환하는 메인 파이프라인.
 *
 *  - `downloadArchiveFile(chats)`  → 이미지까지 포함한 zip 파일 저장
 *  - `openChatArchive(chats)`      → 새 브라우저 창에 단독 HTML로 열기
 *
 * 두 진입점 모두 내부적으로 `template/chat-archive-template.html`을 로드한 뒤
 * 메시지를 순회하며 `appendChatContents`로 채워 넣고, 마지막에 인라인 CSS를 박는다.
 */

import { renderChatMessageElement, callRenderChatMessageHooks, isPrivTalkMessage } from "../compat/foundry.js";
import {
  saveAs,
  buildArchiveFilename,
  zipInsideFolder,
  createDivWithClasses,
  appendChildren,
  getChatImageUrl,
  getChatImageElement,
  extractPrivTalkFromContent,
  extractMessageContent,
  updateImageSources,
} from "./util.js";
import { createCssList } from "./css.js";

const TEMPLATE_PATH = "modules/chat-tailor/template/chat-archive-template.html";

/**
 * 채팅 메시지들을 zip(HTML + images/ + portraits/)으로 패키징한 Blob을 반환.
 * 저장 동작과 분리되어 있어 테스트/재사용이 용이하다.
 */
async function packageChatsToZipBlob(chats) {
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
 * 책임이 세 단계로 분리되어 있다.
 *   1. `packageChatsToZipBlob`  — 메시지 → Blob 변환
 *   2. `buildArchiveFilename`   — `chat-log-yyyyMMdd-worldName.zip` 파일명 생성
 *   3. `saveAs`                 — 저장 전략 (FilePicker → data URI fallback)
 */
export async function downloadArchiveFile(chats) {
  const blob = await packageChatsToZipBlob(chats);
  const filename = buildArchiveFilename("chat-log", "zip");
  await saveAs(blob, filename);
}

/**
 * 채팅 로그를 별도 창에서 열기 — 이미지 zip 없이 인라인 src 그대로 사용.
 */
export async function openChatArchive(chats) {
  const [htmlContent] = await generateSimpleHtmlFromChats(chats);

  const newWindow = window.open("", "_blank");
  newWindow.document.write(htmlContent);
  newWindow.document.close();
}

/**
 * 별도 창 표시용 — 이미지 src를 재매핑하지 않는다.
 * `extractImageSets`가 빠진 경량 버전.
 */
async function generateSimpleHtmlFromChats(chats) {
  console.time("[DEBUG] generateSimpleHtmlFromChats 전체");
  console.time("[DEBUG] 1. 템플릿 로드");

  const response = await fetch(TEMPLATE_PATH);
  const templateHtml = await response.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, "text/html");
  console.timeEnd("[DEBUG] 1. 템플릿 로드");

  const container = doc.querySelector(".foundry-chat-container");
  let prevPtFlag;
  let prevSpeaker;

  // 설정값을 루프 밖에서 한 번만 가져옴 (성능 최적화)
  const includeWhisperFlag = game.settings.get("chat-tailor", "includeWhisper");
  const hideWhisperSetting = game.settings.get("chat-tailor", "hideWhisper");

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
 * 다운로드용 — 이미지 src를 zip 상대경로로 매핑하고, 이미지 URL 집합을 함께 반환한다.
 */
async function generateHtmlFromChats(chats) {
  const response = await fetch(TEMPLATE_PATH);
  const templateHtml = await response.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, "text/html");

  const container = doc.querySelector(".foundry-chat-container");
  let prevPtFlag;
  let prevSpeaker;

  const includeWhisperFlag = game.settings.get("chat-tailor", "includeWhisper");
  const hideWhisperSetting = game.settings.get("chat-tailor", "hideWhisper");

  for (const chat of chats) {
    const whisperFlag = chat.whisper && chat.whisper.length > 0;
    if (whisperFlag && (!includeWhisperFlag || !chat.isContentVisible)) continue;

    const chatMergeFlag = prevSpeaker === chat.alias;
    prevPtFlag = await appendChatContents(chat, chatMergeFlag, prevPtFlag, whisperFlag, container, hideWhisperSetting);
    prevSpeaker = chat.alias;
  }

  rewriteInlineRolls(doc);

  const contentImg = new Set([...doc.querySelectorAll(".chat-text img")]
    .map(img => img.src ? img.src
      : window.location.href.replace("game", "") + img?.getAttribute("src")));

  const portraitImg = new Set([...doc.querySelectorAll(".chat-image img")]
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
function rewriteInlineRolls(doc) {
  const inlineRollLinks = doc.querySelectorAll("a.inline-roll.inline-result");
  inlineRollLinks.forEach((link) => {
    const newDiv = doc.createElement("div");
    newDiv.className = "inline-roll";
    newDiv.textContent = link.dataset.tooltip + "=>" + link.textContent;
    link.parentNode.insertBefore(newDiv, link.nextSibling);
    link.remove();
  });
}

/**
 * 페이지의 현재 styleSheets를 수집해 doc의 `<head>`에 인라인 `<style>`로 추가한다.
 */
function injectInlineCss(doc) {
  const styleElement = doc.createElement("style");
  styleElement.type = "text/css";
  styleElement.appendChild(doc.createTextNode(createCssList(null, false, doc)));

  const headElement = doc.head || doc.getElementsByTagName("head")[0];
  headElement.appendChild(styleElement);
}

/**
 * 단일 ChatMessage를 컨테이너에 append한다.
 * 잡담/일반 메시지 머지/귓속말 가림 등 표시 정책을 모두 여기서 결정.
 *
 * @returns {Promise<boolean>} 현재 메시지가 priv_talk인지 여부 (다음 루프의 `prevPtFlag`로 전달)
 */
async function appendChatContents(chat, chatMergeFlag, prevPtFlag, whisperFlag, container, hideWhisperSetting) {
  const { flags, author } = chat;
  let speaker = chat.alias;

  const privTalkFlag = isPrivTalkMessage(chat);
  const hasRolls = chat.isRoll;
  const isItemCard = flags?.item || false;

  let text;
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
    const whisperTo = chat.whisper.map(i => game.users.get(i).name);
    speaker = `${chat.alias}\n→[${whisperTo}]`;
  }

  const nameDiv = createDivWithClasses("chat-name", !chatMergeFlag ? [speaker] : null);
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
async function getRollResultContent(chat) {
  const startTime = performance.now();
  _debugRollCount++;

  const isPrivTalk = isPrivTalkMessage(chat);

  const element = await renderChatMessageElement(chat);
  if (!element) return "";

  const tempContainer = document.createElement("div");
  tempContainer.style.display = "none";
  document.body.appendChild(tempContainer);
  tempContainer.appendChild(element);

  callRenderChatMessageHooks(chat, element, chat.toObject());

  const result = extractMessageContent(element, isPrivTalk);
  tempContainer.remove();

  const elapsed = performance.now() - startTime;
  _debugRollTotalTime += elapsed;

  if (_debugRollCount % 10 === 0 || elapsed > 100) {
    console.log(`[DEBUG] getRollResultContent #${_debugRollCount}: ${elapsed.toFixed(1)}ms (누적: ${_debugRollTotalTime.toFixed(0)}ms)`);
  }
  return result;
}
