# Job Tracker — Claude Code Instructions

## What this project is

A personal kanban board for tracking job applications. Built with Next.js 14 App Router, Supabase (auth + database), and @dnd-kit for drag-and-drop. Deployed on Vercel. Error monitoring via Sentry with an automated bug-fix pipeline.

Live: https://applytrackr.app  
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
| Error monitoring | Sentry (`captureConsoleIntegration` in both `instrumentation-client.ts` and `instrumentation.ts` — forwards `console.error` to Sentry for browser and server errors) |
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
  auth.ts            # getAuthenticatedUser() — shared auth guard for API routes
  github.ts          # getGitHubCreds(), dispatchGitHubEvent(), createGitHubIssue()
  supabase/          # client.ts (browser) and server.ts (SSR)
__tests__/           # Vitest unit tests (mirrors src structure)
e2e/
  auth.spec.ts       # password auth flows — run in CI against hosted Supabase
  auth.email.spec.ts # magic link + signup via Testmail.app — run in CI (skipped if TESTMAIL_API_KEY unset)
  helpers.ts         # shared test utilities (env-var-driven, local Supabase defaults)
  local/             # board + CSV tests — require supabase start, run via nightly cron only
.github/
  workflows/         # GitHub Actions CI/CD, auto-fix, and feature design/implement pipelines
    auto-fix.yml     # auto-fix Sentry bugs with Claude Code
    lint.yml         # ESLint + tsc + actionlint on every PR
    e2e.yml          # auth E2E on every PR/push (no local Supabase)
    e2e-local.yml    # board + CSV E2E — nightly cron + push to main on relevant paths (supabase start)
  actions/           # reusable composite actions
  designs/           # design proposals committed by feature-design.yml; one file per feature
```

## Key architectural decisions

**Optimistic updates everywhere** — UI updates instantly on drag/edit/delete, DB write happens async, reverts on error. Never show a spinner for local operations.

**`console.error` → Sentry** — errors in catch blocks call `console.error(err)`. `captureConsoleIntegration` in both `instrumentation-client.ts` (browser) and `instrumentation.ts` (server/edge) picks this up automatically on both sides. Never call `Sentry.captureException` directly in application code.

**Transient browser-network errors are filtered from Sentry** — `Failed to fetch` / `NetworkError` / `Load failed` / `AbortError` are caused by offline state, ad blockers, page unloads, or upstream outages, not application bugs. They're listed in `ignoreErrors` in `instrumentation-client.ts` so they don't trigger the auto-fix bot. Do not remove entries from that list without a replacement plan — every removal is a recurring auto-fix noise source.

**Browser-extension hydration errors are filtered via `beforeSend`** — password managers and other extensions inject DOM attributes (e.g. `data-lastpass-icon-root`, `data-1password-filled`) that cause React to see a server/client mismatch. These errors have no stack frames inside `/_next/` because the mismatch originates outside app code. The `beforeSend` callback in `instrumentation-client.ts` drops hydration errors with no app-code frames. Hydration errors that DO have `/_next/` frames (real app bugs) are still reported.

**Supabase RLS** — every table has row-level security. The `user_id` column is always set from `supabase.auth.getUser()` on insert, never from client input.

**dnd-kit column ordering** — `order` field is an integer per-column index. `handleDragOver` updates local state optimistically; `handleDragEnd` persists to DB.

**Env-var guards must never be removed** — patterns like `if (!process.env.X) { notFound() }` or `if (!process.env.X) { redirect(...) }` are intentional failure modes for missing configuration, not dead code. If such a guard is triggering, the fix is to ensure the env var is set in the deployment environment, not to remove the guard. Removing a guard turns a clean 404/redirect into an unhandled runtime error.

## README

**After every change, check whether README.md needs updating and update it in the same commit — do not wait to be asked.** The README is the first thing a new user or reviewer reads; keep it accurate.

Update it whenever you change anything that affects:
- Features or behaviour visible in the UI
- Setup steps (env vars, secrets, third-party integrations, GitHub settings)
- New secrets or configuration — including GitHub Actions secrets like `SENTRY_AUTH_TOKEN`
- The auto-fix pipeline or CI workflows
- Architecture decisions

The "user-facing" bar is intentionally low — ops and setup changes count too. When in doubt, update it.

**When updating CLAUDE.md, grep for related terms first.** Before adding a new note, search for existing notes on the same topic and update or remove anything the change supersedes. Don't only append — stale notes that contradict current behaviour are worse than no notes.

## Git commits

Bundle related changes — code and the documentation that explains them — into a single commit. A separate "docs:" commit for a CLAUDE.md note or README update that accompanies a code change adds noise to history and implies independence that isn't there. Only split into separate commits when the changes are genuinely independent.

When doing a doc review that produces multiple small fixes across README and CLAUDE.md, bundle them all into one commit (e.g. "docs: end-of-session review fixes") rather than a separate commit per file or per fix.

**`main` is read-only. Never edit or commit files directly on the `main` branch.** This applies to every file change without exception — code, config, settings, CLAUDE.md, CI workflows, documentation. A one-line settings tweak needs a worktree and a PR just as much as a feature does.

**Before your first Edit or Write call in any session, you must have already: (1) created an issue, (2) created a worktree.** If you are about to call Edit or Write and no worktree exists yet — stop and do those two steps first. This applies to every file without exception: `.claude/settings.json`, `CLAUDE.md`, `README.md`, CI workflows, scripts, everything.

The three steps in order:
1. `gh issue create` with the appropriate label and a clear title. Issue titles use **plain text only** — never use conventional-commit prefixes (`feat:`, `chore:`, `refactor:`, etc.) in an issue title. The only allowed prefixes are:
   - `[Feature Request] Title` — user-submitted feature requests (with `user-requested` label). Also add the correct status label at creation time: implementing immediately → `status: in progress`; tracking for future → `status: backlog`
   - `fix: Title` — bug fixes (with `bug` label). **If you are implementing the fix immediately in the same session, also add `status: in progress` in the same command** — `bug-fix.yml` checks for this label and skips, preventing a duplicate bot-generated PR.
   - Everything else (internal features, CI/infra work, docs, refactors) — **plain descriptive title, no prefix**. Also add `status: in progress` if implementing immediately in the same session. Examples: "Gate Vercel production deploys on CI passing", "Add slash commands for common workflows"
2. **Create a git worktree** — run `git worktree add ../job-tracker-N -b <branch-name> origin/main` and do all subsequent work (file edits, commits, pushes) from that directory. Use `origin/main` (not local `main`) so the worktree is always based on the latest remote state even if local main is behind. Do not edit-then-copy into the worktree; only edit inside the worktree. This keeps parallel sessions fully isolated on disk so uncommitted changes from one session can't bleed into another. Branch naming: `fix/issue-N-<timestamp>`, `feat/issue-N-<slug>`, or `docs/issue-N-<slug>` (branch prefixes follow conventional commits; issue title prefixes do not). **Never hardcode local absolute paths in any committed file** — use `git rev-parse --show-toplevel` for the repo root or relative paths instead. Hardcoded paths break on other machines and expose personal directory structure in the repo history.

   **Never use `cd /path/to/worktree && <command>` in shell commands.** Commands are allowlisted by their leading token — `cd /path && git diff` starts with `cd`, not `git`, and will prompt for permission even though `git *` is in the allowlist. Instead: use `git -C /abs/path/to/worktree <subcommand>` for git operations, or run tools with absolute paths as arguments. Reserve `cd` for standalone navigation only.

   **For file reads mid-session:** if a worktree exists for the current task, read files from it — the worktree may have uncommitted changes not yet on main. If no worktree has been created yet in the session, reading from the main working directory is fine. Never create a worktree just to read files.
3. Open a PR whose title is **`<issue title> (#N)`** — copy the issue title verbatim and append the issue number in parentheses. Example: `[Feature Request] Add dark mode (#88)`. `Closes #N` in the body auto-closes the issue on merge.

## Testing

**Before committing any code change, run `npm run test:coverage`** (not `npm test`). CI (`test.yml`) runs `npm run test:coverage` and enforces thresholds (lines ≥85%, branches ≥80%, functions ≥65%). The bare `npm test` skips coverage reporting and will miss threshold failures, forcing a round-trip through CI + auto-fix.

### AC tagging — unit tests must map to design acceptance criteria

**When implementing a feature from a design issue (one with `<!-- implementation-plan-json -->`), every acceptance criterion must have at least one tagged unit test.** Tag each covering test's `it()` description with `[AC-{issue}-{N}]` where `{issue}` is the design issue number and `{N}` is the 1-based position of that criterion in the "## Acceptance criteria" list.

Design issues show the exact tag on each AC item (e.g. `- [ ] [AC-88-1] Description`) — copy it directly into the `it()` description:
```ts
it('saves application to database [AC-88-1]', () => { ... })
it('shows error toast on network failure [AC-88-2]', () => { ... })
it('filters out archived jobs [AC-88-3]', () => { ... })
```

CI (`test.yml`) runs `scripts/check-ac-coverage.mjs` on every PR, which:
- Fails if the AC section is empty or has no checkbox items
- Fails if any AC item has no tagged test
- Fails if any tagged test fails
- Checks off passing AC items in the design issue

Tag an existing test if it already covers the criterion; write a new one only when no existing test covers it. The `feature-implement.yml` bot includes this instruction automatically when a design issue is linked.

**Known test gotchas:**
- `required` HTML attribute on inputs blocks jsdom form submission — use `fireEvent.submit(form)` to bypass it, not a submit button click
- Supabase `createClient` mock in `vitest.setup.ts` creates a new object on each call — override with a local `vi.mock(...)` in test files that need to spy on auth methods
- `parseCsv` uses a character-stream parser (not naive `\n` split) — test with CSV fields that contain quoted newlines to verify

### E2E tests are required for every user-facing feature

**Every PR that adds or changes user-facing behaviour must include an E2E test in the same commit.** Unit tests verify logic; E2E tests verify that the feature actually works and looks right in a browser. A feature is not done until both exist.

Ask explicitly before finishing any feature: *"What E2E test covers this?"* If the answer is "none", write one before opening the PR.

**What always needs an E2E test:**
- Any new UI interaction (button, modal, form, tab, toggle)
- Any workflow that spans multiple steps (add → edit → drag → verify)
- Any state that must survive a page reload (theme, filter, ordering)
- Any visual feature (theme, layout change, new component) — use `toHaveScreenshot()` for these

**Visual regression tests use `toHaveScreenshot()`:**
```ts
await expect(page).toHaveScreenshot('board-light.png', { maxDiffPixelRatio: 0.02 })
```
Baselines are committed to the repo. Always regenerate baselines on Linux (same OS as CI) to avoid platform rendering differences.

**Snapshot updates must be an explicit human decision — never automated.** When a visual test fails, the correct response is to investigate the diff, not to run `--update-snapshots`. Only run `--update-snapshots` after a human has reviewed the diff images and confirmed the change is intentional. Commit snapshot updates in a clearly labelled standalone commit (e.g. `test: update visual snapshots for Tailwind v4 style changes`) so they are visible and reviewable in the PR. Never let a bot, auto-fix pipeline, or unreviewed script regenerate snapshots — that defeats the entire purpose of having them.

**Where E2E tests live:**
- `e2e/auth.spec.ts` — auth flows that run on every PR (no local Supabase needed)
- `e2e/local/auth.spec.ts` — auth flows + logout regression (production build required)
- `e2e/local/board.spec.ts` — board interactions requiring `supabase start` (nightly cron)
- `e2e/local/csv.spec.ts` — CSV import/export (nightly cron)
- `e2e/local/visual.spec.ts` — visual regression screenshots (nightly cron)
- New board features go in `e2e/local/`; new auth flows go in `e2e/`

**e2e-local runs against a production build (`npm run build && npm start`), not `npm run dev`.** The dev server loads all modules individually, never tree-shakes, never creates isolated chunks, and skips SSR/hydration in ways that hide entire classes of bugs. A production build is required to catch: webpack chunk isolation failures, tree-shaking removing a module a chunk relied on as a side-effect, SSR/hydration mismatches, route prerendering errors, and PostCSS purge removing a class that was actually needed. Use `playwright.config.local.ts` when running local tests manually: `npx playwright test --config playwright.config.local.ts e2e/local/`.

**Prevention layer split for isolated-chunk bugs (e.g. issue #634):**

| Layer | What it catches | What it misses |
|---|---|---|
| ESLint `no-restricted-imports` | The bad import pattern — fires on every PR, before Vercel sees the code | Nothing about runtime behavior |
| Production-build e2e | "Works in dev, breaks in prod" bugs that are deterministic (always crash) | Stale-cache / deployment-mismatch crashes |
| Neither | — | A user mid-session when a new deployment changes shared chunk hashes — old chunks cached, new isolated chunk loaded, module ID mismatch → `TypeError` |

The stale-cache scenario is un-testable in CI. The ESLint rule is the correct prevention layer for the #634 class of bug.

**Next.js upgrades can silently expose broken isolated-chunk imports.** `global-error.tsx` and `not-found.tsx` are compiled into their own webpack chunks, isolated from the main app bundle. Third-party imports (e.g. `@sentry/nextjs`) that work fine in the main bundle may be unresolvable in an isolated chunk — webpack registers the module as `undefined` and throws a `TypeError` at runtime. This failure is masked by older Next.js versions and can appear suddenly after an upgrade. Before merging any Next.js version bump, verify that `global-error.tsx` and `not-found.tsx` contain no static third-party imports. See `docs/postmortem-issue-634.md` for the full incident writeup (issue #634, triggered by the v15.5.18 upgrade in PR #621).

**The dark mode lesson:** The first dark mode implementation only wired up the backend without a UI toggle. There was no E2E test, so the missing button shipped undetected and required a second fix. If an E2E test had been required in the original PR, the missing toggle would have been caught immediately.

**Library upgrades that affect rendering must pass visual regression tests before merging.** Any major version bump of a styling or rendering dependency — Tailwind CSS, PostCSS, Next.js, React — can silently break the UI in ways that unit tests and functional E2E tests cannot catch (default value changes, removed class names, layout shifts). Before merging such a PR:
1. Run `npx playwright test e2e/local/visual.spec.ts` against the branch
2. If any snapshot diffs appear, inspect them — expected changes (e.g. intentional v4 style changes) require a baseline update with `--update-snapshots`; unexpected diffs indicate a regression that must be fixed first
3. Do not skip this step because "CI passed" — CI does not run visual tests on PRs, only on the nightly cron

## No duplication

**Before writing any function, component, hook, type, constant, or shell block — search the codebase for an existing implementation first.** If one exists, use or extend it. Never write a second copy.

**The moment of extraction is before the second copy is written, not after.** Once two copies exist, both must be maintained and bugs must be fixed twice — as happened with the `gh pr merge || true` bug surviving in 3 of 4 auto-fix workflows simultaneously. The right time to extract is when you realize you need the same thing a second time.

**"It's slightly different" is not a reason to copy — it is a reason to add a parameter.** Small variations between copies are handled through function arguments, component props, or action inputs. A parametric abstraction with two callers is always better than two near-identical copies.

Where to extract, by type:

| What | Where |
|---|---|
| Shared React UI | `components/ui/` |
| Data transformation, filtering, formatting | `lib/utils.ts` |
| Types, enums, status values | `lib/types.ts` |
| Supabase query helpers | `lib/supabase/` |
| Custom React hooks | `hooks/` (create if needed) |
| Repeated workflow `run:` blocks | `.github/actions/<name>/action.yml` |

Before writing any code block longer than ~10 lines: grep for a similar pattern. If you find one, extract before writing the second occurrence. If you don't find one, write it in the right location so it can be found and reused later.

## Code conventions

- No comments unless the WHY is non-obvious
- No `Sentry.captureException` in application code — use `console.error`
- All DB writes go through the Supabase client, never raw SQL from the client
- New enum values (ApplicationStatus, ApplicationType, etc.) must be added to `lib/types.ts` and the corresponding Supabase migration
- `referrer` is nullable — always guard with `?? null`, never cast to string without a null check
- Read the actual API/payload schema before writing integration code — never infer field names from template variable names or analogy; they are often completely different schemas (e.g. Supabase HTTP hook payload vs Go email template variables share no field names)
- Automate before listing manual Dashboard steps — check whether a Management API, CLI, or SDK call exists first. Supabase auth config → `PATCH /v1/projects/{ref}/config/auth`; Vercel env vars → `vercel env add`; GitHub repo settings → `gh api`. Only fall back to manual browser instructions if no API exists.
- `gh` read commands (`gh run list`, `gh run view`, `gh issue list`, `gh pr list`) do not need user confirmation — run them directly. Only pause for destructive operations (closing issues, merging PRs, force-pushing).
