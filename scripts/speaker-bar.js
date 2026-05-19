/**
 * Speaker Bar - 채팅 입력창 상단에 현재 발화자 표시 + 발화자 고정 기능
 * Foundry VTT v12 ~ v14 호환
 */

import { toElement, getRenderChatMessageHook } from "./compat/foundry.js";

const MODULE_ID = "chat-tailor";
const LOCKED_FLAG_KEY = "lockedSpeaker";
const DEFAULT_IMG = "icons/svg/mystery-man.svg";

/**
 * Cautious Gamemaster's Pack (CGMP) 호환 상수.
 *
 * 외부 모듈에 대한 *소프트* 의존: 모듈이 미설치/비활성이면 모든 호환 로직이 no-op이 된다.
 * CGMP는 `preCreateChatMessage`에서 GM/Player의 speaker를 강제로 변경하는데,
 * 그 결과 Speaker Bar UI에 표시된 발화자(보통 선택된 토큰)와 실제 chat log의
 * 발신자가 어긋나는 문제가 있어 표시를 CGMP 설정에 맞춰 보정한다.
 *
 * 참조 (CGMP 1.12.x): scripts/settings.js / scripts/chat-resolver.js
 */
const CGMP_MODULE_ID = "CautiousGamemastersPack";
const CGMP_OPTIONS = {
  GM_SPEAKER_MODE: "gmSpeakerMode",
  PLAYER_SPEAKER_MODE: "playerSpeakerMode",
};
const CGMP_SPEAKER_MODE = {
  DEFAULT: 0,
  DISABLE_GM_AS_PC: 1,
  FORCE_IN_CHARACTER: 2,
  ALWAYS_OOC: 3,
  IN_CHARACTER_ALWAYS_ASSIGNED: 4,
};

/**
 * 현재 사용자에게 적용되는 CGMP speaker mode. CGMP가 비활성이면 null.
 *
 * GM/Player 각각 다른 설정 키를 사용한다. Player 모드는 DISABLE_GM_AS_PC를 제외한
 * 모든 값을 가질 수 있다 (CGMP가 UI에서 그 옵션만 GM 전용으로 제한).
 */
function getCgmpSpeakerMode() {
  if (!game.modules?.get?.(CGMP_MODULE_ID)?.active) return null;
  try {
    const key = game.user.isGM ? CGMP_OPTIONS.GM_SPEAKER_MODE : CGMP_OPTIONS.PLAYER_SPEAKER_MODE;
    const mode = game.settings.get(CGMP_MODULE_ID, key);
    return typeof mode === "number" ? mode : null;
  } catch (_) {
    return null;
  }
}

/**
 * 현재 사용자 자체를 발화자로 표시할 때 쓰는 OOC fallback. CGMP가 OOC로 강제하는
 * 경우(DISABLE_GM_AS_PC/ALWAYS_OOC)에 사용한다.
 */
function userSpeakerInfo() {
  return {
    img: game.user.avatar || DEFAULT_IMG,
    name: game.user.name,
    locked: false,
    actor: null,
    token: null,
  };
}

/**
 * 사용자에게 할당된 캐릭터를 발화자로 표시. CGMP가 in-character로 강제하는
 * 경우(FORCE_IN_CHARACTER/IN_CHARACTER_ALWAYS_ASSIGNED)에 사용. 할당이 없으면
 * user OOC로 폴백.
 */
function assignedCharacterSpeakerInfo() {
  const character = game.user.character;
  if (!character) return userSpeakerInfo();
  return {
    img: character.img ?? DEFAULT_IMG,
    name: character.name,
    locked: false,
    actor: character,
    token: null,
  };
}

/**
 * CGMP가 메시지의 speaker를 강제로 바꾸는 모드라면, 그 결과에 해당하는 발화자
 * 정보를 반환한다. 강제 변경 없는 모드(DEFAULT) 또는 CGMP가 미적용인 케이스
 * (예: DISABLE_GM_AS_PC인데 NPC 토큰 선택)에서는 null 반환 → 기존 우선순위로 폴백.
 */
function resolveCgmpForcedSpeaker() {
  const mode = getCgmpSpeakerMode();
  if (mode === null || mode === CGMP_SPEAKER_MODE.DEFAULT) return null;

  switch (mode) {
    case CGMP_SPEAKER_MODE.DISABLE_GM_AS_PC: {
      // GM에게만 의미가 있고, *PC 토큰* 선택 시에만 발동. NPC 토큰이면 CGMP가 그대로 둠
      if (!game.user.isGM) return null;
      const controlled = canvas?.tokens?.controlled?.[0];
      const isPc = !!controlled?.actor?.hasPlayerOwner;
      return isPc ? userSpeakerInfo() : null;
    }
    case CGMP_SPEAKER_MODE.FORCE_IN_CHARACTER:
    case CGMP_SPEAKER_MODE.IN_CHARACTER_ALWAYS_ASSIGNED:
      return assignedCharacterSpeakerInfo();
    case CGMP_SPEAKER_MODE.ALWAYS_OOC:
      return userSpeakerInfo();
    default:
      return null;
  }
}

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
 * 현재 표시될 발화자 정보 결정.
 *
 * 우선순위:
 *  1. chat-tailor Lock 발화자       — 사용자 명시적 의사이므로 무조건 우선
 *  2. CGMP 강제 발화자 (있을 때)    — CGMP가 실제 메시지의 speaker를 바꿔버리므로
 *                                     Speaker Bar UI와 chat log 발신자의 정합성을 위해
 *                                     선택된 토큰보다 먼저 평가
 *  3. 선택된 토큰
 *  4. 사용자 할당 캐릭터
 *  5. 사용자 자신 (기본 portrait)
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

  const cgmpForced = resolveCgmpForcedSpeaker();
  if (cgmpForced) return cgmpForced;

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
  // v12: jQuery, v13+: HTMLElement — compat helper로 통일
  const root = toElement(html);

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
 * pre-create 단계에서 메시지의 speaker를 고정 발화자로 덮어쓰기.
 *
 * Lock이 활성일 때만 `message`와 `data` 양쪽에 speaker를 박는다. Lock이 없으면
 * **아무것도 하지 않는다** — 특히 `message.updateSource`도 호출하지 말 것.
 *
 * 이유: CGMP 등 다른 모듈이 같은 훅에서 `message.updateSource({ speaker })`로 OOC
 * 변환을 적용하더라도, 그 변경은 *`message` 인스턴스*에만 반영되고 *`data` 객체*는
 * 변경되지 않는다. 우리가 lock 없는 상태에서도 `data.speaker`를 message에 다시 박으면
 * CGMP의 변환이 원본 PC speaker로 원복되어 chat log에 PC portrait이 그대로 표시된다.
 *
 * @returns {boolean} lock이 적용되어 message가 변경되었는지 여부
 */
function overrideSpeaker(message, data) {
  const locked = getLockedSpeaker();
  if (!locked) return false;

  // 잡담(priv_talk)은 자체 speaker 처리가 있으므로 제외
  if (data.flags?.[MODULE_ID]?.priv_talk) return false;

  const speaker = {
    scene: locked.sceneId ?? null,
    actor: locked.actorId ?? null,
    token: locked.tokenId ?? null,
    alias: locked.alias ?? data.speaker?.alias,
  };
  data.speaker = speaker;
  message.updateSource({ speaker });
  return true;
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
  Hooks.on(getRenderChatMessageHook(), () => {
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

  // 발화자 오버라이드 — Lock이 활성일 때만 동작.
  //
  // `preCreateChatMessage` 등록을 `ready` 단계로 *늦춰* 등록한다. CGMP 등 다른 모듈이
  // 보통 `init`/`setup` 단계에서 같은 훅을 등록해 speaker를 강제 변경하는데, 같은
  // 훅에서는 *나중에 등록된 콜백이 나중에 실행*되어 마지막 결과로 남는다. Lock 발화자는
  // 사용자가 명시적으로 지정한 의사이므로, CGMP의 speaker 변환이 끝난 *뒤* 우리 값으로
  // 덮어써야 한다.
  //
  // Lock이 *없을 때*는 의도적으로 아무 일도 하지 않는다 — CGMP의 OOC 변환을 유지해야
  // chat log의 portrait도 OOC 결과(시스템 기본 / user.avatar)로 표시된다.
  Hooks.once("ready", () => {
    Hooks.on("preCreateChatMessage", (message, data) => {
      overrideSpeaker(message, data);
    });
  });

  // 캔버스 준비 후 갱신
  Hooks.on("canvasReady", () => updateSpeakerBar());
}