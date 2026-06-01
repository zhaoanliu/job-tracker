# GitHub Actions Limitations Audit

*Written as supporting context for the planned migration to Temporal ([#505](https://github.com/zhaoanliu/job-tracker/issues/505)).*

> See [Temporal migration plan](temporal-migration-plan.md) for the planned solution.

---

## Every limitation we hit and worked around

### 1. Anthropic API 529 overload — no native retry

**Files:** `bug-fix.yml`, `feature-implement.yml`, `feature-design.yml`, `ci-auto-fix.yml`, `auto-fix.yml`, `verify-ac/action.yml`

Every workflow that calls `claude` wraps it in a hand-rolled retry loop:

```bash
DELAY=30
for attempt in 1 2 3; do
  claude ... 2>&1 | tee /tmp/claude_output.txt
  if grep -q "529\|Overloaded\|at capacity" /tmp/claude_output.txt && [[ $attempt -lt 3 ]]; then
    sleep $DELAY
    DELAY=$((DELAY * 2))
  else break; fi
done
```

Six workflows duplicating the same exponential backoff logic. Temporal activities handle this once, at the infrastructure level.

---

### 2. `GITHUB_TOKEN` silently suppresses event triggers — two separate incidents

**Incident A — `issues: closed` suppression** (`auto-fix.yml` line 439):
When a bot merges a PR with `GITHUB_TOKEN`, GitHub closes the linked issue but silently swallows the `issues: closed` event. The `resolve-sentry-on-close` workflow never fired. Fix: force merge attribution to a human actor with `GH_TOKEN="${GH_PAT}" gh pr merge`.

**Incident B — `pull_request: [synchronize]` suppression** (`feature-verify.yml` line 22):
When a bot pushes a commit to an existing PR branch using `GITHUB_TOKEN`, GitHub resets all check statuses to "Waiting for status to be reported" but never starts a new CI run. The PR hangs indefinitely. `git remote set-url` alone doesn't fix this — you have to set `token: ${{ secrets.GH_PAT }}` in the `actions/checkout` step itself.

Both were discovered in production. No errors, no logs — the workflow just silently stops.

---

### 3. GitHub mergeability API returns `UNKNOWN` — requires polling loop

**File:** `rebase-conflicting-prs.yml` lines 42–54

GitHub's `mergeable` field isn't computed synchronously. Querying it right after a push returns `UNKNOWN`. Workaround: poll up to 6 times with 5-second sleeps. If still `UNKNOWN` after 30 seconds, label the PR as a "potential conflict" and bail:

```bash
for i in 1 2 3 4 5 6; do
  sleep 5
  mergeable=$(gh pr view "$pr_num" --json mergeable --jq '.mergeable')
  if [[ "$mergeable" != "UNKNOWN" ]]; then break; fi
done
```

A timing hack on top of an eventually-consistent API.

---

### 4. Search index lag on freshly-created issues

**File:** `auto-fix.yml` lines 82–87

`gh issue list --search` uses GitHub's full-text search index, which lags 10+ seconds on new issues. This caused false negatives in deduplication logic — the workflow would see "no existing issue" and create a duplicate. Fix: switched to the REST list endpoint and filter locally with `jq`:

```yaml
# Use list API (not search) to avoid search-index lag on freshly-created issues.
EXISTING=$(gh issue list --state open --limit 50 --json number,title | \
  jq --arg title "${SENTRY_TITLE}" '[.[] | select(.title == $title)] | .[0] // empty')
```

---

### 5. Supabase CLI intermittent 502 on `supabase start`

**File:** `supabase-start/action.yml` lines 10–22

`supabase start` fails sporadically on edge-runtime health-check 502s even when the instance is healthy. Added a 3-attempt retry with 30-second sleeps and a `supabase stop || true` between attempts. This runs on every local E2E run.

---

### 6. Concurrent runs checkout stale `main` — push collision

**File:** `auto-fix.yml` lines 108–125

With `cancel-in-progress: false`, two queued runs both check out `main` at queue time. Run 1 pushes a fix. Run 2 wakes up, applies the same fix to its stale tree, then fails to push because it's 0 commits ahead of `origin/main`. We now always fetch + rebase + count commits before pushing:

```bash
git fetch origin main && git rebase origin/main
COMMITS_AHEAD=$(git rev-list origin/main..HEAD --count)
if [[ "$COMMITS_AHEAD" -eq 0 ]]; then exit 0; fi  # already fixed
```

---

### 7. Concurrency group key collision in reusable workflows

**Files:** `lint.yml`, `test.yml`, `e2e.yml`, `migrate-validate.yml` line 8 each

When `cd.yml` calls 4 reusable workflows in parallel, every one sees identical `github.workflow`, `github.run_id`, and `github.event_name` context values (the caller's, not their own). Using those for a concurrency key means all 4 compete for the same slot; 2 get cancelled per run. Fix: hardcoded per-file suffix in the group key:

```yaml
group: ${{ format('{0}-lint', ...) }}  # -lint, -unit-test, -e2e-auth, -migrate-validate
```

Pure boilerplate to work around GitHub's context propagation in reusable workflows.

---

### 8. `paths-ignore` at the workflow level blocks required checks

**Files:** All 4 CI workflows

Using `paths-ignore:` at the `on:` level and changing only ignored files means the workflow never triggers and GitHub creates no check run at all. Required status checks stay "pending" and block the PR forever. Fix: a `detect-changes` job inside the workflow with `if: skip != 'true'` — GitHub sees a "skipped" check run, which satisfies required checks.

---

### 9. `gh issue create` has no `--json` output flag

**Files:** `auto-fix.yml` line 122, `ci-auto-fix.yml` line 80, `feature-design.yml` line 328

To get the issue number after creating one, you have to parse the URL from stdout:

```bash
ISSUE_URL=$(gh issue create --title "$TITLE" --body "$BODY")
NUMBER=$(echo "$ISSUE_URL" | grep -oE '[0-9]+$')
```

Minor, but repeated in three separate workflows.

---

### 10. `actions/github-script@v9` silently drops dispatches when `GH_PAT` is empty

`github-script@v9` made `github-token` required with no default. An empty or missing `GH_PAT` secret causes "Input required and not supplied" and silently prevents the `repository_dispatch` from firing. Switched all dispatch calls to `gh api` with `jq`.

---

### 11. Multiline `if:` expressions silently skip jobs

GitHub's expression parser rejects a trailing newline from a YAML block scalar (`|`) in an `if:` field. The job is skipped with zero error output — a silent footgun. Workaround: always keep `if:` on one line.

---

### 12. Bot pushes silently modify workflow files

**Files:** `auto-fix.yml` line 278, `cd-auto-fix.yml` line 187

Without explicit instructions, Claude modifies `.github/` workflow files as part of its "fix." Every auto-fix prompt explicitly says `Do NOT modify any files under .github/`, and there's a safeguard step that reverts `.github/` to `origin/main` after Claude runs:

```bash
git checkout origin/main -- .github/ 2>/dev/null || true
```

---

### 13. Supabase CLI version pinning to avoid rate limits

**Files:** `cd.yml`, `migrate-validate.yml`, `e2e-local.yml`, `verify-ac/action.yml`

`version: latest` makes a live GitHub Release API call on every runner startup. On busy runners this hits rate limits. Every file pins to an exact version (`2.101.0`), which means updating four files manually on every CLI upgrade.

---

## Flows that are fragile because GitHub Actions isn't the right tool

### The multi-day feature pipeline

`feature-design.yml` → `feature-implement.yml` → `feature-verify.yml` is a multi-step workflow spanning separate GitHub Actions runs with no durable state between them. Coordination happens entirely through:

- GitHub issue labels (`status: planned` → `status: approved` → `status: in progress` → `status: implemented`)
- PR descriptions and issue body comments
- Committed design files in `.github/designs/`

If any step fails mid-run there is no automatic resume. The next step is triggered by a human manually adding a label. GitHub issues are the "database."

### The acceptance criteria self-heal loop

`verify-ac/action.yml` runs an AI-generated Playwright test, feeds failures back to Claude to fix the implementation, and retries — capped at 2 attempts. On iteration 3 it gives up and labels the PR `needs-acceptance-testing` for manual review. There is no rollback: if Claude changes something that breaks a different AC step, the loop doesn't catch it.

### The nightly rebase cron

`rebase-conflicting-prs.yml` runs nightly and iterates all open PRs. If a PR's mergeability is still `UNKNOWN` after 30 seconds of polling, it's labeled as a potential conflict. There's no way to resume that check — the PR sits labeled until the next nightly run.

---

## Production incidents

| # | What happened | Root cause | Workflow |
|---|---|---|---|
| 1 | `resolve-sentry-on-close` stopped running silently | Bot-merged PRs use `GITHUB_TOKEN`; GitHub suppresses `issues: closed` | `auto-fix.yml` line 439 |
| 2 | PR stuck at "Waiting for status to be reported" indefinitely | Bot push with `GITHUB_TOKEN` suppresses `pull_request: [synchronize]` | `feature-verify.yml` line 22 |
| 3 | Duplicate tracking issues created for same Sentry alert | Search index lag caused false-negative deduplication check | `auto-fix.yml` lines 82–87 |
| 4 | Second queued auto-fix run exits with an error | Stale `main` checkout + 0-commits-ahead push collision | `auto-fix.yml` lines 108–125 |
| 5 | 2 of 4 CI workflows cancelled every `cd.yml` run | Reusable workflows share caller's concurrency group key | `lint.yml`, `test.yml`, `e2e.yml`, `migrate-validate.yml` |

---

## What Temporal would eliminate

| GitHub Actions workaround | Why it exists | What Temporal gives instead |
|---|---|---|
| 3-attempt exponential backoff in 6 workflow files | No native activity retry | Durable retry with configurable backoff, once per activity |
| Polling loop for `mergeable: UNKNOWN` | Eventual-consistency API | Long-poll with signals; workflow waits without burning a runner |
| GH_PAT swap for every merge and push | `GITHUB_TOKEN` suppresses event triggers | Event emission is explicit and reliable, not side-effected |
| REST list API instead of search | Search index lag | Workflow state is the source of truth, not GitHub's index |
| Fetch + rebase + count-commits check | Concurrent runners share no state | Workflow execution is atomic; no two runs touch the same state simultaneously |
| Hardcoded per-file concurrency suffixes | Reusable workflows inherit caller's context | Workflow identity is an explicit parameter, never collides |
| Label-based multi-day pipeline coordination | No cross-run state | Workflow instance persists across days; signals replace label events |
| 2-attempt self-heal cap in verify-ac | No rollback primitive | Activities are transactional; compensating actions are first-class |

**Bottom line:** 20+ documented workarounds, all engineering around the same three root problems — no durable state between steps, no reliable event delivery, and an eventually-consistent API that lies about what just happened. Every `sleep`, every `grep -q "529"`, every GH_PAT swap is a symptom of building orchestration on a platform designed for CI pipelines, not workflows.
