/**
 * Speaker Bar - 채팅 입력창 상단에 현재 발화자 표시 + 발화자 고정 기능
 * Foundry VTT v12 ~ v14 호환
 */

const MODULE_ID = "chat-tailor";
const LOCKED_FLAG_KEY = "lockedSpeaker";
const DEFAULT_IMG = "icons/svg/mystery-man.svg";

/**
 * 현재 사용자의 고정 발화자 정보 가져오기
 * @returns {object|null} { sceneId, actorId, tokenId, alias } or null
 */
function getLockedSpeaker() {
  return game.user.getFlag(MODULE_ID, LOCKED_FLAG_KEY) ?? null;
}

/**
 * 고정 발화자 설정 (null 전달 시 해제)
 */
async function setLockedSpeaker(speaker) {
  if (speaker === null) {
    await game.user.unsetFlag(MODULE_ID, LOCKED_FLAG_KEY);
  } else {
    await game.user.setFlag(MODULE_ID, LOCKED_FLAG_KEY, speaker);
  }
  updateSpeakerBar();
}

/**
 * 현재 표시될 발화자 정보 결정
 * 우선순위: 고정 발화자 → 선택된 토큰 → 할당된 캐릭터 → 사용자명
 */
function resolveCurrentSpeaker() {
  const locked = getLockedSpeaker();
  if (locked) {
    const scene = locked.sceneId ? game.scenes.get(locked.sceneId) : null;
    const token = scene && locked.tokenId ? scene.tokens.get(locked.tokenId) : null;
    const actor = locked.actorId ? game.actors.get(locked.actorId) : null;
    const img = token?.texture?.src ?? actor?.img ?? DEFAULT_IMG;
    const name = locked.alias ?? token?.name ?? actor?.name ?? game.user.name;
    return { img, name, locked: true, actor, token };
  }

  const controlled = canvas?.tokens?.controlled?.[0];
  if (controlled) {
    const token = controlled.document;
    const actor = controlled.actor;
    return {
      img: token?.texture?.src ?? actor?.img ?? DEFAULT_IMG,
      name: token?.name ?? actor?.name ?? game.user.name,
      locked: false,
      actor,
      token,
    };
  }

  const character = game.user.character;
  if (character) {
    return {
      img: character.img ?? DEFAULT_IMG,
      name: character.name,
      locked: false,
      actor: character,
      token: null,
    };
  }

  return { img: DEFAULT_IMG, name: game.user.name, locked: false, actor: null, token: null };
}

/**
 * 발화자 바 HTML 생성
 */
function createSpeakerBarElement() {
  const bar = document.createElement("div");
  bar.className = "ct-speaker-bar";
  bar.innerHTML = `
    <img class="ct-speaker-portrait" src="${DEFAULT_IMG}" alt="" />
    <span class="ct-speaker-name">—</span>
    <i class="ct-speaker-lock fas fa-lock-open" title="발화자 고정 (클릭하여 토글)"></i>
  `;

  // 잠금 토글
  bar.querySelector(".ct-speaker-lock").addEventListener("click", onLockToggle);

  // 초상화 클릭 시 해당 액터 시트 열기
  bar.querySelector(".ct-speaker-portrait").addEventListener("click", () => {
    const { actor } = resolveCurrentSpeaker();
    actor?.sheet?.render(true);
  });

  return bar;
}

/**
 * 잠금 아이콘 클릭 핸들러
 */
async function onLockToggle() {
  const locked = getLockedSpeaker();
  if (locked) {
    // 이미 고정되어 있으면 해제
    await setLockedSpeaker(null);
    ui.notifications.info("발화자 고정이 해제되었습니다.");
    return;
  }

  // 현재 선택된 토큰을 고정
  const controlled = canvas?.tokens?.controlled?.[0];
  if (!controlled) {
    ui.notifications.warn("고정할 토큰을 먼저 선택해주세요.");
    return;
  }

  const token = controlled.document;
  const actor = controlled.actor;
  await setLockedSpeaker({
    sceneId: canvas.scene?.id ?? null,
    tokenId: token?.id ?? null,
    actorId: actor?.id ?? null,
    alias: token?.name ?? actor?.name ?? game.user.name,
  });
  ui.notifications.info(`'${token?.name ?? actor?.name}'(으)로 발화자가 고정되었습니다.`);
}

/**
 * 발화자 바 갱신
 */
export function updateSpeakerBar() {
  const bar = document.querySelector(".ct-speaker-bar");
  if (!bar) return;

  const { img, name, locked } = resolveCurrentSpeaker();
  const imgEl = bar.querySelector(".ct-speaker-portrait");
  const nameEl = bar.querySelector(".ct-speaker-name");
  const lockEl = bar.querySelector(".ct-speaker-lock");

  imgEl.src = img;
  nameEl.textContent = name;

  if (locked) {
    bar.classList.add("locked");
    lockEl.classList.remove("fa-lock-open");
    lockEl.classList.add("fa-lock");
  } else {
    bar.classList.remove("locked");
    lockEl.classList.remove("fa-lock");
    lockEl.classList.add("fa-lock-open");
  }
}

/**
 * 발화자 바 본체를 textarea 앞에 삽입
 */
function placeSpeakerBar(textarea) {
  // 기존 바 제거 후 새로 삽입 (재렌더 대응)
  const existing = document.querySelector(".ct-speaker-bar");
  if (existing) existing.remove();

  const bar = createSpeakerBarElement();
  textarea.before(bar);
  updateSpeakerBar();
}

/**
 * 채팅 폼에 발화자 바 삽입 (DOM 준비 안 됐으면 대기)
 */
function injectSpeakerBar(html) {
  // v12: jQuery, v13+: HTMLElement 호환
  const root = html instanceof HTMLElement ? html : html?.[0];

  // root가 없거나(전체 문서 대상), 또는 root 안에 textarea가 있으면 즉시
  const search = root && root.querySelector ? root : document;
  const textarea = search.querySelector("#chat-message")
                ?? search.querySelector("textarea[name='message']")
                ?? document.querySelector("#chat-message");

  if (textarea) {
    placeSpeakerBar(textarea);
    return;
  }

  // textarea가 아직 DOM에 없음 → MutationObserver로 등장 대기 (v12 등 폴백)
  const observer = new MutationObserver(() => {
    const ta = document.querySelector("#chat-message")
            ?? document.querySelector("textarea[name='message']");
    if (ta) {
      observer.disconnect();
      placeSpeakerBar(ta);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // 안전장치: 10초 후 자동 해제
  setTimeout(() => observer.disconnect(), 10000);
}

/**
 * pre-create 단계에서 메시지의 speaker를 고정 발화자로 덮어쓰기
 */
function overrideSpeaker(messageData) {
  const locked = getLockedSpeaker();
  if (!locked) return;

  // 시스템 메시지나 다른 사용자가 만든 메시지는 건드리지 않음
  // 또한 잡담(priv_talk)은 자체 speaker 처리가 있으므로 제외
  if (messageData.flags?.[MODULE_ID]?.priv_talk) return;

  messageData.speaker = {
    scene: locked.sceneId ?? null,
    actor: locked.actorId ?? null,
    token: locked.tokenId ?? null,
    alias: locked.alias ?? messageData.speaker?.alias,
  };
}

/**
 * 모든 훅 등록
 */
export function registerSpeakerBar() {
  // v12: chat log 렌더링 시 input part도 같이 들어있음
  Hooks.on("renderChatLog", (app, html) => injectSpeakerBar(html));

  // v13: input part는 별도로 이동/렌더링됨 (moveChatInput 훅 사용)
  Hooks.on("moveChatInput", () => injectSpeakerBar(null));

  // 폴백: 일반 채팅 메시지 렌더 시 바가 없으면 다시 삽입
  // v13+: renderChatMessageHTML, v12: renderChatMessage
  const renderMsgHook = (game?.release?.generation ?? 0) >= 13
    ? "renderChatMessageHTML"
    : "renderChatMessage";
  Hooks.on(renderMsgHook, () => {
    if (!document.querySelector(".ct-speaker-bar")) {
      injectSpeakerBar(null);
    }
  });

  // 최후 폴백: ready 후 한 번 더 시도
  Hooks.once("ready", () => {
    if (!document.querySelector(".ct-speaker-bar")) {
      injectSpeakerBar(null);
    }
  });

  // 토큰 선택/해제 → 바 갱신
  Hooks.on("controlToken", () => updateSpeakerBar());

  // 토큰/액터 정보 변경 → 바 갱신
  Hooks.on("updateToken", (tokenDoc) => {
    const locked = getLockedSpeaker();
    if (locked?.tokenId === tokenDoc.id || canvas?.tokens?.controlled?.some(t => t.id === tokenDoc.id)) {
      updateSpeakerBar();
    }
  });
  Hooks.on("updateActor", (actor) => {
    const locked = getLockedSpeaker();
    if (locked?.actorId === actor.id || canvas?.tokens?.controlled?.some(t => t.actor?.id === actor.id)) {
      updateSpeakerBar();
    }
  });

  // 액터 할당 변경
  Hooks.on("updateUser", (user) => {
    if (user.id === game.user.id) updateSpeakerBar();
  });

  // 발화자 오버라이드 (잡담 외 일반 채팅에 적용)
  Hooks.on("preCreateChatMessage", (message, data) => {
    overrideSpeaker(data);
    message.updateSource({ speaker: data.speaker });
  });

  // 캔버스 준비 후 갱신
  Hooks.on("canvasReady", () => updateSpeakerBar());
}