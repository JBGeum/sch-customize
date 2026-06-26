# Task 6 Report: chitchat/command, chitchat/render, speaker-bar → TypeScript

## Files Converted

- `src/chitchat/command.js` → `src/chitchat/command.ts`
- `src/chitchat/render.js` → `src/chitchat/render.ts`
- `src/speaker-bar.js` → `src/speaker-bar.ts`

All via `git mv`. No import-specifier changes were needed elsewhere (extensionless imports resolve automatically).

---

## Per-File Type Fixes

### command.ts

**Errors fixed:**
- `game.chatCommands` not in fvtt-types → `(game as any).chatCommands` at both use sites (local cast approach, consistent).
- `game.settings.get("chat-tailor", ...)` → `(game.settings as any).get(...)` (module ID not "core").
- `game.users.get(...)` → `game.users!.get(...)` (`!` asserts non-null at setup-hook time).
- `game.i18n.localize(...)` → `game.i18n!.localize(...)` (same).
- Callback params (`_chat`, `parameters`, `messageData`) and autocomplete params (`_menu`, `_alias`, `_parameters`) — added `: any` explicit type to satisfy `noImplicitAny` (they're passed into `any.register()` but TypeScript still requires annotation in strict mode).

**Approach chosen:** `(game as any).chatCommands` at each use site (2 occurrences) — simpler than a `declare global` augmentation for a single file.

---

### render.ts

**Errors fixed:**
- Module-scope state vars typed: `let lastPrivTalkMsg: HTMLElement | null = null`, `let lastBaseMsg: { el: HTMLElement; msg: any } | null = null`, `let privTalkIndex: number = 0`.
- All function params annotated: `onRenderChatMessage(message: ChatMessage, htmlOrEl: HTMLElement | JQuery): void`, helper functions with `(el: HTMLElement, message: ChatMessage, mergeEnabled: boolean): void`.
- `game.settings.get("chat-tailor", ...)` → `(game.settings as any).get(...)`.
- `message.user?.id ?? message.author?.id` → `(message as any).user?.id ?? (message as any).author?.id` (version-mixed v12/v13 access pattern).
- `message.style ?? message.type`, `message.author?.id ?? message.user?.id ?? ...` → same `(message as any)` local cast. `lastMessage` is already `any` (from `lastBaseMsg.msg: any`) so no cast needed there.
- `speakerKey` lambda: `(s: any): string =>` to satisfy `noImplicitAny`.
- `Hooks.on(getRenderChatMessageHook(), ...)` → `(Hooks as any).on(...)` — the return type of `getRenderChatMessageHook()` is `"renderChatMessageHTML" | "renderChatMessage"` and fvtt-types does not recognize the string union as a valid key for either `HookConfig` or `DeprecatedHookConfig` overloads.

---

### speaker-bar.ts

**Added interface:**
```ts
interface LockedSpeaker {
  sceneId: string | null;
  tokenId: string | null;
  actorId: string | null;
  alias: string;
}
```
Used as the typed return of `getLockedSpeaker()` and parameter of `setLockedSpeaker()`. Stored values are unchanged.

**Errors fixed (cast-by-cast):**

| Location | Error | Fix |
|---|---|---|
| `game.modules?.get?.(CGMP_MODULE_ID)?.active` | `get?.()` optional-call on always-defined method | `(game.modules as any)?.get(CGMP_MODULE_ID)?.active` |
| `game.user.isGM` (×3) | `game.user` possibly null | `game.user!.isGM` |
| `game.settings.get(CGMP_MODULE_ID, key)` | module ID not "core" | `(game.settings as any).get(...)` |
| `game.user.avatar` | property not typed on User in fvtt-types | `(game.user as any).avatar` |
| `game.user.name` (×3) | `game.user` possibly null | `game.user!.name` |
| `game.user.character` (×2) | same | `game.user!.character` |
| `character.img` (×2) | `img` not typed on Actor in fvtt-types | `(character as any).img` |
| `game.user.getFlag(...)` | fvtt-types returns `string \| true \| {...}`, not `LockedSpeaker` | `(game.user as any).getFlag(...) as LockedSpeaker \| null` |
| `game.user.unsetFlag/setFlag` | same `game.user` null issue | `(game.user as any).unsetFlag/setFlag` |
| `game.scenes!.get(...)`, `game.actors!.get(...)` | Collections possibly undefined | `!` non-null assertion |
| `token?.texture?.src` (×2) | `texture.src` not typed on TokenDocument | `(token as any)?.texture?.src` |
| `actor?.img` (×3) | `img` not typed on Actor | `(actor as any)?.img` |
| `canvas?.tokens?.controlled?.[0]` (×4) | canvas.tokens.controlled may not be typed | `(canvas as any)?.tokens?.controlled?.[0]` |
| `actor?.sheet?.render(true)` | `sheet` may not be typed on inferred actor type | `(actor as any)?.sheet?.render(true)` |
| `bar.querySelector(...).addEventListener(...)` (×2) | querySelector returns `Element \| null` | Added `!` non-null assertion |
| `updateSpeakerBar` querySelector results | `Element \| null`, no `.src` on Element | Cast to `HTMLImageElement` / `HTMLElement` (not null) — trust: bar is always created by our code |
| `ui.notifications.info/warn` (×3) | `ui.notifications` possibly undefined | `ui.notifications!.info/warn` |
| `game.user.id` (×1) | same null | `game.user!.id` |
| `function placeSpeakerBar(textarea)` | implicit any | `: Element` |
| `function injectSpeakerBar(html)` | implicit any | `: HTMLElement \| JQuery \| null` |
| `root && root.querySelector ? root : document` | TS2774: querySelector always true on HTMLElement | Simplified to `root ?? document` (same semantics: use root if non-null, else document) |
| `function overrideSpeaker(message, data)` | implicit any | `message: ChatMessage, data: any` |
| `message.updateSource({ speaker })` | `updateSource` not typed on ChatMessage | `(message as any).updateSource(...)` |
| `Hooks.on("moveChatInput", ...)` | not in HookConfig | `(Hooks as any).on(...)` |
| `Hooks.on(getRenderChatMessageHook(), ...)` | union type not in HookConfig | `(Hooks as any).on(...)` |
| `canvas?.tokens?.controlled?.some(t => t.id/t.actor?.id)` | token type in some() callback | `(t: any)` annotation |

---

## overrideSpeaker Locked/Unlocked Logic — Unchanged

The critical behavior in `overrideSpeaker` (called from `preCreateChatMessage`) is preserved byte-for-byte:

```ts
function overrideSpeaker(message: ChatMessage, data: any): boolean {
  const locked = getLockedSpeaker();
  if (!locked) return false;          // ← when NOT locked: early return, nothing happens
  if (data.flags?.[MODULE_ID]?.priv_talk) return false;
  // ... build speaker from locked ...
  data.speaker = speaker;
  (message as any).updateSource({ speaker });  // ← only called when LOCKED
  return true;
}
```

`message.updateSource` is only called in the locked branch. When unlocked, the function returns `false` immediately — CGMP's transforms are untouched.

---

## `?.` vs `!` Decisions

All cases where TypeScript needed a "non-null" fix used `!` (not `?.`), preserving throw-on-undefined behavior:
- `game.user!`, `game.users!`, `game.scenes!`, `game.actors!`, `game.i18n!`, `ui.notifications!`
- querySelector results in `createSpeakerBarElement` use `!` (elements always present in our own HTML)
- querySelector results in `updateSpeakerBar` use `as HTMLImageElement` / `as HTMLElement` casts (same rationale)

New `?.` was NOT introduced anywhere. Existing `?.` patterns from the original JS were preserved as-is.

The one simplification: `root && root.querySelector ? root : document` → `root ?? document`. TypeScript warned (TS2774) that `root.querySelector` is always truthy on `HTMLElement`. The simplified form has identical semantics (`root` if defined, `document` otherwise) and avoids the false-always-true warning.

---

## Verification Results

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run build` | dist/module.js 51.88 kB (14 modules transformed) |
| `npm run test` | 16/16 passed |
