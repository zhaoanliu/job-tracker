# Job Tracker — Development Journal

## Origin & Intention

This project started as a practical tool built inside a Claude.ai conversation. Zhaoan Liu, a principal-level software engineer actively job searching after a layoff, needed a way to track job applications across multiple companies, stages, and referral contacts. Rather than using a spreadsheet or a generic tool like Notion, the goal was to build something purpose-fit for a senior technical job search — with pipeline stages that reflect how hiring actually works at this level, and fields tailored to things that matter: referrers, JD storage, next steps, and priority.

The initial scope was simple: a kanban-style board that lives in the browser, requires no login, and just works.

---

## Feature Evolution (Step by Step)

### v1–v5 — Core kanban board
- Basic kanban board with pipeline stages
- Cards showing company, role, date, priority badge
- Click to open edit modal
- Add application button
- Filter by priority, role type, work mode

### v6–v10 — Data fields & polish
- Location dropdown (Bellevue WA, Seattle WA, Redmond WA, Remote)
- Work mode badge (On-site, Hybrid, Remote)
- Job link field with "Open ↗" button
- Referrer field displayed on card
- Source / how found field
- Notes and next step fields
- Rich text editor (RTE) for job description with bold, italic, underline, lists, headings

### v11–v15 — Export & import
- One-click "Copy CSV" button — copies full data to clipboard
- Import CSV — file picker with preview-before-confirm safety step
- RFC 4180-compliant CSV parser — handles quoted fields with embedded newlines (critical for JD field)
- All fields always quoted on export to prevent multiline corruption

### v16–v19 — Sort & filter improvements
- Sort dropdown: date, company A-Z, priority, manual order
- Location filter added to filter bar
- Location field changed from free text to dropdown

### v20–v22 — Pipeline refinement
- Added "Referred" stage (purple)
- Added "Chat w/ HM" stage (gold)
- Old "Phone screen" stage migrated to "Chat w/ HR"
- Full pipeline: Watchlist → Referred → Applied → Chat w/ HR → Chat w/ HM → Interviewing → Offer → Closed
- Source field changed from free text to dropdown: LinkedIn (default), Company website, Other

### v23–v27 — Drag and drop (major effort)
See dedicated section below.

### v28–v30 — Final stage additions
- Added "Future" stage (gray) — for companies with potential future openings
- Renamed "Watchlist" to "Waiting to Apply"
- Final pipeline: Future → Waiting to Apply → Referred → Applied → Chat w/ HR → Chat w/ HM → Interviewing → Offer → Closed
- "Future" set as default status for new entries
- Active count in stats excludes Future and Closed

---

## Problems Encountered & How They Were Solved

### Problem 1: CSV export blocked in sandbox
**What happened:** The first export implementation used `URL.createObjectURL` to trigger a file download. This is standard browser behavior, but Claude's widget sandbox blocks it entirely — clicking "Export CSV" did nothing.

**Attempts:**
- v1: `URL.createObjectURL` + `a.click()` — silently blocked
- v2: Showed the CSV in a panel with a copy button — worked but awkward UX
- v3 (final): One-click "Copy CSV" using `navigator.clipboard.writeText` with a fallback to `execCommand('copy')` — clean, no panel, works reliably in the sandbox

**Lesson:** The Claude widget sandbox has significant restrictions beyond a normal browser. File downloads, blob URLs, and `confirm()` dialogs are all blocked.

---

### Problem 2: CSV import breaking on multiline job descriptions
**What happened:** When a job description contained line breaks (which it almost always does), the line-by-line CSV parser treated each newline as a new row — turning 5 applications into 20.

**Root cause:** The original parser split on `\n` naively, not understanding that newlines inside quoted fields are valid CSV content per RFC 4180.

**Fix:** Rewrote the parser as a character-by-character state machine. It tracks whether the parser is inside a quoted field (`inQ` flag). Newlines inside quotes are treated as field content; newlines outside quotes end the row. Also changed the CSV builder to always quote every field, removing ambiguity entirely.

---

### Problem 3: HTML5 drag and drop API unreliable in sandbox
**What happened:** Multiple attempts to implement drag and drop using the browser's native HTML5 drag API (`draggable`, `dragstart`, `drop`, etc.) consistently failed — cards could not be moved between columns or reordered within a column.

**Attempts:**
- v23: HTML5 drag API — cross-column worked once, then stopped entirely
- v24: Fixed drag state persistence across re-renders — still broken for within-column
- v25: Complete rewrite using mouse events (`mousedown`, `mousemove`, `mouseup`) — cross-column worked, within-column did not
- v26: Added ghost card using pre-captured bounding rects — ghost card got stuck on screen when mouse left the iframe
- v26b: Added safety cleanup: `mouseleave`, `keydown`, `window.blur` cancel drag — ghost stuck issue resolved

**Root cause of within-column failure:** `elementFromPoint` during `mousemove` was hitting the flying ghost card instead of the real cards underneath, making position detection useless.

**Fix (v27):** Snapshot all card bounding rectangles at the exact moment drag starts, before the ghost card exists. All hit-testing during the drag uses those pre-captured rects, so the ghost is invisible to collision detection.

**Root cause of sort conflict:** Even after fixing position detection, within-column reorder wasn't sticking because the sort was set to "Date (newest first)" — so after every drop, cards re-sorted by date and ignored the new manual order.

**Fix:** Auto-switch to "Manual" sort the moment a drag begins. Snapshot the current visual order from whatever sort is active, assign those as `order` values, switch the sort dropdown to Manual, re-render, then proceed with the drag. Users never need to manually select Manual sort first.

---

### Problem 4: Ghost card permanently stuck on screen
**What happened:** If the user released the mouse button outside the widget iframe (e.g. scrolled away, clicked the Claude chat), the `mouseup` event never fired inside the widget. The flying ghost card remained on screen permanently, overlaid on other cards.

**Fix:** Three safety net listeners added — `document.mouseleave`, `document.keydown`, and `window.blur` — all call `cancelDrag()` which removes the ghost, clears all drag state, and re-renders the board.

---

## The Biggest Problem: Why We Moved to GitHub & Production

The single biggest limitation of the entire Claude widget approach is **data persistence tied to one browser on one machine**.

Everything in the tracker — every job entry, every note, every JD, every status update — lives in `localStorage`, which is:

- **Browser-specific:** Data in Claude in Chrome (the browser extension) is completely separate from Claude.ai in Safari or Firefox
- **Machine-specific:** No access from another computer or phone
- **Fragile:** Clearing browser data wipes everything
- **Not exportable easily:** The sandbox blocked file downloads entirely; we had to resort to clipboard-copy workarounds

This came to a head when Zhaoan opened the tracker in Claude.ai and found it showing only sample data — all real job entries were in a different browser context (Claude in Chrome). Two separate data islands with no way to sync.

**Additionally:**
- The Claude widget sandbox blocks standard web APIs (file downloads, blob URLs, `confirm()` dialogs)
- Drag and drop required multiple complete rewrites because of sandbox restrictions
- There is no way to share the tracker or access it from mobile

**The conclusion:** The tracker had outgrown the widget. To be genuinely useful during an active job search — accessible from any device, reliable, and shareable — it needed to be a real application with a real backend.

---

## Technology Choices for the GitHub Project

| Technology | Why chosen |
|---|---|
| **Next.js 14 (App Router)** | Industry standard for React full-stack apps; Vercel deployment is trivial; App Router enables server components and proper auth patterns |
| **TypeScript** | Type safety across the full data model; important for a portfolio piece demonstrating principal-level engineering standards |
| **Tailwind CSS** | Rapid, consistent styling without a heavy component library; matches the clean aesthetic of the Claude widget |
| **Supabase** | PostgreSQL under the hood (not a proprietary DB); built-in auth; Row Level Security means each user's data is isolated at the database level — no application-layer auth bugs can leak data between users. Also solves the encryption concern from the widget version. |
| **@dnd-kit** | The most reliable drag-and-drop library for React; avoids the HTML5 drag API entirely (which caused all our problems in the widget) |
| **Vercel** | Zero-config deployment for Next.js; auto-deploys on every GitHub push; free tier sufficient for a portfolio project |

---

## Architecture Highlights

**Row Level Security (RLS)** was a deliberate choice over application-layer access control. With RLS enabled on the `applications` table in Supabase, a database query from one user's session literally cannot return another user's rows — the database enforces it, not the application code. This is a security-first design that reflects the kind of thinking expected at the principal level.

**Optimistic updates for drag and drop** — the UI updates instantly on drop without waiting for the database write. If the write fails, it rolls back. This makes the app feel fast even on a slow connection.

**Phase 2 TODOs scaffolded** — Claude API JD analysis, pipeline funnel charts, and a Chrome extension are left as commented stubs in the codebase. This demonstrates planning ahead and makes the project roadmap visible to anyone reading the code.

---

## What This Project Demonstrates

For a principal-level engineering portfolio, this project shows:

- **Full-stack ownership** — from data model to UI to deployment
- **Security thinking** — RLS, auth, per-user data isolation
- **Iterative problem solving** — drag and drop went through 5+ rewrites to get right
- **Product sense** — the pipeline stages, field choices, and UX decisions reflect real job search experience
- **AI integration readiness** — Claude API stub is already planned and scaffolded
- **Documentation** — thorough README explaining architecture decisions, not just setup steps
