# sch-customize

A Foundry VTT module that tailors the chat experience for narrative-heavy tabletop sessions. Add styled chitchat lines, archive chat logs, lock your speaker, and fine-tune chat appearance.

> Compatible with Foundry VTT v12 – v13 (v14 support in progress).

<!-- 📸 [HERO SCREENSHOT] — A single overview shot showing the full chat sidebar with:
     - Several grouped chitchat messages (different users, different colors)
     - The speaker bar visible above the input
     - Regular chat messages mixed in
     Recommended: ~400px wide. This is the first impression of the module. -->

---

## Features

### 💬 Chitchat (Side Talk)

Send out-of-character side comments that stand apart visually from in-character speech and rolls. Consecutive chitchat messages from the same user are automatically grouped together (toggleable).

<!-- 📸 [CHITCHAT GROUPING] — Close-up of 3-4 consecutive chitchat messages from the same user,
     showing the rounded top/middle/end grouping effect. Optionally show two users with
     different color backgrounds side by side to demonstrate user-color theming. -->

- Trigger with `/pt`, `!`, `` ` ``, or a custom character of your choice (default: `/p`)
- Visually grouped with rounded edges (top / middle / end) — can be turned off
- Background color matches the user color, with adjustable brightness
- Classify as **OOC** or **Other** message type
- Markdown strikethrough (`~text~`) supported inside chitchat
- Optional line break between speaker name and message body
- Adjustable font size, opacity, and left margin

### 🧵 Message Grouping for Regular Chat

The same rounded `top / middle / end` grouping is also applied to regular chat messages when consecutive messages come from the same player and share the same message style. Enabled by default; can be disabled in settings.

### 🦊 Speaker Bar

A speaker indicator above the chat input that shows who you are about to speak as.

<!-- 📸 [SPEAKER BAR — TWO STATES] — Side-by-side comparison or a single GIF:
     (A) Unlocked state: open lock icon, showing a selected token's portrait + name
     (B) Locked state: closed gold lock icon, with the same portrait
     A GIF showing the click → lock transition would be ideal here. -->

- Automatically follows your currently selected token
- Falls back to your assigned character, then your user name
- Click the portrait to open the actor sheet
- Click the lock icon to **pin** a speaker — the speaker stays fixed regardless of token selection until you unlock it
- Lock state persists across reloads (stored as a user flag)
- The whole speaker bar can be disabled in settings if you prefer the vanilla layout

### 📥 Chat Log Archive

<!-- 📸 [ARCHIVE DIALOG] (OPTIONAL) — Screenshot of the "Download Chat Log" settings menu
     and/or a preview of the exported HTML output. Lower priority than the visual features above. -->

- **Download Chat Log**: Export the current chat history as an HTML file, with embedded images bundled together
- **Show Chat Log**: Open the full chat history in a new window
- Option to include or hide whispers in exports
- Hidden whispers appear as gray placeholders that reveal text on click

### 🎨 Appearance

<!-- 📸 [SETTINGS PANEL] (OPTIONAL) — Screenshot of the module settings page showing
     the appearance sliders. Useful for users who want to verify what's configurable. -->

- Base chat font size (14 – 30 px)
- Chitchat font size (10 – 30 px)
- Chitchat font opacity (0 – 1)
- Chitchat left margin (0 – 40 px)
- Chitchat background brightness (0 – 1)

---

## Installation

### Recommended — via Manifest URL

In Foundry VTT, go to **Add-on Modules** → **Install Module** and paste the manifest URL:

```
https://github.com/JBGeum/sch-customize/releases/latest/download/module.json
```

### Manual

Download the latest `sch-customize.zip` from the [Releases page](https://github.com/JBGeum/sch-customize/releases), extract it into `Data/modules/sch-customize/`, and restart Foundry.

### Dependencies

sch-customize requires **[Chat Commands](https://gitlab.com/woodentavern/foundryvtt-chat-command-lib)** (auto-installed via dependency resolution in modern Foundry versions).

---

## Usage

### Sending a chitchat

Type any of the following at the start of your message:

```
/pt Hello, this is a side comment.
/p  Same, but using the custom alias.
!   Or a single-character trigger.
`   Or a backtick.
```

You can customize the single-character trigger in module settings.

### Pinning a speaker

<!-- 📸 [LOCK FLOW] (OPTIONAL — best as a GIF) — A short animation showing:
     1. Selecting a token on the canvas → speaker bar updates
     2. Clicking the lock → lock turns gold
     3. Selecting a different token → speaker bar stays on the original
     If a GIF is too much, a 3-frame still composition also works. -->

1. Select a token on the canvas (the bar will warn you if nothing is selected)
2. Click the **🔓 open lock** icon in the speaker bar
3. The lock turns gold and your speaker is now fixed
4. Type messages — they will all be spoken as the pinned token, regardless of which token you select afterward
5. Click the **🔒 closed lock** to release

### Archiving the chat

Open **Settings → Module Settings → sch-customize**:
- **Download Chat Log**: Export to HTML
- **Show Chat Log**: View in a new window

---

## Settings Reference

| Setting | Scope | Description |
| --- | --- | --- |
| Enable Speaker Bar | Client | Show / hide the speaker bar above the chat input (reloads on change) |
| Custom Chitchat Trigger | Client | Single character to start a chitchat message |
| Markdown Strikethrough in Chitchat | Client | Render `~text~` with strikethrough |
| Create Chitchat as OOC | World | Classify chitchat as OOC instead of Other |
| Line Break After Speaker Name | Client | Display name on its own line |
| Merge Regular Messages | Client | Group consecutive regular messages from the same player (top / middle / end) |
| Merge Chitchat Messages | Client | Group consecutive chitchat messages from the same player |
| Base Chat Font Size | Client | Adjust default chat font size (14 – 30 px) |
| Chitchat Font Size | Client | Adjust chitchat font size (10 – 30 px) |
| Chitchat Font Color (Opacity) | Client | Adjust black opacity of chitchat text (0 – 1) |
| Chitchat Margin | Client | Adjust left margin of chitchat messages (0 – 40 px) |
| Chitchat Brightness | Client | Adjust chitchat background brightness (0 – 1) |
| Include Whispers in Export | World | Include whispers in archived logs |
| Hide Whispers in Display | Client | Mask whispers; click to reveal |

---

## Compatibility

- **Foundry VTT**: v12, v13 (verified). v14 support is in progress and the module already uses the v13+ `renderChatMessageHTML` / `ChatMessage#renderHTML` / `CHAT_MESSAGE_STYLES` APIs with graceful fallbacks for v12.
- **Systems**: System-agnostic. Designed for narrative use, tested primarily on DnD5e and generic systems.
- **Other modules**: Compatible with most chat-extension modules. If you use a module that overrides chat backgrounds, you may need to tune the chitchat brightness setting.

---

## Credits

- Original author: **Scheree**
- Maintained at [JBGeum/sch-customize](https://github.com/JBGeum/sch-customize)
- Bundles [JSZip](https://stuk.github.io/jszip/) for HTML log archives
- Requires [Chat Commands](https://gitlab.com/woodentavern/foundryvtt-chat-command-lib) by woodentavern

## License

[MIT License](LICENSE)

## Feedback & Issues

Please report bugs or suggestions on the [GitHub Issues](https://github.com/JBGeum/sch-customize/issues) page.

---

🇰🇷 [한국어 README](./README.ko.md)