# Feature Pipeline: End to End

A complete walkthrough of how a feature moves from request to production deployment.

---

## Entry point (two paths)

**Path A — user-submitted:** User clicks the in-app Feedback button → hits `/api/feature-request` → creates GitHub issue #X with the `user-requested` label.

**Path B — owner-initiated (`/plan-feature`):** Owner runs the skill, which calls `gh issue create` with `status: planned`. Issue #X exists but nothing runs yet — `status: planned` is informational only and triggers no workflow.

---

## Phase 1: Design (`feature-design.yml`)

**Trigger:** Owner adds `status: approved` to #X.

1. Label swaps: `status: approved` → `status: design-review` on #X.
2. Claude runs (up to 30 turns, 3-attempt retry on 529 overload) with a structured prompt that requires it to:
   - Read the actual source files it will touch
   - Fetch and inspect any external URLs mentioned in the request (to verify assumptions before designing)
   - Write a design proposal to `/tmp/design_proposal.md`
3. The design proposal is committed to `.github/designs/issue-N-slug.md` on a `design/issue-N-slug` branch (never merged to main — just for linking).
4. A new GitHub issue #Y is created (title: `Design proposal: <feature>`), containing:
   - The full design doc
   - An `<!-- implementation-plan-json [...] -->` HTML comment with machine-readable subtask JSON
   - Human-readable `- [ ]` checkboxes with turn estimates
   - `## Acceptance criteria` — what the verify step will test automatically
   - `## Human verification steps` — what the reviewer must check manually before merging
5. #Y is labeled `user review required` + `implementation`.
6. A comment is posted on #X linking to #Y.

**Dedup check:** Before generating, the workflow checks for an existing design issue (via body text, prior comments, or title match) so re-running on the same issue doesn't create duplicates.

---

## Human gate #1: design review

Owner reads #Y, refines it in a Claude Code session (`gh issue view/edit`). There is no workflow watching this — it's open-ended. When the design is good, the owner adds `status: auto-implement` to #X (or to #Y, which the workflow redirects to #X).

---

## Phase 2: Implementation (`feature-implement.yml`)

**Trigger:** `status: auto-implement` label added to #X or #Y.

1. Resolves both #X and #Y, reads both bodies.
2. Parses the `<!-- implementation-plan-json -->` block from #Y into a subtask list. If none is found (manually written spec), Claude generates one at runtime (separate 10-turn invocation).
3. Runs `npm ci` on the runner.
4. For each subtask in order:
   - Builds a focused prompt: subtask scope, files to create/modify, test file path, previously committed work (so Claude doesn't redo it).
   - Runs Claude (`estimated_turns + 12` as the cap, 3-attempt retry on 529).
   - Runs `lint` + `tsc --noEmit` + `vitest run <task_test_file>`. If any fail, one retry: Claude gets the diff + failure output and tries to fix.
   - Commits: `feat: <task title> [N/M]`.
   - On success: ticks the corresponding `- [ ]` checkbox in #Y's implementation plan to `- [x]`.
   - If a subtask fails both attempts: posts a comment, opens a partial PR anyway, marks `IMPL_FAILED=true`.
5. After all subtasks: runs the full `npm run test:coverage` coverage gate.

---

## Phase 3: Acceptance criteria verification (`verify-ac` composite action)

Runs immediately after implementation, still within the same `feature-implement.yml` job.

1. Extracts every `- [ ]` item from the `## Acceptance criteria` section of #Y.
2. Claude generates `e2e/ac_verify.spec.ts` — a Playwright test file targeting those items.
3. Starts local Supabase (`supabase start`, 3-attempt retry) + Next.js dev server.
4. Runs the Playwright tests.
5. **If tests fail (attempt 1):** Claude gets the Playwright output and self-heals the *implementation* (not the test). Retests.
6. **If tests fail (attempt 2):** Gives up. PR will be labeled `needs-acceptance-testing`.
7. **On success:** Ticks `- [ ]` → `- [x]` on the AC checkboxes in #Y. The test file (`e2e/ac_verify.spec.ts`) is never committed.

---

## PR creation

Still within `feature-implement.yml`.

1. Branch: `feat/issue-N-<timestamp>` (timestamp prevents collision on re-runs).
2. Push via `GH_PAT` (not `GITHUB_TOKEN`) so the `pull_request: [synchronize]` trigger fires correctly and CI starts.
3. `gh pr create` with body: `Closes #X`, `Closes #Y`, implementation summary, human verification steps from #Y.
4. Always labeled `manual merge required`.
5. If AC failed: also labeled `needs-acceptance-testing` + warning in PR body.
6. Comment posted on #X: summary + PR link.

---

## Human gate #2: PR review

Owner reviews the PR. The PR body lists the **human verification steps** from the design (items that require live external state — real URLs, real emails, live API responses). Owner works through those manually, then merges.

---

## CI on the PR (4 required checks, run in parallel)

| Workflow | Job name | What it does |
|---|---|---|
| `lint.yml` | `lint` | ESLint + `tsc --noEmit` + actionlint |
| `test.yml` | `unit-test` | Vitest with coverage thresholds (lines ≥85%, branches ≥80%, functions ≥65%) |
| `e2e.yml` | `e2e-auth` | Playwright auth flows against hosted Supabase |
| `migrate-validate.yml` | `migrate-validate` | `supabase start` + applies all migrations to a fresh local DB |

Doc-only changes (all files match `*.md` or `docs/**`) short-circuit all four via a `detect-changes` job — they emit a "skipped" check run (not "pending"), which satisfies required status checks.

If any CI check fails on the PR branch, `ci-auto-fix.yml` fires: fetches the failure logs, runs Claude to fix the root cause, pushes the fix commit to the PR branch (via `GH_PAT`), and CI retriggers.

---

## Merge to main → `cd.yml`

**Trigger:** Push to `main` (excluding `*.md` and `docs/**` changes).

1. Runs all 4 CI workflows in parallel (same jobs as PR CI).
2. `deploy` job runs only when all 4 pass:
   - `supabase db push` — applies pending migrations to the **production** DB.
   - `vercel deploy --prod` — deploys to Vercel.
   - Sequential order is intentional: migrations always land before new code is served.
3. On successful deploy: closes all open `CD failure:` GitHub issues automatically.

**Auto-fix on failure:**

- Migration fails → `db-fix.yml` (Claude fixes the migration file, opens a PR, never auto-merges — migrations always need human review)
- Vercel deploy fails → `cd-auto-fix.yml` (reproduces locally; code bug → Claude fixes and opens a PR; platform/infra error → opens a GitHub issue for manual investigation)

---

## What closes #X and #Y

`Closes #X` and `Closes #Y` are in the PR body. GitHub closes both issues when the PR merges. Closing #X triggers `resolve-sentry-on-close` if applicable. The merge is attributed to a human actor via GH_PAT so the `issues: closed` event isn't suppressed by GitHub.

---

## Summary of human touchpoints

| Step | Human action |
|---|---|
| Feature entry | Add `status: approved` to #X |
| After design | Review/refine #Y, then add `status: auto-implement` |
| After PR opens | Work through human verification steps, approve and merge |

Everything else — design generation, implementation, subtask breakdown, AC verification, CI auto-fixing, migration push, Vercel deploy — is automated.
