/**
 * Speaker Bar - 채팅 입력창 상단에 현재 발화자 표시 + 발화자 고정 기능
 * Foundry VTT v12 ~ v14 호환
 */

import { mountOnChatInput } from "./compat/chat-input-mount";
import { MODULE_ID } from "./constants";
import { resolveSpeaker, resolveOverrideSpeaker, resolveFavoriteDisplay, matchesLocked, DEFAULT_IMG, addFavorite, removeFavorite, speakerInfoToOverride, FAV_MAX, type LockedSpeaker, type FavoriteLookups, type SpeakerContext } from "./speaker-resolve";
import { SETTINGS } from "./settings/keys";
const LOCKED_FLAG_KEY = "lockedSpeaker";
const FAVORITES_FLAG_KEY = "favoriteSpeakers";

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
/**
 * 현재 사용자에게 적용되는 CGMP speaker mode. CGMP가 비활성이면 null.
 *
 * GM/Player 각각 다른 설정 키를 사용한다. Player 모드는 DISABLE_GM_AS_PC를 제외한
 * 모든 값을 가질 수 있다 (CGMP가 UI에서 그 옵션만 GM 전용으로 제한).
 */
function getCgmpSpeakerMode(): number | null {
  if (!(game.modules as any)?.get?.(CGMP_MODULE_ID)?.active) return null;
  try {
    const key = game.user!.isGM ? CGMP_OPTIONS.GM_SPEAKER_MODE : CGMP_OPTIONS.PLAYER_SPEAKER_MODE;
    const mode = (game.settings as any).get(CGMP_MODULE_ID, key);
    return typeof mode === "number" ? mode : null;
  } catch (_) {
    return null;
  }
}

/**
 * 현재 사용자의 고정 발화자 정보 가져오기
 * @returns {LockedSpeaker|null} { sceneId, actorId, tokenId, alias } or null
 */
function getLockedSpeaker(): LockedSpeaker | null {
  return ((game.user as any).getFlag(MODULE_ID, LOCKED_FLAG_KEY) as LockedSpeaker | null) ?? null;
}

/**
 * 고정 발화자 설정 (null 전달 시 해제)
 */
async function setLockedSpeaker(speaker: LockedSpeaker | null): Promise<void> {
  if (speaker === null) {
    await (game.user as any).unsetFlag(MODULE_ID, LOCKED_FLAG_KEY);
  } else {
    await (game.user as any).setFlag(MODULE_ID, LOCKED_FLAG_KEY, speaker);
  }
  updateSpeakerBar();
}

/** 현재 사용자의 즐겨찾기 발화자 목록. 없으면 빈 배열. */
export function getFavorites(): LockedSpeaker[] {
  return ((game.user as any).getFlag(MODULE_ID, FAVORITES_FLAG_KEY) as LockedSpeaker[] | null) ?? [];
}

/** 즐겨찾기 목록 저장 후 바 갱신(best-effort). */
async function setFavorites(list: LockedSpeaker[]): Promise<void> {
  try {
    await (game.user as any).setFlag(MODULE_ID, FAVORITES_FLAG_KEY, list);
  } catch (_) {
    // flag 쓰기 실패는 UI를 깨지 않는다.
  }
  updateSpeakerBar();
}

/** 현재 화자를 LockedSpeaker 스냅샷으로. (onLockToggle과 동일 패턴) */
export function snapshotCurrentSpeaker(): LockedSpeaker {
  const { name, token, actor } = resolveCurrentSpeaker();
  return {
    sceneId: (canvas as any)?.scene?.id ?? null,
    tokenId: token?.id ?? null,
    actorId: actor?.id ?? null,
    alias: name,
  };
}

/** [+] 현재 화자를 즐겨찾기에 추가(가드: empty/duplicate/full). */
export async function addCurrentToFavorites(): Promise<void> {
  const result = addFavorite(getFavorites(), snapshotCurrentSpeaker(), FAV_MAX);
  if (!result.ok) {
    const msg = result.reason === "full" ? "즐겨찾기가 가득 찼습니다."
      : result.reason === "duplicate" ? "이미 즐겨찾기에 있는 발화자입니다."
      : "즐겨찾기에 추가할 발화자가 없습니다.";
    ui.notifications!.warn(msg);
    return;
  }
  await setFavorites(result.next);
}

/** 즐겨찾기 칩 클릭 → 그 화자로 lock 전환(기존 인프라 재사용). */
export async function switchToFavorite(fav: LockedSpeaker): Promise<void> {
  await setLockedSpeaker(fav);
}

/** 즐겨찾기 항목 삭제. */
export async function removeFavoriteAt(index: number): Promise<void> {
  await setFavorites(removeFavorite(getFavorites(), index));
}

/** 기본 발화자로 복귀(고정 해제). */
export async function resetToDefaultSpeaker(): Promise<void> {
  await setLockedSpeaker(null);
}

/**
 * 경계 reader: game/canvas 전역을 1회 읽어 SpeakerContext로 모은다.
 * 순수 결정(resolveSpeaker)은 이 결과만 소비한다. (전역 읽기 격리 지점, 미테스트.)
 */
function readSpeakerContext(): SpeakerContext {
  const locked = getLockedSpeaker();
  let lockedToken: any = null;
  let lockedActor: any = null;
  if (locked) {
    const scene = locked.sceneId ? game.scenes!.get(locked.sceneId) : null;
    lockedToken = scene && locked.tokenId ? scene.tokens.get(locked.tokenId) : null;
    lockedActor = locked.actorId ? game.actors!.get(locked.actorId) : null;
  }
  const c = (canvas as any)?.tokens?.controlled?.[0];
  const controlled = c ? { token: c.document, actor: c.actor, isPc: !!c.actor?.hasPlayerOwner } : null;
  return {
    locked,
    lockedToken,
    lockedActor,
    cgmpMode: getCgmpSpeakerMode(),
    isGM: !!game.user!.isGM,
    controlled,
    assignedCharacter: game.user!.character,
    userName: game.user!.name,
    userAvatar: (game.user as any).avatar || DEFAULT_IMG,
    ignorePcToken: readIgnorePcToken(),
  };
}

/** "PC 토큰으로 발화 안 함" 설정값(미등록·오류 시 false). */
function readIgnorePcToken(): boolean {
  try {
    return (game.settings as any).get(MODULE_ID, SETTINGS.ignorePcTokenSpeaker) === true;
  } catch (_) {
    return false;
  }
}

/** 무-lock 상태에서 PC 스킵 옵션이 발신 개입을 요구하는가. */
function shouldOverrideForPcSkip(data: any): boolean {
  if (!readIgnorePcToken()) return false;
  if (data.flags?.[MODULE_ID]?.priv_talk) return false;
  const controlled = (canvas as any)?.tokens?.controlled?.[0];
  if (!controlled) return false;
  return !!controlled.actor?.hasPlayerOwner;
}

/**
 * 현재 표시될 발화자 정보 결정. (얇은 경계 래퍼 — 전역 → context → 순수 결정.)
 *
 * 우선순위:
 *  1. sch-customize Lock 발화자  2. CGMP 강제  3. 선택 토큰  4. 배정 캐릭터  5. 사용자
 */
export function resolveCurrentSpeaker() {
  return resolveSpeaker(readSpeakerContext());
}

/**
 * 발화자 바 HTML 생성
 */
export function createSpeakerBarElement() {
  const bar = document.createElement("div");
  bar.className = "sch-speaker-bar";
  bar.innerHTML = `
    <img class="sch-speaker-portrait" src="${DEFAULT_IMG}" alt="" />
    <span class="sch-speaker-name">—</span>
    <i class="sch-speaker-lock fas fa-lock-open" title="발화자 고정 (클릭하여 토글)"></i>
    <div class="sch-fav-strip"></div>
  `;

  // 잠금 토글
  bar.querySelector(".sch-speaker-lock")!.addEventListener("click", onLockToggle);

  // 초상화 클릭 시 해당 액터 시트 열기
  bar.querySelector(".sch-speaker-portrait")!.addEventListener("click", () => {
    const { actor } = resolveCurrentSpeaker();
    (actor as any)?.sheet?.render(true);
  });

  // 즐겨찾기 칩 줄 이벤트 위임: [+] 추가 / x 삭제 / 칩 클릭 전환
  bar.querySelector(".sch-fav-strip")!.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement;
    if (target.closest(".sch-fav-reset")) {
      void resetToDefaultSpeaker();
      return;
    }
    if (target.closest(".sch-fav-add")) {
      void addCurrentToFavorites();
      return;
    }
    const chip = target.closest(".sch-fav-chip") as HTMLElement | null;
    if (!chip) return;
    const index = Number(chip.dataset.index);
    if (target.closest(".sch-fav-chip-remove")) {
      ev.stopPropagation();
      void removeFavoriteAt(index);
      return;
    }
    const favs = getFavorites();
    if (favs[index]) void switchToFavorite(favs[index]);
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
    ui.notifications!.info("발화자 고정이 해제되었습니다.");
    return;
  }

  // 현재 선택된 토큰을 고정
  const controlled = (canvas as any)?.tokens?.controlled?.[0];
  if (!controlled) {
    ui.notifications!.warn("고정할 토큰을 먼저 선택해주세요.");
    return;
  }

  const token = controlled.document;
  const actor = controlled.actor;
  await setLockedSpeaker({
    sceneId: (canvas as any).scene?.id ?? null,
    tokenId: token?.id ?? null,
    actorId: actor?.id ?? null,
    alias: token?.name ?? actor?.name ?? game.user!.name,
  });
  ui.notifications!.info(`'${token?.name ?? actor?.name}'(으)로 발화자가 고정되었습니다.`);
}

/** 즐겨찾기 칩 줄 사용 여부(미등록·오류 시 기본 true). */
function readFavoritesEnabled(): boolean {
  try {
    return (game.settings as any).get(MODULE_ID, SETTINGS.enableSpeakerFavorites) !== false;
  } catch (_) {
    return true;
  }
}

/** 즐겨찾기 칩 표시 모드(미등록·오류 시 "portrait"). */
function readFavoriteChipMode(): "portrait" | "name" {
  try {
    return (game.settings as any).get(MODULE_ID, SETTINGS.favoriteChipMode) === "name" ? "name" : "portrait";
  } catch (_) {
    return "portrait";
  }
}

/** fav 항목의 scene/actor를 전역에서 조회(경계 read). */
function readFavoriteLookups(fav: LockedSpeaker): FavoriteLookups {
  const scene = fav.sceneId ? game.scenes!.get(fav.sceneId) : null;
  const token = scene && fav.tokenId ? (scene as any).tokens.get(fav.tokenId) : null;
  const actor = fav.actorId ? game.actors!.get(fav.actorId) : null;
  return { token, actor };
}

/** 즐겨찾기 칩 줄 재렌더. 설정 off면 숨기고 비운다. */
function renderFavStrip(strip: HTMLElement): void {
  if (!readFavoritesEnabled()) {
    strip.style.display = "none";
    strip.innerHTML = "";
    return;
  }
  strip.style.display = "";
  strip.innerHTML = "";

  // 기본 발화자 복귀 버튼 (맨 앞, 항상 표시)
  const reset = document.createElement("div");
  reset.className = "sch-fav-reset" + (getLockedSpeaker() == null ? " active" : "");
  reset.title = "기본 발화자로 (고정 해제)";
  const resetIcon = document.createElement("i");
  resetIcon.className = "fas fa-arrow-rotate-left";
  reset.appendChild(resetIcon);
  strip.appendChild(reset);

  const favs = getFavorites();
  const locked = getLockedSpeaker();
  const mode = readFavoriteChipMode();
  favs.forEach((fav, index) => {
    const { img, name, stale } = resolveFavoriteDisplay(fav, readFavoriteLookups(fav));
    const chip = document.createElement("div");
    chip.className = "sch-fav-chip"
      + (mode === "name" ? " mode-name" : "")
      + (matchesLocked(fav, locked) ? " active" : "")
      + (stale ? " stale" : "");
    chip.title = name;
    chip.dataset.index = String(index);

    let content: HTMLElement;
    if (mode === "name") {
      const label = document.createElement("span");
      label.className = "sch-fav-chip-label";
      label.textContent = name;
      content = label;
    } else {
      const chipImg = document.createElement("img");
      chipImg.className = "sch-fav-chip-img";
      chipImg.src = img;
      chipImg.alt = "";
      content = chipImg;
    }

    const remove = document.createElement("span");
    remove.className = "sch-fav-chip-remove";
    remove.title = "삭제";
    remove.textContent = "×";
    chip.append(content, remove);
    strip.appendChild(chip);
  });

  const add = document.createElement("div");
  add.className = "sch-fav-add";
  add.title = "현재 발화자를 즐겨찾기에 추가";
  add.textContent = "+";
  strip.appendChild(add);
}

/**
 * 발화자 바 갱신
 */
export function updateSpeakerBar() {
  const bar = document.querySelector(".sch-speaker-bar");
  if (!bar) return;

  const { img, name, locked } = resolveCurrentSpeaker();
  const imgEl = bar.querySelector(".sch-speaker-portrait") as HTMLImageElement;
  const nameEl = bar.querySelector(".sch-speaker-name") as HTMLElement;
  const lockEl = bar.querySelector(".sch-speaker-lock") as HTMLElement;

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

  const strip = bar.querySelector(".sch-fav-strip") as HTMLElement | null;
  if (strip) renderFavStrip(strip);
}

/**
 * 발화자 바 본체를 textarea 앞에 삽입
 */
function placeSpeakerBar(textarea: Element): void {
  // 기존 바 제거 후 새로 삽입 (재렌더 대응)
  const existing = document.querySelector(".sch-speaker-bar");
  if (existing) existing.remove();

  const bar = createSpeakerBarElement();
  textarea.before(bar);
  updateSpeakerBar();
}

/**
 * pre-create 단계에서 메시지의 speaker를 고정 발화자(또는 PC 스킵 옵션 결과)로 덮어쓰기.
 *
 * Lock이 활성일 때만 `message`와 `data` 양쪽에 speaker를 박는다. Lock이 없고 PC 스킵
 * 옵션도 개입하지 않으면 **아무것도 하지 않는다** — 특히 `message.updateSource`도
 * 호출하지 말 것.
 *
 * 이유: CGMP 등 다른 모듈이 같은 훅에서 `message.updateSource({ speaker })`로 OOC
 * 변환을 적용하더라도, 그 변경은 *`message` 인스턴스*에만 반영되고 *`data` 객체*는
 * 변경되지 않는다. 우리가 lock/PC 스킵 없는 상태에서도 `data.speaker`를 message에
 * 다시 박으면 CGMP의 변환이 원본 PC speaker로 원복되어 chat log에 PC portrait이
 * 그대로 표시된다. PC 스킵 옵션 경로는 원본 PC speaker가 아니라 CGMP를 반영한
 * `resolveCurrentSpeaker()` 결과를 박으므로 이 랜드마인을 회피한다.
 *
 * @returns {boolean} lock 또는 PC 스킵 옵션이 적용되어 message가 변경되었는지 여부
 */
export function overrideSpeaker(message: ChatMessage, data: any): boolean {
  // 1) Lock 우선 (기존)
  const lockedSpeaker = resolveOverrideSpeaker(getLockedSpeaker(), data);
  if (lockedSpeaker) {
    data.speaker = lockedSpeaker;
    (message as any).updateSource({ speaker: lockedSpeaker });
    return true;
  }
  // 2) Lock 없음: PC 스킵 옵션이 발신 개입을 요구하면 resolveCurrentSpeaker 결과로 발신.
  //    (원본 PC를 되박는 게 아니라 CGMP를 반영한 스킵 결과를 박으므로 CGMP 원복 랜드마인 회피.)
  if (shouldOverrideForPcSkip(data)) {
    const speaker = speakerInfoToOverride(resolveCurrentSpeaker());
    data.speaker = speaker;
    (message as any).updateSource({ speaker });
    return true;
  }
  return false;
}

/**
 * 모든 훅 등록
 */
export function registerSpeakerBar() {
  // 채팅 입력창 (재)등장 시 발화자 바를 (재)삽입 (공유 헬퍼)
  mountOnChatInput(
    placeSpeakerBar,
    () => !!document.querySelector(".sch-speaker-bar"),
  );

  // 토큰 선택/해제 → 바 갱신
  Hooks.on("controlToken", () => updateSpeakerBar());

  // 토큰/액터 정보 변경 → 바 갱신
  Hooks.on("updateToken", (tokenDoc) => {
    const locked = getLockedSpeaker();
    if (locked?.tokenId === tokenDoc.id || (canvas as any)?.tokens?.controlled?.some((t: any) => t.id === tokenDoc.id)) {
      updateSpeakerBar();
    }
  });
  Hooks.on("updateActor", (actor) => {
    const locked = getLockedSpeaker();
    if (locked?.actorId === actor.id || (canvas as any)?.tokens?.controlled?.some((t: any) => t.actor?.id === actor.id)) {
      updateSpeakerBar();
    }
  });

  // 액터 할당 변경
  Hooks.on("updateUser", (user) => {
    if (user.id === game.user!.id) updateSpeakerBar();
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