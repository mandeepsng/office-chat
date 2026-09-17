# OfficeChat — Feature Roadmap

Forward-looking plan for new features: the ones suggested during planning plus
the **YouTube / Instagram** ideas. Follows the project philosophy — lightweight,
simple, no over-engineering for a 5–20 person office (see `CLAUDE.md`).

For the native/OS features (notifications, tray, hotkeys, DND, etc.) see
[NATIVE_FEATURES_PLAN.md](NATIVE_FEATURES_PLAN.md).

---

## Legend

**Effort:** S = ½–1 day · M = 1–3 days · L = 3–5 days · XL = 1–2 weeks
**Backend:** ✅ already exists · 🟡 partial · 🔴 new work needed

---

## ✅ Already shipped

- @mentions (with "you were mentioned" notification + highlight)
- Image paste → upload → inline (server `/upload` + local file storage)
- Native notifications: click-to-open, sounds (Win IM chime + in-app pop/whoosh), Linux fixes
- Unread badges (tray + sidebar pills) · taskbar flash
- Single-instance lock · global hotkey (Ctrl/Cmd+Shift+O) · window-state persistence
- Do Not Disturb + sound/notification settings panel
- Emoji picker · GIF picker (GIPHY) · typing · read receipts · presence · light/dark

---

## Feature Catalog

### A. Message interactions (backend mostly ready → fast wins)

| # | Feature | Effort | Backend | Notes |
|---|---------|--------|---------|-------|
| A1 | ✅ **Reply to message** *(done)* | M | ✅ `replyToId` exists | Hover → ↩ reply; quoted context + click-to-jump |
| A2 | ✅ **Edit message** *(done)* | S | ✅ `message:edit` exists | Hover own msg → ✏️ → composer; "edited" tag |
| A3 | **Delete message** | S | ✅ `message:delete` exists | Hover → 🗑️; "Message deleted" already renders |
| A4 | **Copy message text** | S | ✅ n/a | Right-click / hover → copy |
| A5 | **Emoji reactions** ❤️👍😂 | M | 🔴 reactions table + events | Most fun; react + live counts |

### B. Rich content

| # | Feature | Effort | Backend | Notes |
|---|---------|--------|---------|-------|
| B1 | **Markdown / rich text** | M | ✅ (client render) | `**bold**`, `*italic*`, `` `code` ``, code blocks |
| B2 | **YouTube search + inline play** ▶️ | L | 🟡 new msg type + key | See §YouTube below |
| B3 | **Link previews (unfurl)** | L | 🔴 server fetch + cache | Title/thumbnail card for URLs |
| B4 | **Instagram link embed** | M | 🟡 best-effort only | See §Instagram below |
| B5 | **Voice messages** 🎙️ | L | 🟡 reuse `/upload` | Record → upload → inline player |
| B6 | **Drag-and-drop upload** | S | ✅ reuse `/upload` | Paste already works |

### C. Presence & social

| # | Feature | Effort | Backend | Notes |
|---|---------|--------|---------|-------|
| C1 | **Custom status** | M | 🔴 status field | "🌴 On leave", "🔴 In a meeting" |
| C2 | **Away / idle presence** | M | 🟡 add `away` state | Auto-away after N min idle (P6) |

### D. Organization / power-user

| # | Feature | Effort | Backend | Notes |
|---|---------|--------|---------|-------|
| D1 | **Message search** | M | 🔴 SQLite `LIKE` query | Ctrl+K already does users/rooms |
| D2 | **Pinned messages** | M | 🔴 pin table/flag | Pin important msgs per room |
| D3 | **Unread divider + jump** | S | ✅ client-side | "New messages" line |
| D4 | **Per-room mute** | S | ✅ client setting | Room-level DND |
| D5 | **@everyone / @here** | S | 🟡 extend mentions | Group-wide ping |
| D6 | **Room member list UI** | M | ✅ `room:join/leave` | Add/remove/leave |

### E. Delight

| # | Feature | Effort | Backend | Notes |
|---|---------|--------|---------|-------|
| E1 | **Message effects** | S | ✅ client-side | 🎉 confetti, sound themes |
| E2 | **GIF reactions** | S | 🔴 (after A5) | React with a GIF |

---

## ▶️ YouTube — search & inline play (feasible)

Mirrors the existing GIF picker.

- **Search:** YouTube Data API v3 (`VITE_YOUTUBE_API_KEY`, free from Google Cloud).
- **Inline play:** official `iframe` embed (`youtube.com/embed/<id>`) renders and
  plays **inside the chat bubble** — no need to open YouTube.
- **Storage:** message type `youtube`, content = video URL (just a string, like
  GIFs — no binaries, stays lightweight per `CLAUDE.md` §61).
- **Also:** pasting a YouTube URL auto-embeds.

**Files:** `lib/youtube.ts` (search) · `YouTubePicker.svelte` · shared `MessageType`
+ validation · `MessageBubble.svelte` (iframe) · Composer `[▶️ YT]` button.

> API key is client-side (like GIPHY). Fine for a private office app; can be
> routed through the server later if key exposure becomes a concern.

## ⚠️ Instagram — limited (honest)

- **Search: not possible.** Instagram has no public search API; the Graph API
  only exposes your own business-account content (needs app review + tokens).
  A YouTube-style "search & pick" cannot be built without scraping (fragile +
  against ToS).
- **Paste-link embed: best-effort only.** `instagram.com/p/<id>/embed` can render
  a card, but login walls, reels not autoplaying inline, and X-Frame limits make
  reliable inline playback impossible. Realistically it becomes a **preview card**
  that opens Instagram on click.
- **Recommendation:** ship YouTube fully; treat Instagram as a "paste link →
  preview card" only, and revisit if Instagram's embed situation improves.

---

## Proposed Timeline

Assumes part-time solo pace; each **sprint ≈ 1 week**. Reorder freely.

| Sprint | Theme | Features | Why this order |
|--------|-------|----------|----------------|
| **1** | Message actions (quick wins) | A1 Reply · A2 Edit · A3 Delete · A4 Copy | Backend already done — biggest impact, lowest risk |
| **2** | Reactions & formatting | A5 Emoji reactions · B1 Markdown | Highest daily-use delight |
| **3** | **YouTube** | B2 YouTube search + inline play · B6 drag-drop | Your headline request; self-contained |
| **4** | Organization | D1 Message search · D3 Unread divider · D4 Per-room mute | Power-user quality of life |
| **5** | Presence & pins | C1 Custom status · C2 Away/idle · D2 Pinned messages | Social polish |
| **6** | Rich media | B3 Link previews · B4 Instagram embed · B5 Voice messages | Heavier; do once core is solid |
| **7** | Delight & rooms | E1 Effects · E2 GIF reactions · D5 @everyone · D6 Member list | Nice-to-haves |

### Milestones
- **M-A (end Sprint 2):** Modern chat feel — reply, edit, delete, reactions, markdown.
- **M-B (end Sprint 3):** YouTube in-chat playback shipped.
- **M-C (end Sprint 5):** Power-user + presence complete.
- **M-D (end Sprint 7):** Full-featured; only "future" items (calls, E2EE) remain.

---

## Out of scope (for now)

Per `CLAUDE.md` §62/§68 — keep the MVP lean:
voice/video calls, screen sharing, end-to-end encryption, multiple offices,
admin panel, real push (FCM). Design leaves room, but not built now.

---

*Recommended start: **Sprint 1 (Reply + Edit + Delete + Copy)** — backend is
ready, so it's the fastest visible upgrade.*
