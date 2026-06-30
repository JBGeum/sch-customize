/**
 * Chat archive 관련 순수 유틸리티.
 *  - Blob 저장
 *  - 색상 변환
 *  - 이미지 URL/요소 헬퍼
 *  - JSZip 폴더 채우기
 *  - PrivTalk 콘텐츠 추출, 메시지 콘텐츠 추출 등 export.js 보조 함수
 *
 * 이 파일의 함수들은 DOM 외 외부 상태(`game.*`)를 거의 사용하지 않는다.
 * 예외: `getChatImageUrl`은 `game.actors`에 의존한다.
 */

/**
 * 아카이브 다운로드용 파일명을 빌드한다.
 * 형식: `{prefix}-yyyyMMdd-{worldName}.{ext}`
 *
 * - 날짜는 로컬 타임존 기준 yyyyMMdd
 * - 월드명은 `game.world.title` → `game.world.id` → `"world"` 순으로 폴백
 * - 파일시스템 금지 문자(`\ / : * ? " < > |`)는 `_`로 치환
 */
export function buildArchiveFilename(prefix: string, ext: string): string {
  const date = new Date();
  const yyyyMMdd = date.getFullYear().toString()
    + (date.getMonth() + 1).toString().padStart(2, "0")
    + date.getDate().toString().padStart(2, "0");
  const worldName = (game.world?.title ?? game.world?.id ?? "world")
    .replace(/[\\/:*?"<>|]/g, "_");
  return `${prefix}-${yyyyMMdd}-${worldName}.${ext}`;
}

/**
 * data URI 앵커 클릭 방식으로 blob을 저장.
 *
 * blob URL을 쓰면 Foundry VTT 서비스 워커가 요청을 가로채면서 `download` 속성이
 * 무시되고 blob URL의 UUID가 파일명이 되는 문제가 있다.
 * `data:` 스킴은 서비스 워커 인터셉트 대상이 아니므로 `download` 속성이 정상 동작한다.
 */
async function saveWithDataUriAnchor(blob: Blob, filename: string): Promise<void> {
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const a = document.createElement("a");
  a.href = dataUri;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 사용자 제스처 컨텍스트 안에서 *먼저* 저장 타깃을 확보한다.
 *
 * 무거운 비동기 작업(zip 생성, CSS 머지 등)을 시작하기 전 — 사용자가 "다운로드"
 * 버튼을 클릭한 직후 — 에 호출해야 한다. 그래야 `showSaveFilePicker`가 user gesture
 * 안에서 호출되어 다이얼로그가 정상적으로 뜨고, picker 미지원 환경에서도 fallback이
 * `about:blank#blocked` 차단에 걸리지 않는다.
 *
 * 반환값:
 *  - `{ kind: "file-handle", handle }`  — picker로 사용자가 위치 선택을 마친 경우
 *  - `{ kind: "data-uri", filename }`   — picker 미지원/실패. 이후 data URI 앵커로 폴백
 *  - `null`                              — 사용자가 picker를 취소(AbortError)
 *
 * @param {string} filename
 * @returns {Promise<{kind: "file-handle", handle: any}|{kind: "data-uri", filename: string}|null>}
 */
export async function requestSaveTarget(filename: string): Promise<{kind: "file-handle", handle: any}|{kind: "data-uri", filename: string}|null> {
  if (!(window as any).showSaveFilePicker) {
    return { kind: "data-uri", filename };
  }
  const ext = filename.split(".").pop()!.toLowerCase();
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "ZIP Archive", accept: { "application/zip": [`.${ext}`] } }],
    });
    return { kind: "file-handle", handle };
  } catch (e) {
    if ((e as any).name === "AbortError") return null;
    // 미지원/권한 거부 등 — data URI fallback으로 진행
    return { kind: "data-uri", filename };
  }
}

/**
 * `requestSaveTarget`이 확보해 둔 타깃에 blob을 기록한다.
 *
 * picker handle이라면 사용자가 이미 위치 선택을 마친 상태이므로 user gesture와
 * 무관하게 안전하게 쓸 수 있다. data URI fallback은 anchor click을 시도하지만
 * picker 미지원 환경(Firefox/Safari 등)에서는 여전히 임계점을 넘으면 차단될 수
 * 있으므로, 가능하면 picker 경로를 타도록 환경을 우선한다.
 *
 * @param {{kind: "file-handle", handle: any}|{kind: "data-uri", filename: string}|null} target
 * @param {Blob} blob
 * @returns {Promise<boolean>} 실제로 기록되었는지
 */
export async function writeToSaveTarget(target: {kind: "file-handle", handle: any}|{kind: "data-uri", filename: string}|null, blob: Blob): Promise<boolean> {
  if (!target) return false;
  if (target.kind === "file-handle") {
    const writable = await target.handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  }
  await saveWithDataUriAnchor(blob, target.filename);
  return true;
}

/**
 * `#rrggbb` 혹은 `rrggbb` 형식의 hex 문자열을 `rgba(...)` 표현으로 변환.
 */
export function hexToRgba(hex: string, opacity: number): string {
  hex = hex.toString().replace(/^#/, "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  opacity = Math.min(Math.max(opacity, 0), 1);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * URL(절대·상대 모두)에서 파일명 부분만 추출하고 퍼센트 인코딩을 디코딩해 반환한다.
 *
 * 문제 배경:
 *  - Foundry DB에 공백 포함 경로(`my image.jpg`)가 저장되어 있으면
 *    `img.src`(property)는 `my%20image.jpg`로, `getAttribute("src")`는 원본 그대로 반환.
 *  - 두 경로에서 추출한 파일명이 달라 zip 내 파일명과 HTML 참조가 불일치.
 *  - decodeURIComponent로 항상 디코딩된 형태로 통일해 이 불일치를 해소한다.
 */
export function filenameFromUrl(url: string): string {
  if (!url) return "";
  try {
    // 상대 URL도 파싱 가능하도록 현재 origin을 base로 사용
    const pathname = new URL(url, window.location.href).pathname;
    return decodeURIComponent(pathname.split("/").pop()!);
  } catch {
    // URL 파싱 실패 시(예: data URI) 마지막 슬래시 이후만 디코딩
    return decodeURIComponent(url.split("/").pop()!);
  }
}

/**
 * 파일명에 붙은 트랜스폼 인자나 쿼리스트링을 자르고 확장자까지만 남긴다.
 * 입력은 이미 디코딩된 파일명이어야 한다(`filenameFromUrl` 통과 후 사용).
 */
export function cleanImageFilename(filename: string): string {
  const extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".tiff", ".tif", ".ico"];
  for (const ext of extensions) {
    if (filename.includes(ext)) {
      return filename.split(ext)[0] + ext;
    }
  }
  return filename;
}

/**
 * 클래스 배열(혹은 단일 클래스)을 가진 `<div>`를 생성한다.
 * `isHtml`가 true이면 `.container > <div>` 구조로 감싸고 `innerHTML`로 콘텐츠 주입,
 * false면 `textContent`로 안전하게 주입한다.
 */
export function createDivWithClasses(classes: string | (string | null | undefined)[], content?: string | null, isHtml?: boolean): HTMLElement {
  const div = document.createElement("div");
  (Array.isArray(classes) ? classes : [classes]).forEach(cls => cls && div.classList.add(cls));

  if (isHtml) {
    const container = document.createElement("div");
    container.classList.add("container");
    container.appendChild(div);
    if (content) {
      div.innerHTML = content;
    }
    return container;
  } else if (content) {
    div.textContent = content;
  }
  return div;
}

export function appendChildren(parent: Element, children: Element[]): void {
  children.forEach(child => parent.appendChild(child));
}

/**
 * ChatMessage에 표시할 초상화 URL을 결정한다.
 *  1) `chat-portrait` 모듈이 actor를 지정해 둔 경우 그 actor의 img
 *  2) 화자명(alias)으로 actor 검색 시 img
 *  3) `chat-portrait`이 직접 src를 박은 경우
 *
 * NOTE: 다른 모듈(`chat-portrait`)의 flag 데이터 구조에 의존한다.
 */
export function getChatImageUrl(chat: any): string | null {
  const portraitFlag = (chat as any).flags?.["chat-portrait"];
  if (portraitFlag && (chat as any).speaker?.actor) {
    return game.actors!.get((chat as any).speaker.actor)?.img ?? portraitFlag.src ?? null;
  }
  const named = game.actors!.getName((chat as any).speaker?.alias);
  if (named?.img) return named.img;
  if (portraitFlag?.src) return portraitFlag.src;
  return null;
}

/**
 * 합쳐진(merge) 메시지나 잡담은 초상화를 표시하지 않는다.
 */
export function getChatImageElement(imageUrl: string | null, chatMergeFlag: any, privTalkFlag: any): HTMLImageElement | null {
  if (imageUrl && !chatMergeFlag && !privTalkFlag) {
    const img = document.createElement("img");
    img.classList.add("chat-image");
    img.src = imageUrl;
    return img;
  }
  return null;
}

/**
 * 잡담 메시지의 content HTML에서 본문 부분만 추출한다.
 * 잡담 메시지는 본 모듈이 `<div class="pt priv_user">이름</div> <div class="pt">본문</div>`로 가공해 두므로,
 * priv_user가 아닌 `.pt`만 골라낸다.
 */
export function extractPrivTalkFromContent(htmlContent: string): string {
  const temp = document.createElement("div");
  temp.innerHTML = htmlContent;
  const ptContent = temp.querySelector("div.pt:not(.priv_user)");
  return ptContent ? ptContent.innerHTML : htmlContent;
}

/**
 * 임시 렌더된 메시지 element에서 아카이브용 콘텐츠 영역을 추출한다.
 * priv_talk인 경우 본문 div만, 일반 메시지인 경우 .flavor-text + .message-content를 복사한다.
 */
export function extractMessageContent(messageElement: Element, isPrivTalk: boolean): string {
  if (isPrivTalk) {
    const ptContent = messageElement.querySelector(".message-content div.pt:not(.priv_user)");
    if (ptContent) {
      return (ptContent.cloneNode(true) as Element).innerHTML;
    }
  }

  let result = "";

  const flavorText = messageElement.querySelector(".message-header .flavor-text");
  if (flavorText) {
    result += `<div class="flavor-text">${flavorText.innerHTML}</div>`;
  }

  const content = messageElement.querySelector(".message-content");
  if (content) {
    const clone = content.cloneNode(true) as Element;
    // 아카이브에서 제외할 요소 — 필요 시 여기에 추가
    const excludeSelectors = [
      "h4.chat-portrait-text-content-name-generic.chat-portrait-flexrow",
    ];
    excludeSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });
    result += clone.innerHTML;
  }

  return result || (messageElement.cloneNode(true) as Element).outerHTML;
}

/**
 * 인라인 이미지 src를 아카이브 zip의 상대 경로(`images/`, `portraits/`)로 다시 매핑한다.
 */
export function updateImageSources(targetDoc: Document): void {
  const images = targetDoc.querySelectorAll(".chat-text img");
  images.forEach(img => {
    const src = img.getAttribute("src");
    if (!src) return;
    (img as HTMLImageElement).src = "images/" + cleanImageFilename(filenameFromUrl(src));
  });

  const portraits = targetDoc.querySelectorAll("img.chat-image");
  portraits.forEach(img => {
    const src = img.getAttribute("src");
    if (!src) return;
    (img as HTMLImageElement).src = "portraits/" + cleanImageFilename(filenameFromUrl(src));
  });
}

/** zipInsideFolder 이미지 fetch 동시성 상한. 브라우저 host당 ~6 연결 한계와 정합. */
const IMAGE_FETCH_CONCURRENCY = 6;

/**
 * JSZip 인스턴스의 폴더에 fetch한 이미지를 채워 넣는다.
 *
 * 이미지 fetch는 동시성 상한(`IMAGE_FETCH_CONCURRENCY`) 청크 배치로 병렬 처리한다.
 * 각 fetch는 개별 try/catch로 격리되어, 한 이미지 실패가 나머지를 막지 않는다.
 * zip에 add하는 순서는 원래 삽입 순서를 유지하므로(파일명 충돌 시 마지막이 승리)
 * 출력은 직렬 처리와 동일하다.
 */
export async function zipInsideFolder(zip: any, imgSet: Iterable<string>, folderName: string): Promise<void> {
  const imgFolder = zip.folder(folderName);
  const urls = [...imgSet];

  for (let i = 0; i < urls.length; i += IMAGE_FETCH_CONCURRENCY) {
    const chunk = urls.slice(i, i + IMAGE_FETCH_CONCURRENCY);
    const blobs = await Promise.all(chunk.map(async (url) => {
      try {
        const response = await fetch(url);
        return await response.blob();
      } catch (e) {
        console.error(`Failed to fetch or process the image from URL: ${url}. Error: ${(e as any).message}`);
        return null;
      }
    }));
    blobs.forEach((blob, j) => {
      if (blob) imgFolder.file(cleanImageFilename(filenameFromUrl(chunk[j])), blob);
    });
  }
}
