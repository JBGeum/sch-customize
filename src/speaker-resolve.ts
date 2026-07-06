/**
 * Speaker Bar 화자 결정의 **순수** 부분.
 *
 * `game`/`canvas` 전역에 의존하지 않는 결정 로직만 모은다. 전역 읽기는 speaker-bar.ts의
 * readSpeakerContext()가 수행하고, 그 결과 SpeakerContext만 받아 결정한다.
 */
import { MODULE_ID } from "./constants";

export const DEFAULT_IMG = "icons/svg/mystery-man.svg";

/** 사용자가 고정한 발화자 정보 구조. game.user.setFlag에 그대로 저장된다. */
export interface LockedSpeaker {
  sceneId: string | null;
  tokenId: string | null;
  actorId: string | null;
  alias: string;
}

export interface SpeakerInfo {
  img: string;
  name: string;
  locked: boolean;
  actor: any;
  token: any;
}

export interface SpeakerContext {
  locked: LockedSpeaker | null;
  lockedToken: any | null;
  lockedActor: any | null;
  cgmpMode: number | null;
  isGM: boolean;
  controlled: { token: any; actor: any; isPc: boolean } | null;
  assignedCharacter: any | null;
  userName: string;
  userAvatar: string;
}

export const CGMP_SPEAKER_MODE = {
  DEFAULT: 0,
  DISABLE_GM_AS_PC: 1,
  FORCE_IN_CHARACTER: 2,
  ALWAYS_OOC: 3,
  IN_CHARACTER_ALWAYS_ASSIGNED: 4,
};

export function userSpeakerInfo(ctx: SpeakerContext): SpeakerInfo {
  return { img: ctx.userAvatar, name: ctx.userName, locked: false, actor: null, token: null };
}

export function assignedCharacterSpeakerInfo(ctx: SpeakerContext): SpeakerInfo {
  const character = ctx.assignedCharacter;
  if (!character) return userSpeakerInfo(ctx);
  return { img: (character as any).img ?? DEFAULT_IMG, name: character.name, locked: false, actor: character, token: null };
}

export function resolveCgmpForcedSpeaker(ctx: SpeakerContext): SpeakerInfo | null {
  const mode = ctx.cgmpMode;
  if (mode === null || mode === CGMP_SPEAKER_MODE.DEFAULT) return null;

  switch (mode) {
    case CGMP_SPEAKER_MODE.DISABLE_GM_AS_PC: {
      if (!ctx.isGM) return null;
      return ctx.controlled?.isPc ? userSpeakerInfo(ctx) : null;
    }
    case CGMP_SPEAKER_MODE.FORCE_IN_CHARACTER:
    case CGMP_SPEAKER_MODE.IN_CHARACTER_ALWAYS_ASSIGNED:
      return assignedCharacterSpeakerInfo(ctx);
    case CGMP_SPEAKER_MODE.ALWAYS_OOC:
      return userSpeakerInfo(ctx);
    default:
      return null;
  }
}

export function resolveSpeaker(ctx: SpeakerContext): SpeakerInfo {
  const { locked, lockedToken, lockedActor } = ctx;
  if (locked) {
    const img = (lockedToken as any)?.texture?.src ?? (lockedActor as any)?.img ?? DEFAULT_IMG;
    const name = locked.alias ?? lockedToken?.name ?? lockedActor?.name ?? ctx.userName;
    return { img, name, locked: true, actor: lockedActor, token: lockedToken };
  }

  const cgmpForced = resolveCgmpForcedSpeaker(ctx);
  if (cgmpForced) return cgmpForced;

  if (ctx.controlled) {
    const token = ctx.controlled.token;
    const actor = ctx.controlled.actor;
    return {
      img: (token as any)?.texture?.src ?? (actor as any)?.img ?? DEFAULT_IMG,
      name: token?.name ?? actor?.name ?? ctx.userName,
      locked: false,
      actor,
      token,
    };
  }

  const character = ctx.assignedCharacter;
  if (character) {
    return { img: (character as any).img ?? DEFAULT_IMG, name: character.name, locked: false, actor: character, token: null };
  }

  return { img: DEFAULT_IMG, name: ctx.userName, locked: false, actor: null, token: null };
}

export function resolveOverrideSpeaker(locked: LockedSpeaker | null, data: any): { scene: string | null; actor: string | null; token: string | null; alias: any } | null {
  if (!locked) return null;
  // 잡담(priv_talk)은 자체 speaker 처리가 있으므로 제외
  if (data.flags?.[MODULE_ID]?.priv_talk) return null;
  return {
    scene: locked.sceneId ?? null,
    actor: locked.actorId ?? null,
    token: locked.tokenId ?? null,
    alias: locked.alias ?? data.speaker?.alias,
  };
}

/** 즐겨찾기 칩 렌더용 조회 결과(경계 reader가 scene/actor를 조회해 넘긴다). */
export interface FavoriteLookups {
  token: any | null;
  actor: any | null;
}

/**
 * 즐겨찾기 칩 한 개의 표시 정보 결정. resolveSpeaker의 locked 분기 폴백을 재사용.
 * token·actor 모두 없으면 stale=true(삭제된 항목 → 흐리게 표시).
 */
export function resolveFavoriteDisplay(fav: LockedSpeaker, lookups: FavoriteLookups): { img: string; name: string; stale: boolean } {
  const { token, actor } = lookups;
  const img = (token as any)?.texture?.src ?? (actor as any)?.img ?? DEFAULT_IMG;
  const name = fav.alias ?? token?.name ?? actor?.name ?? "";
  const stale = token == null && actor == null;
  return { img, name, stale };
}

/** 즐겨찾기 항목이 현재 lock과 같은 화자인지(하이라이트용). alias는 비교하지 않는다. */
export function matchesLocked(fav: LockedSpeaker, current: LockedSpeaker | null): boolean {
  if (!current) return false;
  return fav.sceneId === current.sceneId && fav.tokenId === current.tokenId && fav.actorId === current.actorId;
}

/** 즐겨찾기 최대 개수(칩 줄이 과도하게 길어지는 것을 방지). */
export const FAV_MAX = 12;

export type AddFavoriteResult =
  | { ok: true; next: LockedSpeaker[] }
  | { ok: false; reason: "empty" | "duplicate" | "full" };

/**
 * 즐겨찾기 배열에 candidate 추가(불변). 가드:
 *  - candidate 없음 또는 token·actor 모두 null → "empty"
 *  - 같은 (sceneId,tokenId,actorId) 존재 → "duplicate"
 *  - 상한(max) 도달 → "full"
 */
export function addFavorite(list: LockedSpeaker[], candidate: LockedSpeaker | null, max: number = FAV_MAX): AddFavoriteResult {
  if (!candidate || (candidate.tokenId == null && candidate.actorId == null)) return { ok: false, reason: "empty" };
  if (list.some((f) => matchesLocked(f, candidate))) return { ok: false, reason: "duplicate" };
  if (list.length >= max) return { ok: false, reason: "full" };
  return { ok: true, next: [...list, candidate] };
}

/** index 항목 제거(불변). 범위 밖이면 원본 그대로 반환. */
export function removeFavorite(list: LockedSpeaker[], index: number): LockedSpeaker[] {
  if (index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}
