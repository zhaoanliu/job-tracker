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

**When making any fix, explicitly evaluate each layer below in order and state your reasoning for each one — do not skip silently.** Add a guard at the earliest layer that applies:
1. **TypeScript type** — can a stricter type or removing a cast prevent this class of bug entirely?
2. **Unit test** — can a fast, local test catch a regression before it reaches CI?
3. **Lint / actionlint rule** — verify by actually running the tool; don't assume it catches something without checking.
4. **CI check** — does this need a new step in `lint.yml` to catch it on every PR?
5. **CLAUDE.md note** — if none of the above are feasible, document the gotcha so it isn't rediscovered.

For each layer you skip, say why it doesn't apply (e.g. "N/A — shell script, not TypeScript" or "actionlint tested locally, does not catch this flag"). Jumping straight to step 5 without showing the reasoning for steps 1–4 is not acceptable.

The goal is to shift failures left: a TypeScript error beats a unit test failure, which beats a CI failure, which beats a production Sentry event.

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

**Run tests proactively — do not wait to be asked.** If there is an obvious test to run after a fix or change (e.g. re-dispatching with the same Sentry URL to verify deduplication), just run it and report the result. Only pause to ask if the test has side effects that could surprise the user (e.g. sending external messages, modifying shared state irreversibly).

**Test the workflow directly — do not trigger end-to-end through Sentry.** The `repository_dispatch` event can be fired locally with one command:

```bash
gh api repos/zhaoanliu/job-tracker/dispatches \
  --method POST \
  -f event_type=sentry-issue \
  -f 'client_payload[title]=TypeError: your error here' \
  -f 'client_payload[sentry_url]=https://sentry.io/organizations/zhaoans-org/issues/ISSUE_ID/' \
  -f 'client_payload[culprit]=/dashboard'
```

Then watch with `gh run list --limit 3`. This takes seconds to set up vs. triggering a live crash, waiting for Sentry to detect it, fire the webhook, and dispatch — which adds 5+ minutes of latency and requires resolving the Sentry issue each time to re-trigger. Only do full end-to-end testing when verifying the Sentry webhook path itself.

**Always run `actionlint` locally before pushing changes to any `.github/workflows/` file.** Install: `brew install actionlint` (macOS). The feedback loop for workflow bugs is 5+ minutes per iteration (full CI run); catching them locally is the only way to avoid the churn.

### GitHub Actions YAML pitfalls (learned the hard way)

- **`if:` expressions must be on a single line.** Using `|` (block scalar) adds a trailing newline that GitHub's expression parser silently rejects — the job is skipped with no error message.
- **Blank lines inside `run: |` blocks break YAML.** A blank line followed by a line starting at column 0 terminates the block scalar. Use `echo ""` for blank lines in shell output, not literal blank lines.
- **`~` does not expand inside double-quoted strings.** Use `$HOME` instead of `~` in any quoted context (shellcheck SC2088).
- **Quote `$GITHUB_OUTPUT` and `$GITHUB_PATH`.** These are file paths; shellcheck (SC2086) correctly flags unquoted use.
- **Pin GitHub Action versions with exact tags** (e.g., `rhysd/actionlint@v1.7.7`), not floating major versions like `@v1` which may not exist as a tag.
- **Consecutive `>> file` redirects** should be consolidated with `{ cmd1; cmd2; } >> file` (shellcheck SC2129).
- **Both `repository_dispatch` and `on: issues` fire simultaneously** when Sentry alerts — the webhook triggers a dispatch AND `sentry[bot]` opens a GitHub issue at the same time. Without a concurrency group both runs push to main and one gets rejected. The workflow uses `concurrency: group: auto-fix, cancel-in-progress: false` to queue them.
- **`sentry[bot]` and our webhook use different Sentry URL formats** — webhook sends `https://sentry.io/api/0/.../issues/ID/`, sentry[bot] writes `https://org.sentry.io/issues/ID/`. The numeric ID is still extracted with `grep -oE '[0-9]{7,}'` for the Sentry API resolve call, but GitHub issue deduplication matches by title (not URL or ID) to avoid format-mismatch failures.
- **`gh issue list --search` uses the full-text search index, which has non-deterministic lag on newly-created issues.** Use `gh issue list --state open --limit 50 --json number,title` (the REST list API) and filter locally with jq instead. The list API returns current data immediately with no indexing step. Use `--state open` only — `sentry[bot]` always creates a fresh open issue per alert (regressions included), so searching closed issues risks accidentally reopening an old unrelated issue with the same error title.
- **The second queued run will fail to push if the first already committed to main.** Even with `cancel-in-progress: false`, the second run checks out a stale copy of main. After making the fix, it must `git fetch origin main && git rebase origin/main`, then check `COMMITS_AHEAD=$(git rev-list origin/main..HEAD --count)` — if 0, the fix was already applied by the first run and the push is skipped. Always comment + close the issue regardless.
- **`gh issue create` does not support `--json`/`--jq`** — those flags are only on read commands (`gh issue list`, `gh issue view`). Capture the URL it prints to stdout and extract the number: `NUMBER=$(gh issue create ... | grep -oE '[0-9]+$')`.

## README

**Always update `README.md` when making user-facing changes** — new features, changed behaviour, updated setup steps, or new environment variables. The README is the first thing a new user or reviewer reads; keep it accurate.

**When updating CLAUDE.md, grep for related terms first.** Before adding a new note, search for existing notes on the same topic and update or remove anything the change supersedes. Don't only append — stale notes that contradict current behaviour are worse than no notes.

## Git commits

Bundle related changes — code and the documentation that explains them — into a single commit. A separate "docs:" commit for a CLAUDE.md note or README update that accompanies a code change adds noise to history and implies independence that isn't there. Only split into separate commits when the changes are genuinely independent.

## Code conventions

- No comments unless the WHY is non-obvious
- No `Sentry.captureException` in application code — use `console.error`
- All DB writes go through the Supabase client, never raw SQL from the client
- New enum values (ApplicationStatus, ApplicationType, etc.) must be added to `lib/types.ts` and the corresponding Supabase migration
- `referrer` is nullable — always guard with `?? null`, never cast to string without a null check
