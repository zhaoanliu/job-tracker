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
  supabase/          # client.ts (browser) and server.ts (SSR)
__tests__/           # Vitest unit tests (mirrors src structure)
e2e/
  auth.spec.ts       # password auth flows — run in CI against hosted Supabase
  auth.email.spec.ts # magic link + signup via Testmail.app — run in CI (skipped if TESTMAIL_API_KEY unset)
  helpers.ts         # shared test utilities (env-var-driven, local Supabase defaults)
  local/             # board + CSV tests — require supabase start, run via nightly cron only
.github/workflows/
  auto-fix.yml       # auto-fix Sentry bugs with Claude Code
  lint.yml           # ESLint + tsc + actionlint on every PR
  e2e.yml            # auth E2E on every PR/push (no local Supabase)
  e2e-local.yml      # board + CSV E2E — nightly cron + push to main on relevant paths (supabase start)
```

## Key architectural decisions

**Optimistic updates everywhere** — UI updates instantly on drag/edit/delete, DB write happens async, reverts on error. Never show a spinner for local operations.

**`console.error` → Sentry** — errors in catch blocks call `console.error(err)`. `captureConsoleIntegration` in both `instrumentation-client.ts` (browser) and `instrumentation.ts` (server/edge) picks this up automatically on both sides. Never call `Sentry.captureException` directly in application code.

**Transient browser-network errors are filtered from Sentry** — `Failed to fetch` / `NetworkError` / `Load failed` / `AbortError` are caused by offline state, ad blockers, page unloads, or upstream outages, not application bugs. They're listed in `ignoreErrors` in `instrumentation-client.ts` so they don't trigger the auto-fix bot. Do not remove entries from that list without a replacement plan — every removal is a recurring auto-fix noise source.

**Browser-extension hydration errors are filtered via `beforeSend`** — password managers and other extensions inject DOM attributes (e.g. `data-lastpass-icon-root`, `data-1password-filled`) that cause React to see a server/client mismatch. These errors have no stack frames inside `/_next/` because the mismatch originates outside app code. The `beforeSend` callback in `instrumentation-client.ts` drops hydration errors with no app-code frames. Hydration errors that DO have `/_next/` frames (real app bugs) are still reported.

**Supabase RLS** — every table has row-level security. The `user_id` column is always set from `supabase.auth.getUser()` on insert, never from client input.

**dnd-kit column ordering** — `order` field is an integer per-column index. `handleDragOver` updates local state optimistically; `handleDragEnd` persists to DB.

**Env-var guards must never be removed** — patterns like `if (!process.env.X) { notFound() }` or `if (!process.env.X) { redirect(...) }` are intentional failure modes for missing configuration, not dead code. If such a guard is triggering, the fix is to ensure the env var is set in the deployment environment, not to remove the guard. Removing a guard turns a clean 404/redirect into an unhandled runtime error.

## DB schema changes

Every schema change follows this checklist — skipping any step is what caused the `status_history` incident (table deployed to prod days after the code that needed it, with no visible errors because Supabase `PostgrestError` objects log as `[object Object]` in Sentry).

**Checklist for adding or modifying a table:**

1. **Create the migration file** in `supabase/migrations/` with a timestamp prefix (`YYYYMMDDHHMMSS_description.sql`). Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` so re-running is safe.

2. **Enable RLS and add a policy** on every new table. Use the `DO $$` pattern so the migration is safe to re-run:
   ```sql
   alter table public.<table> enable row level security;
   do $$
   begin
     create policy "Users can only access their own <table>"
       on public.<table> for all
       using (auth.uid() = user_id)
       with check (auth.uid() = user_id);
   exception when duplicate_object then null;
   end $$;
   ```
   Note: dollar-quoting requires `$$` (not bare `$`) — a single `$` causes a syntax error.

3. **Update `lib/types.ts`** — add the TypeScript interface and any new enum values. New enum values also need to be added to the corresponding constant arrays in the same file.

4. **Write the feature code and tests** — the new table can be referenced in code immediately; `migrate.yml` will apply it when the PR merges.

5. **Merge to main** — `migrate.yml` runs automatically on every push to main, applies all pending migrations via `supabase link + supabase db push`. No manual SQL steps needed.

**Supabase error logging rules** (learned from this incident):
- Always log `error.message` alongside the raw error object: `console.error('context:', error.message, error)` — a bare `console.error(error)` shows as `[object Object]` in Sentry and is impossible to diagnose.
- Always log errors in both write paths (`insert`/`update`) AND read paths (`.then(({ data, error }) => ...)`). Silent read failures produce the same symptom as silent write failures and are impossible to distinguish in production.

**Race condition note:** `migrate.yml` and Vercel deployment both trigger on push to main and run in parallel. There is a brief window where new code is live but the migration hasn't applied yet. For this app this is acceptable — the error is logged and the UI shows empty state rather than crashing. If a future feature requires the migration to land before the code, run `gh workflow run migrate.yml` and wait for it to succeed before merging the code change.

## Testing

Unit tests use **Vitest + jsdom + Testing Library**. E2E uses **Playwright**.

**Every fix or code change must include a corresponding test update.** If you add a function, add a unit test. If you fix a bug, add a test that would have caught it. If you change behaviour, update the existing test to reflect the new expectation.

**Adding a new tab, section, or conditional render block to a component is new behaviour — it needs tests even if the component's existing tests still pass.** The existing suite passing is not sufficient; the new section must have at least one test that exercises it.

**Updating `vitest.setup.ts` to extend a mock (e.g., adding a new method to the Supabase chain) is a signal that new component behaviour was added. Before opening a PR, verify the test file for every modified component covers that new behaviour.**

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
   - Finds open GitHub issue matching the error title via list API, or creates one
   - Fetches the full Sentry event (stack trace, error type/message, culprit) from the Sentry API and injects it into Claude's prompt — without this, Claude only sees the vague GitHub issue title and exhausts its turn limit without finding the bug
   - Skips `replay_hydration_error` issues (Sentry `issueType`) — these have no stack trace and are caused by browser extensions, not application code; the workflow comments on and closes the GitHub issue automatically
   - Runs `claude --dangerously-skip-permissions` to fix the bug
   - **Always creates a PR** — no direct-to-main pushes; every fix is verified by CI (`lint` + `unit-test` + `e2e-auth` + `migrate-validate`) before reaching production
   - **Low-risk fix** (≤2 files, ≤20 lines, null guard / type fix): opens a PR and enables auto-merge (`GH_TOKEN="${GH_PAT}" gh pr merge --auto --squash`) — merges automatically once all required CI checks pass
   - **High-risk fix**: opens a PR for review; no auto-merge — a human must approve and merge
   - In both cases the PR body contains "Closes #N", so merging closes the GitHub issue and triggers `resolve-sentry-on-close` to resolve the Sentry issue — no manual Sentry API call needed
   - **If Claude makes no changes** (e.g. browser-extension hydration errors, environment issues not fixable in code): comments on the GitHub issue, closes it, and resolves the Sentry issue directly — does not open a PR
   - The fix branch is named `fix/issue-<N>-<timestamp>` so repeated runs for the same issue never collide

Required secrets:
- **Vercel**: `SENTRY_DSN`, `SENTRY_WEBHOOK_SECRET`, `GH_PAT`, `GITHUB_REPO`
- **Vercel build** (source map upload): `SENTRY_AUTH_TOKEN` (needs `project:releases` scope — **not** the same token as GitHub Actions), `SENTRY_ORG=zhaoans-org`, `SENTRY_PROJECT=javascript-nextjs` (the Sentry project slug is `javascript-nextjs`, not the repo name — wrong value silently breaks source map uploads). After a successful build the Sentry files API returns `fileCount: -1` for the release — that is correct and expected; it means source maps are stored as artifact bundles (the newer format), not as individual release files.
- **GitHub Actions**: `ANTHROPIC_API_KEY`, `SENTRY_AUTH_TOKEN` (needs Issue & Event: Read & Write), `VERCEL_TOKEN` (generate at vercel.com → Account Settings → Tokens — needed by `cd.yml` to deploy to Vercel after all CI passes)
- **GitHub repo settings** (required for auto-merge and branch protection to work):
  - Actions → General → enable "Allow GitHub Actions to create and approve pull requests"
  - General → enable "Allow auto-merge"
  - Branches → Add branch protection rule for `main` → no direct pushes, enable "Require status checks to pass before merging" → add required checks: `lint`, `unit-test`, `e2e-auth`, `migrate-validate`. Do not add `e2e-local` — it is async/non-blocking and does not run on PRs.

**All Vercel deploys are gated on all CI passing.** `vercel.json` sets `ignoreCommand: exit 0` to disable Vercel's auto-deploy entirely. Note: Vercel's exit code semantics are the opposite of Unix convention — `exit 0` means **skip the build**, `exit 1` means **proceed**. `cd.yml` owns all deployments — it calls all 4 CI workflows in parallel on push to main, then runs the deploy job only when all pass: first `supabase db push`, then `vercel deploy --prod`. This guarantees migrations land before the new code is served. No preview deploys — not needed for a single-reviewer project. `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are hardcoded in `cd.yml` — no additional secrets needed for those.

Sentry alerts fire `repository_dispatch` (primary path). The `on: issues: labeled` path fires for any issue where the `bug` label is added — covering both manually-created bug issues and any issue labelled by `sentry[bot]`. The concurrency group (`group: auto-fix, cancel-in-progress: false`) queues concurrent runs so they don't race. GitHub only blocks workflow triggers from `github-actions[bot]` (the built-in token actor) — third-party apps like `sentry[bot]` are not restricted.

## CI workflows

**CI — 4 required checks** (run on every PR via standalone trigger; called in parallel by `cd.yml` on push to main):

**`lint.yml`** — job: `lint`
- ESLint, `npx tsc --noEmit`, `actionlint`
- Requires `.eslintrc.json` to exist; without it `next lint` runs an interactive setup wizard and fails CI

**`test.yml`** — job: `unit-test`
- `npm run test:coverage` — runs all 181 Vitest unit tests and enforces coverage thresholds (lines ≥85%, branches ≥80%, functions ≥65%)
- Fails CI if any test fails or any threshold is not met

**`e2e.yml`** — job: `e2e-auth`
- `auth.spec.ts` — password login/logout/redirect, uses hosted Supabase via secrets
- `auth.email.spec.ts` — magic link + signup confirmation via Testmail.app
- Required secrets: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TESTMAIL_API_KEY`, `TESTMAIL_NAMESPACE`

**`migrate-validate.yml`** — job: `migrate-validate`
- Runs `supabase start` against the local stack — applies all migrations in `supabase/migrations/` to a fresh local DB
- Fails CI if any migration has a SQL error or schema conflict
- No secrets needed (uses well-known local dev keys from Supabase demo)

**CD — runs on push to main:**

**`cd.yml`** — calls all 4 CI workflows in parallel; deploy job runs only when all pass:
1. `supabase db push` — applies pending migrations to the production DB
2. `vercel deploy --prod` — deploys the app
- Sequential order guarantees migrations land before new code is served
- If `supabase db push` fails: fires `db-failure` dispatch → `db-fix.yml`
- If `vercel deploy` fails: Vercel updates deployment status → `cd-filter.yml` → `cd-auto-fix.yml`
- Required secrets: `SUPABASE_ACCESS_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `VERCEL_TOKEN`
- **Supabase CLI note**: `supabase db push --project-ref` was removed in CLI v2 — `cd.yml` uses `supabase link` first, then `supabase db push`
- **Supabase CLI baseline pitfall**: when first connecting to an existing project, the CLI may baseline all local migrations without executing the SQL. To force a specific migration to re-run: add `supabase migration repair --status reverted <timestamp>` before `supabase db push` in the deploy job. Remove it after one successful run.
- **Supabase CLI version is pinned** (`version: 2.100.1`) in `cd.yml`, `migrate-validate.yml`, and `e2e-local.yml` — `version: latest` makes a GitHub API call to resolve the latest release and fails with a rate-limit error on busy runners. When upgrading, update the version in all three files. Check the latest stable release at `gh release list --repo supabase/cli --limit 5`.

**Async / non-blocking:**

**`e2e-local.yml`** — board + CSV E2E tests against a real local Supabase instance:
- Starts local Supabase via `supabase start`, runs `e2e/local/` test suite
- Triggers: nightly cron (06:00 UTC), `workflow_dispatch`, and push to main (path-filtered to board/modal/CSV/migration paths)
- Not a required CI check — async and non-blocking; path filter keeps it from running on every push

**Doc-only changes skip CI and CD entirely.** `cd.yml`, `lint.yml`, `test.yml`, `e2e.yml`, and `migrate-validate.yml` all have `paths-ignore` for `**/*.md` and `docs/**`. GitHub treats path-filtered required checks as passing, so doc-only PRs can merge without CI running. `workflow_call` triggers have no path filter — when `cd.yml` triggers for a code push it still calls all 4 workflows unconditionally. When adding a new CI workflow that should also skip on doc-only changes, add the same `paths-ignore` block to its `pull_request` trigger.

**When adding a new CI workflow**, add the ci-failure dispatch at the end (use `gh api + jq`, not `github-script` — see pitfalls below):
```yaml
- name: Trigger CI auto-fix on failure
  if: failure() && github.actor != 'github-actions[bot]'
  env:
    GH_TOKEN: ${{ secrets.GH_PAT }}
  run: |
    jq -n \
      --arg wf "${{ github.workflow }}" \
      --arg id "${{ github.run_id }}" \
      --arg url "https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}" \
      --arg branch "${{ github.ref_name }}" \
      '{"event_type":"ci-failure","client_payload":{"workflow_name":$wf,"run_id":$id,"run_url":$url,"head_branch":$branch}}' \
    | gh api repos/${{ github.repository }}/dispatches --method POST --input -
```
Skip it for purely infra/ops workflows (deploy-only, release tagging, dependency updates).

**`ci-auto-fix.yml`** — auto-healing for CI failures; triggers on `repository_dispatch` with `event_type: ci-failure` (fired by `lint.yml`, `test.yml`, `e2e.yml`, `migrate-validate.yml`, and `e2e-local.yml` on failure; also fired by `cd.yml`'s called workflows when they fail on main):
- Checks out the failing branch, fetches up to 500 lines of failed-step logs via `gh run view --log-failed`, and for PR branches also collects the diff vs main
- Finds or creates a GitHub issue titled `"CI failure: <workflow> on <branch>"` using the same list-API deduplication pattern as `auto-fix.yml`
- Runs `claude --dangerously-skip-permissions` to analyze the logs and fix the root cause
- **Feature branch**: always pushes the fix directly to the failing branch so CI re-runs on the same PR
- **Main branch**: always opens a PR — never pushes directly to main
  - **Low-risk** (≤2 files, ≤20 lines, null guard / type / lint fix): enables auto-merge (`gh pr merge --auto --squash`) — merges once all 4 required CI checks pass
  - **High-risk**: opens a PR only; a human must review and merge
- Concurrency group is per-branch (`ci-auto-fix-<branch>`) so simultaneous failures on the same branch queue rather than race
- The fix branch is named `fix/ci-issue-<N>-<timestamp>` so repeated runs never collide
- **No infinite-fix loop** — two layers: (1) GitHub blocks `on: push` / `on: pull_request` triggers for `GITHUB_TOKEN` pushes; (2) the job `if:` skips runs where `actor.login == 'github-actions[bot]'`

**`db-fix.yml`** — auto-healing for production DB migration failures; triggers on `repository_dispatch` with `event_type: db-failure` (fired by `cd.yml` when `supabase db push` fails):
- Fetches the failure logs and classifies the error: PostgreSQL errors (syntax, constraint, policy conflicts) are code-fixable; auth/network errors are infrastructure issues
- **Code error**: runs Claude to fix the migration file, opens a PR — never auto-merges (migrations touch production DB and always need human review)
- **Infra error**: opens a GitHub issue with the run link for manual investigation, no code fix attempted
- Claude is constrained to only edit files under `supabase/migrations/`

**`feature-implement.yml`** — implements approved feature requests; triggers on `issues: labeled` when the `status: auto-implement` label is added (regardless of whether the issue is `user-requested` or owner-initiated):
- Comments on the issue immediately so the submitter sees it's in progress
- Runs `claude --dangerously-skip-permissions` with the issue title and body as the prompt
- Always opens a PR (never pushes to main) — feature work always needs review
- Branch name is `feat/issue-<N>-<timestamp>` to avoid collisions on re-runs
- If Claude makes no changes, comments on the issue explaining that the request may need more detail
- **Approval flow**: user submits via the in-app Feedback form → GitHub issue created with `user-requested` label → owner adds `status: auto-implement` label → this workflow runs, swaps to `status: in progress`, implements, opens PR. For owner-initiated features, use `/open-issue <title> --auto-implement` (adds `status: auto-implement` directly, no `user-requested`). `status: planned` is informational only — it does not trigger the workflow.
- **`user-requested` is reserved for the Feedback form** — the `/api/feature-request` route sets it automatically. Never add it manually to owner-initiated issues; it drives the public roadmap filter.
- No extra secrets needed — uses `ANTHROPIC_API_KEY` and `GITHUB_TOKEN`

**`cd-auto-fix.yml`** — auto-healing for Vercel production deployment failures; triggers on `repository_dispatch` with `event_type: cd-failure` (fired by `cd-filter.yml`, which filters `deployment_status` events to Production failures only; or by `/api/vercel-webhook` for Vercel Pro users):
- Checks out the failing commit, runs `npm run build` + `npx tsc --noEmit` locally to reproduce the error
- **Not locally reproducible** (build succeeds locally): opens an issue and comments that it is likely a Vercel environment variable or configuration problem — no code fix is attempted
- **Locally reproducible**: finds or creates a GitHub issue titled `"CD failure: Production deployment of <sha7> failed"`, runs Claude with the build output, and opens a PR — never pushes directly to main
- Always opens a PR (never direct-push to main) to prevent an auto-merge from immediately triggering another Vercel production deployment before a human reviews the fix
- **No infinite-fix loop**: the fix PR pushes to a branch via `GITHUB_TOKEN`, which Vercel deploys as a Preview (environment = "Preview"); the `environment == 'Production'` filter ignores Preview failures, so the loop is broken
- **Claude prompt is scoped to the error stack trace only** — Claude is explicitly told not to modify `.github/` files or make unrelated improvements. Without this constraint, Claude modifies workflow files (adding retry logic, etc.) instead of fixing the actual broken file.
- **Safeguard step after Claude runs**: `git checkout origin/main -- .github/ 2>/dev/null || true` — reverts `.github/` to `origin/main` before committing the PR branch. This prevents Claude's workflow modifications from appearing in the PR even if it ignores the prompt constraint. Always revert to `origin/main`, not `HEAD`, because the checked-out SHA may have older workflow versions.
- Reuses existing secrets `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GH_PAT`, and `GITHUB_REPO`

**Run tests proactively — do not wait to be asked, and do not ask permission first.** If there is an obvious test to run after a fix or change (e.g. re-dispatching with the same Sentry URL to verify deduplication, smoke-testing a new route's error path), just run it and report the result. Never offer to run a test as a question — just run it. Only pause to ask if the test has side effects that could surprise the user (e.g. sending external messages, modifying shared state irreversibly).

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
- **Never use `latest` as a version anywhere in workflows** — `version: latest` for tools (e.g. `supabase/setup-cli`) makes a GitHub API call to resolve the version and fails with a rate-limit error on busy runners; unpinned `npm install -g <pkg>` hits npm's registry on every run and produces non-deterministic builds. Always pin to an exact version (e.g. `version: 2.100.1`, `npm install -g @anthropic-ai/claude-code@2.1.145`). When upgrading, update every workflow file that references the version. Check current versions with `gh release list --repo <owner>/<repo>` (for GitHub releases) or `npm view <pkg> version` (for npm packages).
- **Consecutive `>> file` redirects** should be consolidated with `{ cmd1; cmd2; } >> file` (shellcheck SC2129).
- **Both `repository_dispatch` and `on: issues` fire simultaneously** when Sentry alerts — the webhook triggers a dispatch AND `sentry[bot]` opens a GitHub issue at the same time. Without a concurrency group both runs push to main and one gets rejected. The workflow uses `concurrency: group: auto-fix, cancel-in-progress: false` to queue them.
- **`sentry[bot]` and our webhook use different Sentry URL formats** — webhook sends `https://sentry.io/api/0/.../issues/ID/`, sentry[bot] writes `https://org.sentry.io/issues/ID/`. The numeric ID is still extracted with `grep -oE '[0-9]{7,}'` for the Sentry API resolve call, but GitHub issue deduplication matches by title (not URL or ID) to avoid format-mismatch failures.
- **`gh issue list --search` uses the full-text search index, which has non-deterministic lag on newly-created issues.** Use `gh issue list --state open --limit 50 --json number,title` (the REST list API) and filter locally with jq instead. The list API returns current data immediately with no indexing step. Use `--state open` only — `sentry[bot]` always creates a fresh open issue per alert (regressions included), so searching closed issues risks accidentally reopening an old unrelated issue with the same error title.
- **The second queued run will fail to push if the first already committed to main.** Even with `cancel-in-progress: false`, the second run checks out a stale copy of main. After making the fix, it must `git fetch origin main && git rebase origin/main`, then check `COMMITS_AHEAD=$(git rev-list origin/main..HEAD --count)` — if 0, the fix was already applied by the first run and the push is skipped. Always comment + close the issue regardless.
- **Deduplication gap: the `repository_dispatch` run can create a duplicate issue when it starts after `on: issues` has already closed the original.** The open-issues-only search misses the now-closed issue, so a new issue gets created, Claude runs on already-fixed code, and the rebase fails. Fix: after finding no open match, also query `--state closed --limit 20` for the same title; if found, set `skip=true` and skip all downstream steps.
- **Duplicate PR gap: two queued runs for the same error both open a PR.** The concurrency group queues (not cancels) runs, so run #2 finds the existing open issue but still runs Claude and opens a second PR. Fix: after finding an existing open issue, check `gh pr list --state open` for a branch matching `fix/issue-N-*`; if one exists, set `skip=true` before running Claude.
- **Rebase conflicts in the low-risk push path must be caught explicitly.** Wrap `git rebase origin/main` with `if ! git rebase ...; then git rebase --abort; comment + close the issue; exit 0; fi` — otherwise the step exits with code 1, the issue stays open with no comment, and the run appears failed with no explanation.
- **Use `gh api` (not `actions/github-script`) for `repository_dispatch` calls.** `github-script@v9` made `github-token` a required input with no default — an empty `GH_PAT` secret causes "Input required and not supplied" and silently drops the dispatch. The `gh api` approach reads `GH_TOKEN` from env, is version-stable, and handles JSON safely via `jq`. Pattern used in all four "Trigger CI auto-fix on failure" steps: `env: GH_TOKEN: ${{ secrets.GH_PAT }}` + `jq -n ... | gh api repos/.../dispatches --method POST --input -`.
- **`gh issue create` does not support `--json`/`--jq`** — those flags are only on read commands (`gh issue list`, `gh issue view`). Capture the URL it prints to stdout and extract the number: `NUMBER=$(gh issue create ... | grep -oE '[0-9]+$')`.
- **`GITHUB_TOKEN` blocks `issues: closed` events it causes** — when the auto-fix bot merges a PR via `GITHUB_TOKEN`, GitHub closes the linked issue but suppresses the `issues: closed` workflow trigger. The `resolve-sentry-on-close` job therefore never fires for bot-fixed issues. Fix: use `GH_TOKEN="${GH_PAT}" gh pr merge --auto --squash` so the merge is attributed to the repo owner (a human actor), which GitHub does not suppress.
- **The "no changes made" path must close the issue and resolve Sentry** — when Claude finds no code fix, a bare `exit 0` leaves the GitHub issue and Sentry issue permanently open. Always comment, close the GitHub issue, and call the Sentry resolve API (`PUT /api/0/issues/<ID>/` with `{"status":"resolved"}`) before exiting.

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

**Always open a GitHub issue before writing any code — no exceptions.** The full workflow applies to bugs, features, and doc changes alike:
1. `gh issue create` with the appropriate label and a clear title. Issue titles use **plain text only** — never use conventional-commit prefixes (`feat:`, `chore:`, `refactor:`, etc.) in an issue title. The only allowed prefixes are:
   - `[Feature Request] Title` — user-submitted feature requests (with `user-requested` label). Also add the correct status label at creation time: implementing immediately → `status: in progress`; tracking for future → `status: backlog`
   - `fix: Title` — bug fixes (with `bug` label)
   - Everything else (internal features, CI/infra work, docs, refactors) — **plain descriptive title, no prefix**. Examples: "Gate Vercel production deploys on CI passing", "Add slash commands for common workflows"
2. Implement on a **new branch off main** — never code on an unrelated branch — named `fix/issue-N-<timestamp>`, `feat/issue-N-<slug>`, or `docs/issue-N-<slug>` (branch prefixes follow conventional commits; issue title prefixes do not)
3. Open a PR whose title is **`<issue title> (#N)`** — copy the issue title verbatim and append the issue number in parentheses. Example: `[Feature Request] Add dark mode (#88)`. `Closes #N` in the body auto-closes the issue on merge.

## Code conventions

- No comments unless the WHY is non-obvious
- No `Sentry.captureException` in application code — use `console.error`
- All DB writes go through the Supabase client, never raw SQL from the client
- New enum values (ApplicationStatus, ApplicationType, etc.) must be added to `lib/types.ts` and the corresponding Supabase migration
- `referrer` is nullable — always guard with `?? null`, never cast to string without a null check
