## Claude model configuration

The `claude` command in CI is an instrumented wrapper installed by
`.github/actions/install-claude/action.yml`. The original binary is renamed to
`_claude_bin`; the new `claude` wraps it to add:
- `--dangerously-skip-permissions --model "${CLAUDE_MODEL}" --output-format json` automatically
- Text extraction so existing `| tee` / `grep` / `PIPESTATUS` patterns work unchanged
- A cost line appended to `$GITHUB_STEP_SUMMARY` per run:
  `cost=$0.24 in=5000 cache=120000 out=312`

Call sites just use `claude --max-turns N -p "..."` — no extra flags needed.

**Default model:** `install-claude` exports `CLAUDE_MODEL=claude-sonnet-4-6` to
`$GITHUB_ENV` — job-scoped, available to all subsequent steps including inside
composite actions.

**To change the default:** edit that one line in `install-claude/action.yml`.

**To override per step** (used by future Haiku routing, #531):
```yaml
- name: Run Claude
  env:
    CLAUDE_MODEL: claude-haiku-4-5-20251001
  run: claude --max-turns 8 -p "$(cat /tmp/prompt.txt)" | tee /tmp/output.txt
```
Step-level `env:` takes precedence over `$GITHUB_ENV` for that step only.

For the full cost analysis, routing plan, and per-run spend tracking, see
[`docs/workflow-cost-optimization.md`](../docs/workflow-cost-optimization.md).

## Composite actions

Reusable actions live in `.github/actions/`. Use `uses: ./.github/actions/<name>` to call them from a workflow step.

| Action | What it does |
|---|---|
| `run-claude` | Run `claude` with exponential-backoff retry on 529/overload; inputs: `anthropic-api-key`, `prompt-file`, `max-turns`, `max-attempts`, `extra-flags`, `output-file` |
| `install-claude` | Install Claude Code, set `CLAUDE_MODEL` env var |
| `mark-in-progress` | Add `status: in progress` label to the issue |
| `check-existing-pr` | Find an open PR for the current issue before running Claude |
| `detect-doc-only` | Output `skip=true` when all changed files are docs |
| `trigger-ci-failure` | Dispatch `ci-failure` repository event on workflow failure |
| `supabase-start` | Start local Supabase stack for E2E tests |
| `verify-ac` | Run Playwright acceptance-criteria tests and self-heal on failure |

**No duplication in workflows** — before writing a new `run:` block longer than ~10 lines, check this table. If a matching action exists, use it. If a new pattern is needed in more than one workflow, extract it to a new composite action.

## Auto-fix pipeline

When a Sentry alert fires:
1. Sentry POSTs to `/api/sentry-webhook` (Vercel)
2. Route validates HMAC signature, dispatches `repository_dispatch` to GitHub
3. `auto-fix.yml` workflow runs:
   - Finds open GitHub issue matching the error title via list API, or creates one
   - Fetches the full Sentry event (stack trace, error type/message, culprit) from the Sentry API and injects it into Claude's prompt — without this, Claude only sees the vague GitHub issue title and exhausts its turn limit without finding the bug
   - Skips `replay_hydration_error` issues (Sentry `issueType`) — these have no stack trace and are caused by browser extensions, not application code; the workflow comments on and closes the GitHub issue automatically
   - Runs `claude-logged` to fix the bug
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
- `npm run test:coverage` — runs all Vitest unit tests and enforces coverage thresholds (lines ≥85%, branches ≥80%, functions ≥65%)
- On PR events: also runs `scripts/check-ac-coverage.mjs` — for each design issue (contains `<!-- implementation-plan-json -->`) linked via `Closes #N`, verifies every AC item has a `[AC-{issue}-{N}]` tagged passing test; checks off passing items in the issue; fails CI if any item is untagged or failing
- Fails CI if any test fails, any threshold is not met, or AC coverage is incomplete

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
- If `vercel deploy` fails: fires `cd-failure` dispatch → `cd-auto-fix.yml`; also captures the last 30 lines of Vercel CLI output and passes them as `vercel_error` in the payload for error classification
- On successful deploy: closes all open `CD failure:` GitHub issues automatically and comments with the succeeding commit SHA
- Required secrets: `SUPABASE_ACCESS_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `VERCEL_TOKEN`
- **Supabase CLI note**: `supabase db push --project-ref` was removed in CLI v2 — `cd.yml` uses `supabase link` first, then `supabase db push`
- **Supabase CLI baseline pitfall**: when first connecting to an existing project, the CLI may baseline all local migrations without executing the SQL. To force a specific migration to re-run: add `supabase migration repair --status reverted <timestamp>` before `supabase db push` in the deploy job. Remove it after one successful run.
- **Supabase SQL dollar-quoting**: use `$$` not `$` — `DO $ begin ... end $;` fails with syntax error 42601. Always write `DO $$ begin ... end $$;`.
- **Idempotent policy creation**: bare `CREATE POLICY` fails if the policy already exists. Wrap in `do $$ begin create policy "..." on public.<table> ...; exception when duplicate_object then null; end $$;`.
- **Supabase CLI version is pinned** (`version: 2.100.1`) in `cd.yml`, `migrate-validate.yml`, and `e2e-local.yml` — `version: latest` makes a GitHub API call to resolve the latest release and fails with a rate-limit error on busy runners. When upgrading, update the version in all three files. Check the latest stable release at `gh release list --repo supabase/cli --limit 5`.

**Async / non-blocking:**

**`e2e-local.yml`** — board + CSV E2E tests against a real local Supabase instance:
- Starts local Supabase via `supabase start`, runs `e2e/local/` test suite
- Triggers: nightly cron (06:00 UTC), `workflow_dispatch`, and push to main (path-filtered to board/modal/CSV/migration paths, and styling files: `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`)
- Not a required CI check — async and non-blocking; path filter keeps it from running on every push

**Doc-only changes skip CI.** `lint.yml`, `test.yml`, `e2e.yml`, and `migrate-validate.yml` each start with a `detect-changes` job (using `./.github/actions/detect-doc-only`) that outputs `skip=true` when all changed files match `*.md` or `docs/**`. The main job (`lint`, `unit-test`, etc.) declares `needs: detect-changes` and `if: needs.detect-changes.outputs.skip != 'true'`. When the main job is skipped via a job-level `if:`, GitHub creates a "skipped" check run — which satisfies required status checks, unblocking the PR. **Do not use `paths-ignore` at the workflow level for required checks**: a workflow that never triggers creates no check run at all, leaving required checks as "pending" and blocking the PR. `workflow_call` triggers have no `detect-changes` short-circuit — when `cd.yml` calls all 4 workflows unconditionally on push to main, they always run. When adding a new required CI workflow that should also skip doc-only changes, add the same `detect-changes` job and `needs`/`if` pattern.

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

**`feature-design.yml`** — Phase 1 of the design-then-implement workflow; triggers on `status: approved` label or `workflow_dispatch` with an `issue_number` input:

**Phase 1 — design** (triggered by `status: approved`):
- Owner adds `status: approved` to a feature issue (#X) to start the design process
- Claude generates a design proposal and opens a new design issue (#Y) with the `user review required` label
- The design issue (#Y) includes an `## Implementation plan` section with two parts: a machine-readable `<!-- implementation-plan-json [...] -->` HTML comment and human-readable `- [ ]` checkboxes with turn estimates. The owner can edit these checkboxes before approving.
- #X label changes to `status: design-review`; a comment on #X links to #Y
- Owner iterates on the design ad-hoc in Claude Code sessions (read/update #Y via `gh issue view/edit`)
- Iterate as many rounds as needed before proceeding

**`feature-implement.yml`** — Phase 2 of the design-then-implement workflow; triggers on `status: auto-implement` label or `workflow_dispatch` with an `issue_number` input:

**Phase 2 — implement** (triggered by `status: auto-implement`):
- Owner adds `status: auto-implement` to #X when the design is finalised
- Claude reads both #X (original request) and #Y (design spec) and implements accordingly
- If #Y contains an `## Implementation plan` (from Phase 1), the implement workflow parses the `<!-- implementation-plan-json -->` block and executes the pre-planned subtasks; each `- [ ]` checkbox in #Y is ticked off as its subtask completes. If no plan JSON is found (e.g. a manually written spec using `Technical tracking: #N`), Claude generates a subtask plan at runtime.
- **After implementation, acceptance criteria are verified automatically**: Claude generates a Playwright test file (`e2e/ac_verify.spec.ts`) targeting every `- [ ]` item in the `## Acceptance criteria` section of #Y, runs it against a local Supabase + dev server, and self-heals the implementation if any test fails (max 2 attempts). On success, the `- [ ]` checkboxes in the AC section of #Y are ticked to `- [x]`. If verification still fails after 2 attempts, the PR is opened with a `needs-acceptance-testing` label and a warning comment. The generated test file is never committed to the PR branch. Uses the well-known local Supabase demo keys — no additional secrets required.
- Always opens a PR (never pushes to main) — PR body includes `Closes #X` and `Closes #Y` so both close on merge
- Branch name is `feat/issue-<N>-<timestamp>` to avoid collisions on re-runs
- If Claude makes no changes, comments on the issue explaining that the request may need more detail

**Full approval flow (user-requested)**: user submits via the in-app Feedback form → GitHub issue #X created with `user-requested` label → owner adds `status: approved` → design phase runs, #Y created → owner refines design → owner adds `status: auto-implement` → implementation phase runs → AC verification runs → PR opened.

**Full approval flow (/plan-feature)**: owner runs `/plan-feature` → creates roadmap issue #X (`planned` label) only → owner adds `status: approved` to #X → design phase runs, generates #Y with `## Implementation plan` (JSON block + checkboxes) → owner refines design → owner adds `status: auto-implement` → implementation phase runs → AC verification runs → PR closes both #X and #Y.

**`status: auto-implement` skips Phase 1 design** — adding it to #X without `status: approved` first goes straight to implementation with no design spec. The correct sequence is always: `status: approved` first (design phase) → review #Y → `status: auto-implement` (implementation phase). At the end of every `/plan-feature` run, tell the user: "Add `status: approved` to #X to start the design spec phase."

**Manual investigation-based issue pairs** (created outside `/plan-feature`, e.g. during a JD URL investigation): always cross-link using exactly `Technical tracking: #N` in the **body** of the public issue #X. `feature-design.yml` greps the body for that exact string — a comment is invisible to it, and any other wording (e.g. "Internal tracking issue: #N") will not be detected. Omitting this causes a duplicate design issue to be generated when `status: approved` is added.

- **`user-requested` is reserved for the Feedback form** — the `/api/feature-request` route sets it automatically. Never add it manually to owner-initiated issues; it drives the public roadmap filter.
- `status: planned` is informational only — it does not trigger either phase.
- No extra secrets needed — uses `ANTHROPIC_API_KEY` and `GITHUB_TOKEN`

**`cd-monitor.yml`** — catch-all for CD failures that produce no GitHub issue on their own; triggers on `workflow_run` completion for the CD workflow (fires even for `startup_failure` before any steps run):
- **`startup_failure`**: immediately opens (or hit-comments) a `"CD failure: workflow startup failure"` issue — caused by YAML syntax errors, invalid action versions, or `permissions` mismatches between caller and callee workflows
- **`failure`**: sleeps 30 s then checks whether a `cd-auto-fix.yml` run appeared after the CD completed; if yes, skips (auto-fix already handled it); if no, opens a `"CD failure: dispatch to auto-fix failed"` issue — caused by expired `GH_PAT`, `jq` errors, or GitHub API failures in the dispatch step
- Both issue titles start with `"CD failure:"` so the existing auto-close logic in `cd.yml` closes them on the next successful deploy
- No new secrets needed — uses `GH_PAT`

**`cd-auto-fix.yml`** — auto-healing for Vercel production deployment failures; triggers on `repository_dispatch` with `event_type: cd-failure` (fired by `cd.yml` when `vercel deploy` fails):
- Checks out the failing commit, runs `npm run build` + `npx tsc --noEmit` locally to reproduce the error
- **Not locally reproducible** (build succeeds locally — platform/infra error): uses a **category-based issue title** for deduplication instead of a per-SHA title:
  - `"CD failure: Vercel deployment limit exceeded"` — when `vercel_error` payload matches limit/quota keywords
  - `"CD failure: Vercel production deployment unreachable"` — all other infra failures
  - If an issue with that title already exists: adds a **hit comment** (`Another deployment failure — commit \`<sha>\``) instead of opening a duplicate
  - If the issue is new: comments "build succeeds locally — manual investigation required; will auto-close on next successful deploy"
- **Locally reproducible** (code bug): uses a commit-specific title `"CD failure: Production deployment of <sha7> failed"`, runs Claude with the build output, opens a PR — never pushes directly to main
  - **Low-risk fix** (≤2 files, ≤20 lines, null guard / type / lint fix): enables auto-merge (`GH_TOKEN="${GH_PAT}" gh pr merge --auto --squash`) — merges automatically once all required CI checks pass
  - **High-risk fix**: opens a PR with "manual merge required" label — a human must approve and merge
- **No infinite-fix loop**: fix PR pushes via `GITHUB_TOKEN` → Preview deployment; the Production filter ignores Preview failures
- **Claude prompt is scoped to the error stack trace only** — Claude is explicitly told not to modify `.github/` files or make unrelated improvements. Without this constraint, Claude modifies workflow files (adding retry logic, etc.) instead of fixing the actual broken file.
- **Safeguard step after Claude runs**: `git checkout origin/main -- .github/ 2>/dev/null || true` — reverts `.github/` to `origin/main` before committing the PR branch. This prevents Claude's workflow modifications from appearing in the PR even if it ignores the prompt constraint. Always revert to `origin/main`, not `HEAD`, because the checked-out SHA may have older workflow versions.
- Reuses existing secrets `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GH_PAT`

**Run tests proactively — do not wait to be asked, and do not ask permission first.** If there is an obvious test to run after a fix or change (e.g. re-dispatching with the same Sentry URL to verify deduplication, smoke-testing a new route's error path), just run it and report the result. Never offer to run a test as a question — just run it. Only pause to ask if the test has side effects that could surprise the user (e.g. sending external messages, modifying shared state irreversibly).

**When investigating a live workflow failure, check actual run logs before static YAML analysis.** Static review misses runtime failures (credit exhaustion, API errors, environment issues, partial execution). First action:
```bash
gh run list --workflow=<name>.yml --limit 5
gh run view <run-id> --log-failed
```
Only then cross-reference with the YAML. Never report a workflow as correct based solely on static analysis when a live failure is being discussed.

**When investigating a cancelled or failed run, do not trigger a re-run.** The goal is to explain why it happened, not to fix it. Re-running overwrites the API's latest-attempt data — `gh run view <id>` returns the latest attempt's step timings, not the original's — destroying the evidence needed to diagnose the root cause. Gather all evidence first (annotations, step timings from the correct attempt number, Events API, push history), then report findings. Only re-run if the user explicitly asks to unblock the PR after the investigation is complete.

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

**Self-healing review loop — applies to all significant changes, not just workflows. Do not wait to be asked.**

**For code:** commit first, then review. If the review finds any issue, fix it, commit, and review again. Cap at 2 fix cycles (3 reviews total). If still not clean: push what's committed and note the remaining issues explicitly in the PR description — do not block shipping on perfect.

**For design files (`.github/designs/`):** review the content locally before the first post, because `gh issue create` / `gh issue edit` is the "push" — once it's up it's immediately visible. For subsequent revisions: edit the issue body, then post a comment explaining what changed (this is the visible audit trail, equivalent to a commit message).

Review across these dimensions on every cycle:
1. **Logic** — does each piece do what it claims? Wrong variable, wrong command, wrong order?
2. **Shell correctness** — quoting, exit codes, heredoc termination; use `{ git diff --name-only; git ls-files --others --exclude-standard; }` to capture both modified and new untracked files
3. **Step ordering** — does each step have what it needs from prior steps? (e.g. `node_modules/` must exist before running npm scripts — add `npm ci` before any Claude or test step that needs it)
4. **Edge cases** — what if the happy path fails? Missing files, empty responses, concurrent runs?
5. **Actionlint** — for workflow files, run it locally; don't assume it passes
6. **Local execution of text-manipulation commands** — for any `sed`/`awk`/`python`/`jq` one-liner, and for every `--jq` flag in a `run:` block, test it with **non-empty** representative sample input before committing. Don't reason about whether it works — run it. This rule applies *especially* when the expression looks obviously correct: that is when intuition is most likely to mislead you. Known jq gotchas:
   - **Operator precedence trap**: `a | b, c` is parsed as `a | (b, c)`, not `(a | b), c`. Always parenthesise sub-expressions: `(.number | tostring)` not `.number | tostring`.
   - **Null field access**: `select(.field | startswith("x"))` crashes if `.field` is null — guard with `select(.field != null and (.field | startswith("x")))`. Same for `select(.body | contains("x"))` — guard with `select(.body != null) | .body | select(contains("x"))`.
   - **Test command**: `echo '[{"number":1,"headRefName":"feat/foo","mergeable":"CONFLICTING"}]' | jq '<your filter>'`
7. **Format round-trip for prompt-generating code** — when code generates a prompt for Claude and then parses Claude's output, trace the full round trip: what format does the prompt specify → what does the parser extract → what does the consuming loop expect. Verify they're consistent and every parser assumption is stated explicitly in the prompt.

**After any change to ci-auto-fix.yml, verify push attribution with a live test.** The symptom of a broken fix is silent: ci-auto-fix pushes a commit, the PR's status checks go empty ("Waiting for status to be reported"), and no new CI run starts. The pass criterion is new check run timestamps appearing on the PR *after* ci-auto-fix's push timestamp. Test procedure:
1. Create a branch with an **additive** trivially-fixable unit test failure — add a *new* test (e.g. `it('tmp', () => { expect(true).toBe(false) })`) rather than changing an existing value. Additive is critical: if you change an existing value back (9→999→9), the net diff vs main is zero, detect-doc-only skips all CI, and auto-merge fires unintentionally.
2. Open the PR as a **draft** (`gh pr create --draft`). Draft PRs are ineligible for auto-merge, preventing ci-auto-fix's auto-merge from firing on the test PR.
3. Wait for `unit-test` to fail (~1 min). The `ci-failure` dispatch fires automatically.
4. Watch: `gh run list --workflow=ci-auto-fix.yml --limit 3`
5. After ci-auto-fix pushes its fix commit, run `gh pr checks <N>` — if new runs appear with timestamps after the push, attribution is working. If `statusCheckRollup` is empty or timestamps are stale, the push is still attributed to `github-actions[bot]`.
6. Close and delete the draft PR without merging.

### Composite actions — workflow-specific application of the no-duplication rule

See `CLAUDE.md` for the general no-duplication rule. For workflow files specifically: any `run:` block longer than ~10 lines that appears (or will appear) in more than one workflow file must be extracted to `.github/actions/<name>/action.yml`. Grep other workflow files before writing any substantial `run:` block.

**Existing composite actions — call these instead of re-implementing:**

| Action | What it does |
|---|---|
| `open-fix-pr` | Commit staged changes, push branch, create PR with risk-based auto-merge, post issue comment |
| `check-existing-pr` | Find an open PR for the current issue before running Claude (dedup guard) |
| `install-claude` | Install Claude Code, set `CLAUDE_MODEL` env var |
| `mark-in-progress` | Add `status: in progress` label to the issue |
| `detect-doc-only` | Output `skip=true` when all changed files are docs (used by lint/test/e2e to short-circuit) |
| `trigger-ci-failure` | Dispatch `ci-failure` repository event on workflow failure |
| `supabase-start` | Start local Supabase stack for E2E tests |
| `verify-ac` | Run Playwright acceptance-criteria tests and self-heal on failure |

### `|| true` usage rules

`|| true` suppresses all non-zero exit codes from a command — both expected ones (label not found) and unexpected ones (API error, wrong output). Use it only when the failure mode is genuinely inconsequential. The test: *if this command silently returns nothing/empty, does the workflow still do the right thing?*

**Correct uses:**
- Label add/remove: `gh issue edit --add-label "X" 2>/dev/null || true` — the label may already exist or not exist; either is fine.
- `grep pattern file || true` — grep exits 1 on no match, which is not an error here.
- Cleanup: `supabase stop || true` — may not be running.
- Non-critical telemetry/logging where failure changes nothing.

**Wrong uses — never `|| true` on:**
- Commands whose output is used for a decision downstream (`VAR=$(cmd || true)` where an empty `VAR` causes wrong branching or a misleading comment).
- `gh pr merge --auto` — if auto-merge fails, the PR silently never merges. Capture the exit code and add a label/comment instead:
  ```bash
  if GH_TOKEN="${GH_PAT}" gh pr merge --auto --squash "$PR_URL"; then
    MERGE_STATUS="auto-merge enabled: $PR_URL"
  else
    GH_TOKEN="${GH_PAT}" gh pr edit "$PR_URL" --add-label "manual merge required" || true
    MERGE_STATUS="manual merge required: $PR_URL"
  fi
  ```
- Safeguard steps whose failure would let a bad state through (e.g. the `.github/` revert — if it fails, Claude's workflow modifications enter the PR unreviewed).

**The audit:** see `docs/shell-audit.md` for the full categorised audit of every `|| true` in the codebase.

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
- **`GITHUB_TOKEN` also suppresses `pull_request: [synchronize]` triggers on direct branch pushes** — when a bot workflow pushes a fix commit directly to an existing PR branch, the push is attributed to `github-actions[bot]` and GitHub silently suppresses the `pull_request` CI trigger. The PR's check statuses reset to "Waiting for status to be reported" but no new CI run starts — the PR is stuck. **`git remote set-url` alone does NOT fix this**: `actions/checkout` with `persist-credentials: true` (the default) stores GITHUB_TOKEN as `http.https://github.com/.extraheader` in git config. This header is sent on every push alongside any URL-embedded credentials, and GitHub sees GITHUB_TOKEN and still attributes the push to the bot. The correct fix is `token: ${{ secrets.GH_PAT }}` in the `actions/checkout` step — this makes the persisted credential GH_PAT (human actor) from the start, so all git operations including pushes use GH_PAT and CI triggers normally. This is distinct from the `gh pr create` case — `GH_TOKEN="${GH_PAT}" gh pr create` handles new PRs; the checkout token pattern is needed for direct pushes to existing PR branches.
- **The "no changes made" path must close the issue and resolve Sentry** — when Claude finds no code fix, a bare `exit 0` leaves the GitHub issue and Sentry issue permanently open. Always comment, close the GitHub issue, and call the Sentry resolve API (`PUT /api/0/issues/<ID>/` with `{"status":"resolved"}`) before exiting.
- **In a reusable (called) workflow, `github.workflow`, `github.run_id`, and most `github.*` context properties evaluate in the CALLER's context** — all 4 CI workflows called in parallel by `cd.yml` see identical values for these properties. Using any of them alone as a concurrency group key causes all 4 called workflows to compete for the same slot: exactly 2 are cancelled per cd.yml run (cancel-in-progress: false pending-queue replacement). Fix: add a **hardcoded per-file suffix** to the group key so the literal string differentiates the 4 workflows even when all runtime values are identical. Pattern: `group: ${{ format('{0}-lint', github.event_name == 'pull_request' && github.ref || github.run_id) }}` (each workflow file uses its own unique suffix). For PR events the key becomes `refs/pull/N/merge-lint` (stable per PR — cancel-in-progress works); for workflow_call it becomes `<caller-run-id>-lint` (the `-lint` suffix separates it from `-unit-test`, `-e2e-auth`, `-migrate-validate`). Do not use `github.workflow_ref` — its caller-vs-called behavior in workflow_call context is ambiguous in GitHub's docs.
