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

/* eslint-disable no-empty */

export function saveAs(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * `#rrggbb` 혹은 `rrggbb` 형식의 hex 문자열을 `rgba(...)` 표현으로 변환.
 */
export function hexToRgba(hex, opacity) {
  hex = hex.toString().replace(/^#/, "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  opacity = Math.min(Math.max(opacity, 0), 1);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * 파일명에 붙은 트랜스폼 인자나 쿼리스트링을 자르고 확장자까지만 남긴다.
 */
export function cleanImageFilename(filename) {
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
export function createDivWithClasses(classes, content, isHtml) {
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

export function appendChildren(parent, children) {
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
export function getChatImageUrl(chat) {
  const portraitFlag = chat.flags?.["chat-portrait"];
  if (portraitFlag && chat.speaker?.actor) {
    return game.actors.get(chat.speaker.actor)?.img ?? portraitFlag.src ?? null;
  }
  const named = game.actors.getName(chat.speaker?.alias);
  if (named?.img) return named.img;
  if (portraitFlag?.src) return portraitFlag.src;
  return null;
}

/**
 * 합쳐진(merge) 메시지나 잡담은 초상화를 표시하지 않는다.
 */
export function getChatImageElement(imageUrl, chatMergeFlag, privTalkFlag) {
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
export function extractPrivTalkFromContent(htmlContent) {
  const temp = document.createElement("div");
  temp.innerHTML = htmlContent;
  const ptContent = temp.querySelector("div.pt:not(.priv_user)");
  return ptContent ? ptContent.innerHTML : htmlContent;
}

/**
 * 임시 렌더된 메시지 element에서 아카이브용 콘텐츠 영역을 추출한다.
 * priv_talk인 경우 본문 div만, 일반 메시지인 경우 .flavor-text + .message-content를 복사한다.
 */
export function extractMessageContent(messageElement, isPrivTalk) {
  if (isPrivTalk) {
    const ptContent = messageElement.querySelector(".message-content div.pt:not(.priv_user)");
    if (ptContent) {
      return ptContent.cloneNode(true).innerHTML;
    }
  }

  let result = "";

  const flavorText = messageElement.querySelector(".message-header .flavor-text");
  if (flavorText) {
    result += `<div class="flavor-text">${flavorText.innerHTML}</div>`;
  }

  const content = messageElement.querySelector(".message-content");
  if (content) {
    const clone = content.cloneNode(true);
    // 아카이브에서 제외할 요소 — 필요 시 여기에 추가
    const excludeSelectors = [
      "h4.chat-portrait-text-content-name-generic.chat-portrait-flexrow",
    ];
    excludeSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });
    result += clone.innerHTML;
  }

  return result || messageElement.cloneNode(true).outerHTML;
}

/**
 * 인라인 이미지 src를 아카이브 zip의 상대 경로(`images/`, `portraits/`)로 다시 매핑한다.
 */
export function updateImageSources(targetDoc) {
  const images = targetDoc.querySelectorAll(".chat-text img");
  images.forEach(img => {
    const src = img.getAttribute("src");
    if (!src) return;
    const filename = src.split("/").pop();
    img.src = "images/" + cleanImageFilename(filename);
  });

  const portraits = targetDoc.querySelectorAll("img.chat-image");
  portraits.forEach(img => {
    const src = img.getAttribute("src");
    if (!src) return;
    const filename = src.split("/").pop();
    img.src = "portraits/" + cleanImageFilename(filename);
  });
}

/**
 * JSZip 인스턴스의 폴더에 fetch한 이미지를 채워 넣는다.
 */
export async function zipInsideFolder(zip, imgSet, folderName) {
  const imgFolder = zip.folder(folderName);
  for (const url of imgSet) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const imageName = url.split("/").pop();
      imgFolder.file(cleanImageFilename(imageName), blob);
    } catch (e) {
      console.error(`Failed to fetch or process the image from URL: ${url}. Error: ${e.message}`);
    }
  }
}
