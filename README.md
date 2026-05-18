# Job Tracker

**Live demo:** https://job-tracker-phi-tan.vercel.app

A full-stack kanban-based job search pipeline tracker built for senior/principal-level engineers managing a complex, multi-stage search.

![Job Tracker screenshot placeholder](docs/screenshot.png)

## What it does

Track every application through a nine-stage pipeline — from passive interest (`Future`) to final outcome (`Offer` / `Closed`) — on a drag-and-drop kanban board. Key capabilities:

- **Kanban board** with independently scrollable columns and real-time card counts
- **Full application record** — company, role, type, priority, location, work mode, source, referrer, notes, next step, and full job description storage
- **Drag to move & reorder** — move cards between stages or reorder within a column; order persists to the database
- **Filters & sort** — filter by priority, role type, work mode, and location simultaneously; sort by date, company, priority, or manual order
- **Stats bar** — at-a-glance totals: Total / Active / Interviewing / Offers
- **CSV export & import** — backup your data or bulk-import from a spreadsheet
- **Auth** — email + password or magic link via Supabase Auth
- **Row Level Security** — every DB query is scoped to the authenticated user, enforced at the Postgres layer

---

## Architecture decisions

### Next.js 14 App Router
The App Router (RSC + Streaming) lets the dashboard server-render the initial board state with zero client-side loading flicker. Protected routes and session refresh live in a single `middleware.ts`, keeping auth logic out of every component. Server Components also allow the Supabase server client to run inside the request/response cycle without exposing credentials to the browser.

### Supabase over Firebase
| Concern | Supabase | Firebase |
|---|---|---|
| Data model | Relational (PostgreSQL) — a job application is naturally tabular | Document store — requires manual denormalization |
| Security | Row Level Security enforced at the DB layer | Firestore rules enforced at the SDK layer |
| Migrations | SQL files in version control | Schema changes are schema-less (both a feature and a hazard) |
| Auth | JWT-based, plugs into RLS `auth.uid()` | Separate auth, requires custom claims for Firestore rules |
| Open source | Self-hostable | Google-proprietary |

Job applications are structured, relational data (e.g., `ORDER BY` by date or priority, `WHERE status IN (...)` for funnel analytics). PostgreSQL is the right tool. Firebase shines for real-time collaborative documents, which isn't this app's core use case.

### @dnd-kit
`react-beautiful-dnd` was deprecated in 2023. `react-dnd` is powerful but has a large API surface. `@dnd-kit` is the modern standard: framework-agnostic sensors, accessible keyboard navigation out of the box, no third-party peer deps, and a collision-detection API that handles multi-container sorting cleanly.

The board uses `closestCorners` collision detection so a card snaps to the nearest column header _or_ card position — not just the center — which gives a tight, predictable drag target in narrow columns.

### Row Level Security (RLS)
RLS ensures that even if application code has a bug — a missing `WHERE user_id = X`, a misconfigured API route — the database simply returns nothing for rows that don't belong to the authenticated user. The policy:

```sql
create policy "Users can only access their own applications"
  on applications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

This is a defense-in-depth layer that costs nothing to add and eliminates an entire class of data-leakage bugs.

### Optimistic updates
Drag-and-drop operations update local React state immediately (via `handleDragOver` for cross-column moves and `handleDragEnd` for final order), then persist to Supabase in the background. The UI never waits for a round-trip, so drag feels instant even on a slow connection.

---

## Local development

### Prerequisites
- Node.js ≥ 18
- A Supabase project (free tier works)

### 1. Clone and install

```bash
git clone https://github.com/yourname/job-tracker.git
cd job-tracker
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

Both values are in your Supabase project under **Settings → API**.

### 3. Apply the database migration

**Option A — Supabase CLI**
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**Option B — SQL editor**
Open `supabase/migrations/20240101000000_initial.sql`, paste it into the Supabase **SQL Editor**, and run it.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login` — create an account and start tracking.

---

## Supabase setup checklist

1. Create a new project at [supabase.com](https://supabase.com)
2. Copy `Project URL` and `anon public` key from **Settings → API**
3. Run the migration (see above)
4. Verify RLS is enabled: in the **Table Editor**, confirm the shield icon on the `applications` table is active
5. (Optional) Enable Email confirmations under **Authentication → Providers → Email** — disable "Confirm email" for local dev convenience

---

## Deployment to Vercel

```bash
npm i -g vercel
vercel
```

Or connect the GitHub repo in the Vercel dashboard and set environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |

Vercel auto-detects Next.js; no additional build configuration is needed.

After deploying, update the **Supabase Auth → URL Configuration** with your production URL:
- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/**`

---

## Pipeline stages

| ID | Label | Description |
|---|---|---|
| `future` | Future | Roles you want to track but haven't acted on |
| `watchlist` | Waiting to Apply | Actively watching; ready to apply soon |
| `referred` | Referred | Someone made an introduction |
| `applied` | Applied | Application submitted |
| `hr` | Chat w/ HR | Initial HR screen |
| `hm` | Chat w/ HM | Hiring manager conversation |
| `interview` | Interviewing | Active interview loop |
| `offer` | Offer | Offer received |
| `closed` | Closed | Withdrawn, rejected, or accepted |

---

## Phase 2 roadmap (scaffolded, not yet implemented)

See `TODO` comments in:

- `components/modals/ApplicationModal.tsx` — **Claude AI gap analysis**: paste JD and get a comparison against a stored resume using the Claude API
- `app/dashboard/page.tsx` — **Pipeline analytics**: funnel chart showing stage-by-stage conversion rates
- Chrome extension for auto-capturing job postings from LinkedIn / company career pages

---

## Project structure

```
├── app/
│   ├── layout.tsx            # Root HTML shell, Inter font, global CSS
│   ├── page.tsx              # Redirects → /dashboard
│   ├── login/page.tsx        # Auth page (email/password + magic link)
│   └── dashboard/
│       ├── layout.tsx
│       └── page.tsx          # Server Component: fetches initial data, passes to KanbanBoard
├── components/
│   ├── auth/AuthForm.tsx     # Client-side Supabase auth form
│   ├── board/
│   │   ├── KanbanBoard.tsx   # DndContext, state management, CRUD handlers
│   │   ├── KanbanColumn.tsx  # SortableContext + useDroppable per stage
│   │   ├── KanbanCard.tsx    # useSortable card, click-to-edit
│   │   └── DragOverlayCard.tsx
│   ├── modals/
│   │   └── ApplicationModal.tsx  # Add/edit form (tabbed: Details, Progress, JD)
│   └── ui/
│       ├── Badge.tsx         # Priority and type badges
│       ├── Navbar.tsx        # Top nav: add, export, import, sign-out
│       ├── StatsBar.tsx      # Total / Active / Interviewing / Offers
│       └── FilterBar.tsx     # Multi-chip filters + sort selector
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # Browser Supabase client (@supabase/ssr)
│   │   ├── server.ts         # Server Supabase client (cookies-based)
│   │   └── database.types.ts # Hand-written DB types (generate with supabase CLI)
│   ├── types.ts              # Application interface, Stage config, enums
│   ├── utils.ts              # Filter, sort, stats, formatting helpers
│   └── csv.ts                # CSV export/import (no library dependency)
├── supabase/
│   └── migrations/
│       └── 20240101000000_initial.sql
├── middleware.ts             # Session refresh + auth redirects
└── README.md
```

---

## License

MIT
