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
