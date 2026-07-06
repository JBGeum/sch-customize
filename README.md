# sch-customize

A small collection of quality-of-life tweaks for using Foundry VTT.

> Foundry VTT v13 · 🇰🇷 [한국어](./README.ko.md)

---

<img width="526" height="575" alt="sch-customize overview" src="https://github.com/user-attachments/assets/4de68f8c-8f43-4a39-ba5c-953e62d8274d" />

## Features

### Chitchat (side-talk)
<img width="309" height="425" alt="Chitchat example" src="https://github.com/user-attachments/assets/4a2868e1-1ce1-4b8f-bf19-2a786923b375" />

Out-of-character asides that read apart from in-character speech and rolls. Consecutive chitchat from the same user is grouped automatically.
- Triggers: `/pt`, `!`, `` ` ``, or a custom character (default `/p`); chitchat is treated as an OOC or Other message type.
- Grouping of consecutive chitchat, per-user color, and markdown strikethrough (`~text~`).
- Adjustable font size, opacity, margin, and brightness; optional line break after the name.

### Message grouping
<img width="297" height="514" alt="Message grouping example" src="https://github.com/user-attachments/assets/aba6649b-c0ac-4546-ba7f-fb4b4be84da2" />

Consecutive messages from the same player are combined into a single box. Works for both regular chat and chitchat, toggleable in settings.

### Speaker bar
Shown above the chat input, indicating who you'll currently speak as.
- **Lock a speaker** — the speaker stays fixed even if you change token selection.
- **Favorite speakers** — register frequent speakers for one-click switching; shown compactly by portrait or name; a reset chip clears the lock.

### Chat log archive
<img width="423" height="443" alt="Chat log archive dialog" src="https://github.com/user-attachments/assets/0e3f8808-e111-492c-a6e4-28a7de056c09" />

- **Download** — export the chat log as a simple session log (standalone / folder / zip modes), downloaded as a zip with images (portraits, etc.) bundled.
  - **Standalone** — CSS embedded in a single HTML file; good for a short, one-off session log.
  - **Folder** — pick a folder in the file picker; writes an updated CSS file and a new HTML file into it.
  - **Zip** — downloads images, CSS, and HTML as a zip. If you keep a shared CSS across sessions, upload it to re-download an accumulated CSS.
- **Show** — open the full log recorded so far in a new window; the content is the same as the download.
- Whisper handling: include, or mask (click to reveal); an option to tidy GM-only content (mostly buttons like damage-apply).

### Message editing
<img width="298" height="179" alt="Message edit dialog" src="https://github.com/user-attachments/assets/e8f263df-dedb-480f-94ef-e2180387acad" />

Edit a chat message you've already posted, via right-click → Edit. Edited messages get an "(edited)" badge.

### Appearance
Sliders for base chat font size, plus the module's chitchat font size / opacity / margin / background brightness.

---

## Install

**Manifest URL**
```
https://github.com/JBGeum/sch-customize/releases/latest/download/module.json
```

---

## Credits & License

Original author **Scheree** · maintained at [JBGeum/sch-customize](https://github.com/JBGeum/sch-customize) · bundles [JSZip](https://stuk.github.io/jszip/) · [MIT License](LICENSE).

Bug reports and suggestions: [GitHub Issues](https://github.com/JBGeum/sch-customize/issues).
