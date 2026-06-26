# Task 1 Report: appendChatContents characterization tests

## Status: DONE_WITH_CONCERNS

---

## What Changed

1. **`src/archive/export.ts` line 361**: Added `export` keyword to `appendChatContents` declaration.
   - Before: `async function appendChatContents(...)`
   - After: `export async function appendChatContents(...)`

2. **`test/message-view.test.ts`** (new file, 82 lines): 6 characterization tests covering per-message DOM rendering behavior of `appendChatContents`.

---

## TDD RED/GREEN Evidence

### RED (before Step 1)
`appendChatContents` was unexported; importing it in the test file would have caused a compile/resolution error. The RED is an import failure, not a test assertion failure — consistent with the brief.

### GREEN (after Step 1 + Step 2)

```
npm run test

 Test Files  4 passed (4)
      Tests  52 passed (52)
   Start at  16:46:26
   Duration  638ms
```

Breakdown:
- Baseline (before this task): 46 tests (3 files)
- After: 52 tests (4 files) — 6 new tests in `test/message-view.test.ts`

### typecheck gate
```
npm run typecheck
> tsc --noEmit
(exit 0, no output = 0 errors)
```

### build gate
```
npm run build
✓ 20 modules transformed.
✓ built in 542ms
```
(Dart Sass legacy-js-api deprecation warning is pre-existing, harmless)

---

## Files Changed

- `src/archive/export.ts`: +1 word (`export` added to function declaration at line 361)
- `test/message-view.test.ts`: new file, 82 lines

---

## Self-Review

- No logic was changed in `export.ts` — only the `export` keyword was added.
- The test file is verbatim from the brief with no modifications.
- All 6 new tests pass against current behavior (characterization, not specification).
- Gates all pass: typecheck 0 errors, 52 tests passing, build successful.
- No Co-Authored-By trailer in commit message.
- Only `src/` and `test/` files staged and committed.

---

## Concerns

**Count discrepancy: brief says "46 + 7 = 53" but the brief's own code block has 6 `it()` blocks.**

The brief's narrative states "기존 46 + 신규 7 = 53 통과" but the verbatim code provided in Step 2 contains exactly 6 `it()` calls:
- describe "일반 메시지": 3 tests
- describe "잡담": 1 test
- describe "속삭임": 2 tests

Total: 6 new tests → 52 total, not 53.

I used the brief's code verbatim as instructed. The mismatch appears to be a typo in the brief's narrative count. All 6 provided tests pass. No test was omitted or added beyond what the brief's code block specifies.

The `beforeEach` is imported but unused — this is present in the brief's verbatim code and was kept as-is (no typecheck error since unused imports are not flagged).

---

## Commit

SHA: `e0c1138`
Subject: `test: characterize appendChatContents per-message rendering before extraction`

---

## Review fix

### Changes made (test/message-view.test.ts only)

**Fix 1 — Isolate whisper merge-guard:**
Line 68: added `prevPt: false` to the whisper+hideWhisper test call.
- Before: `append(chat, { merge: true, whisper: true, hideWhisper: true })`
- After: `append(chat, { merge: true, prevPt: false, whisper: true, hideWhisper: true })`

**Fix 2 — Remove unused import:**
Line 1: removed `beforeEach` from the vitest import (it was never used in this file).
- Before: `import { describe, it, expect, beforeEach } from "vitest";`
- After: `import { describe, it, expect } from "vitest";`

### Why Fix 1 isolates the whisper guard

The production code in `appendChatContents` has two sequential guards that can set `chatMergeFlag = false`:

1. `if (prevPtFlag !== privTalkFlag) chatMergeFlag = false;` — fires when the previous message's priv_talk type differs from the current one.
2. `if (whisper && hideWhisper) chatMergeFlag = false;` — fires when the message is a whisper with hideWhisper=true.

With the original call (`prevPt` omitted → `undefined`): `undefined !== false` is `true`, so guard 1 fires first and kills merge. Guard 2 is never reached as the decisive factor. The assertion `chat-merge=false` passed, but it was guard 1 doing the work, not the whisper guard.

With `prevPt: false`: `false !== false` is `false`, so guard 1 does NOT fire. `chatMergeFlag` remains `true` until guard 2 evaluates `whisper && hideWhisper` (both true) and sets it to `false`. The assertion `chat-merge=false` still passes, but now it is exclusively the whisper guard that produced the result — the test genuinely exercises what it claims to test.

### Test result

```
npm run test

 ✓ test/util.test.ts (12 tests)
 ✓ test/css-merge.test.ts (4 tests)
 ✓ test/grouping.test.ts (30 tests)
 ✓ test/message-view.test.ts (6 tests)

 Test Files  4 passed (4)
       Tests  52 passed (52)
    Duration  674ms
```

```
npm run typecheck
> tsc --noEmit
(exit 0, 0 errors)
```

### Commit

SHA: `74baad8`
Subject: `test: fix whisper guard isolation and remove unused beforeEach import`
