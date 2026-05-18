# Job Tracker — Claude Code Instructions

## What this project is

A personal kanban board for tracking job applications. Built with Next.js 14 App Router, Supabase (auth + database), and @dnd-kit for drag-and-drop. Deployed on Vercel. Error monitoring via Sentry with an automated bug-fix pipeline.

Live: https://job-tracker-phi-tan.vercel.app  
Demo account: `demo@jobtracker.dev` / `demo1234`

## Commands

```bash
npm run dev          # start dev server (localhost:3000)
npm run build        # production build
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript type-check
npm test             # Vitest unit tests (run once)
npm run test:watch   # Vitest in watch mode
npm run test:e2e     # Playwright E2E tests
npm run test:coverage  # unit tests + coverage report
```

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router |
| Database + Auth | Supabase (Postgres, Row-Level Security) |
| Drag-and-drop | @dnd-kit/core + @dnd-kit/sortable |
| Styling | Tailwind CSS |
| Error monitoring | Sentry (`captureConsoleIntegration` — forwards `console.error` to Sentry) |
| Deployment | Vercel (auto-deploys on merge to main) |
| CI | GitHub Actions |

## Folder structure

```
app/
  dashboard/         # main kanban board (authenticated)
  login/             # auth page
  api/
    sentry-webhook/  # receives Sentry alerts, triggers auto-fix workflow
components/
  board/             # KanbanBoard, KanbanColumn, DragOverlayCard
  modals/            # ApplicationModal (create/edit/delete)
  ui/                # Navbar, StatsBar, FilterBar
lib/
  types.ts           # Application, Stage, ApplicationStatus, all enums
  utils.ts           # computeStats, getStageApplications, CSV parsing
  supabase/          # client.ts (browser) and server.ts (SSR)
__tests__/           # Vitest unit tests (mirrors src structure)
e2e/                 # Playwright E2E tests
.github/workflows/
  auto-fix.yml       # auto-fix Sentry bugs with Claude Code
  lint.yml           # ESLint + tsc + actionlint on every PR
```

## Key architectural decisions

**Optimistic updates everywhere** — UI updates instantly on drag/edit/delete, DB write happens async, reverts on error. Never show a spinner for local operations.

**`console.error` → Sentry** — errors in catch blocks call `console.error(err)`. `captureConsoleIntegration` picks this up automatically. Never call `Sentry.captureException` directly in application code.

**Supabase RLS** — every table has row-level security. The `user_id` column is always set from `supabase.auth.getUser()` on insert, never from client input.

**dnd-kit column ordering** — `order` field is an integer per-column index. `handleDragOver` updates local state optimistically; `handleDragEnd` persists to DB.

## Testing

Unit tests use **Vitest + jsdom + Testing Library**. E2E uses **Playwright**.

**Every fix or code change must include a corresponding test update.** If you add a function, add a unit test. If you fix a bug, add a test that would have caught it. If you change behaviour, update the existing test to reflect the new expectation.

Coverage thresholds (enforced in `vitest.config.ts`):

| Metric | Threshold | Why |
|---|---|---|
| Lines | 85% | Primary signal — currently at ~97% |
| Statements | 85% | Same as lines for this codebase |
| Branches | 80% | Catches untested conditionals |
| Functions | 65% | Lower because React components have many inline arrow functions (onChange, map callbacks) that require per-field interaction tests to cover; goal is 70%+ over time |

New code that drops any metric below its threshold will fail CI. KanbanBoard, KanbanColumn, and DragOverlayCard are excluded from unit coverage because they require a real drag context — they are covered by Playwright E2E tests instead.

**Do not mock Supabase in integration tests** — the mock singleton caused a production incident where mocked tests passed but a real migration failed. Use real Supabase or test utilities that hit a real DB.

The global Supabase mock in `vitest.setup.ts` is only for component rendering tests where DB calls are irrelevant to what's being tested.

## Auto-fix pipeline

When a Sentry alert fires:
1. Sentry POSTs to `/api/sentry-webhook` (Vercel)
2. Route validates HMAC signature, dispatches `repository_dispatch` to GitHub
3. `auto-fix.yml` workflow runs:
   - Finds existing GitHub issue by Sentry URL or creates one
   - Reopens if closed (handles regressions)
   - Runs `claude --dangerously-skip-permissions` to fix the bug
   - Opens a PR and comments on the issue

Required secrets:
- **Vercel**: `SENTRY_WEBHOOK_SECRET`, `GH_PAT`, `GITHUB_REPO`
- **GitHub Actions**: `ANTHROPIC_API_KEY`
- **GitHub repo setting**: Actions → General → allow GitHub Actions to create PRs

The `on: issues` trigger fires for both manually-created issues (containing `sentry.io` in the body) and issues created by `sentry[bot]` (a third-party GitHub App). GitHub only blocks workflow triggers from `github-actions[bot]` (the built-in `GITHUB_TOKEN` actor) to prevent loops — third-party apps like `sentry[bot]` are not restricted. The `repository_dispatch` path is the primary path for Sentry alerts; the `on: issues` path is a fallback for manual issue creation.

## CI workflows

**`lint.yml`** — runs on every PR and push to main:
- `npm run lint` (ESLint) — requires `.eslintrc.json` to exist; without it `next lint` runs an interactive setup wizard and fails CI
- `npx tsc --noEmit` (TypeScript)
- `actionlint` (validates workflow YAML — catches shell injection, expression errors, and YAML syntax bugs in `run:` blocks)

**Always run `actionlint` locally before pushing changes to any `.github/workflows/` file.** Install: `brew install actionlint` (macOS). The feedback loop for workflow bugs is 5+ minutes per iteration (full CI run); catching them locally is the only way to avoid the churn.

### GitHub Actions YAML pitfalls (learned the hard way)

- **`if:` expressions must be on a single line.** Using `|` (block scalar) adds a trailing newline that GitHub's expression parser silently rejects — the job is skipped with no error message.
- **Blank lines inside `run: |` blocks break YAML.** A blank line followed by a line starting at column 0 terminates the block scalar. Use `echo ""` for blank lines in shell output, not literal blank lines.
- **`~` does not expand inside double-quoted strings.** Use `$HOME` instead of `~` in any quoted context (shellcheck SC2088).
- **Quote `$GITHUB_OUTPUT` and `$GITHUB_PATH`.** These are file paths; shellcheck (SC2086) correctly flags unquoted use.
- **Pin GitHub Action versions with exact tags** (e.g., `rhysd/actionlint@v1.7.7`), not floating major versions like `@v1` which may not exist as a tag.
- **Consecutive `>> file` redirects** should be consolidated with `{ cmd1; cmd2; } >> file` (shellcheck SC2129).

## README

**Always update `README.md` when making user-facing changes** — new features, changed behaviour, updated setup steps, or new environment variables. The README is the first thing a new user or reviewer reads; keep it accurate.

## Code conventions

- No comments unless the WHY is non-obvious
- No `Sentry.captureException` in application code — use `console.error`
- All DB writes go through the Supabase client, never raw SQL from the client
- New enum values (ApplicationStatus, ApplicationType, etc.) must be added to `lib/types.ts` and the corresponding Supabase migration
- `referrer` is nullable — always guard with `?? null`, never cast to string without a null check
