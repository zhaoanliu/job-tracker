# CI Investigation: migrate-validate timeout on Renovate PRs (2026-06-06)

## Context

Four Renovate PRs were opened simultaneously on 2026-06-06:
- #554 `@supabase/supabase-js` 2.106.1 → 2.106.2
- #555 `resend` 6.12.3 → 6.12.4
- #556 `@types/react` 18.3.28 → 18.3.29
- #557 `lucide-react` 1.16.0 → 1.17.0

PRs #554, #555, #557 were green. PR #556's `migrate-validate` check showed **Cancelled**.

---

## Root cause of the original cancellation (Attempt #1)

**The job hit `timeout-minutes: 10` in `migrate-validate.yml`.**

Evidence from the GitHub Actions UI (Attempt #1):
- Annotation: `"The job has exceeded the maximum execution time of 10m0s"`
- `migrate-validate` job duration: **10m 17s**
- Triggered by: `renovate[bot]` opened PR #556

`supabase start` (via the `supabase-start` composite action) failed to complete within 10 minutes. The action retries up to 3 times with 30-second sleeps between attempts, so a slow runner can exceed the timeout through retries even if no single attempt hangs indefinitely.

Normal `supabase start` timing across 51 successful runs:

| Metric | Value |
|---|---|
| min | 82s |
| avg | 100s |
| max | 220s |
| p90 | 106s |

The timeout is well above p90 in the normal case, but a slow runner hitting the retry loop can push past 10 minutes.

---

## Why the re-run was also cancelled (Attempt #2)

After the investigation, a re-run was triggered. That attempt was cancelled with a different message:

> `"Canceling since a higher priority waiting request for refs/pull/556/merge-migrate-validate exists"`

This is the concurrency mechanism in `migrate-validate.yml`:
```yaml
concurrency:
  group: ${{ format('{0}-migrate-validate', github.event_name == 'pull_request' && github.ref || github.run_id) }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

At the same moment I triggered the re-run (~06:44), `renovate[bot]` force-pushed to the `renovate/react-monorepo` branch (`966ff8a2f3de` → `db0e725ac48d`), which fired a `pull_request: synchronize` event that queued a new higher-priority run. That new run (27055332891) then ran and succeeded.

---

## How Renovate detected that a rebase was needed

Renovate is installed as a **GitHub App** (Mend Renovate hosted service). When we merged PRs #554/#555/#557 into `main`, GitHub sent a `push` webhook to Mend's servers. Mend queued a Renovate job for this repo, Renovate evaluated all open PRs against `rebaseWhen: "behind-base-branch"` (configured in `renovate.json`), found PR #556 was behind, and force-pushed a rebase. This is entirely external to our workflows — no GitHub Actions involved.

Confirmed via the GitHub Events API:
```
2026-06-06T06:44:51  PushEvent  renovate[bot]
  ref: refs/heads/renovate/react-monorepo
  before: 966ff8a2f3de  ->  after: db0e725ac48d
```

---

## Diagnostic pitfall: `gh run view` returns latest attempt data

`gh run view <run-id>` always returns the **latest attempt**'s step-level data, not the original attempt's. After a re-run, the step timings visible via the API belong to the re-run — not the original failure.

In this investigation, the re-run (Attempt #2) was cancelled by the concurrency mechanism after ~26 seconds. Fetching step timings via the API returned 26 seconds for the `supabase-start` step, which looked like a brief external cancellation rather than a timeout. This caused an incorrect diagnosis. The actual Attempt #1 step data (10m+ in `supabase-start`) was only visible in the GitHub Actions UI by explicitly switching to "Attempt #1".

**Rule:** When investigating a cancelled or failed run, check the GitHub UI to confirm which attempt you're looking at, and do not trigger a re-run until the investigation is complete.

---

## Why Supabase Docker images are not cached between runs

GitHub Actions runners are ephemeral — each job gets a fresh VM. Docker's layer cache lives on the runner's disk and is discarded at the end of every job.

The two `actions/cache` usages in this project cache:
1. **Claude Code CLI** (`~/.npm-global`) — in `install-claude/action.yml`
2. **Playwright Chromium** (`~/.cache/ms-playwright`) — in `verify-ac/action.yml`

Caching Docker images is technically possible via `docker save` → `actions/cache` → `docker load`, but the Supabase local stack (postgres, gotrue, realtime, storage-api, edge-runtime, studio, kong) is 3–5 GB combined. Saving and restoring a multi-GB tarball typically takes as long as pulling fresh images, making the cache overhead comparable to the cold-pull time.

The normal `supabase start` (avg 100s, p90 106s) is well within the `timeout-minutes: 10` limit. The fix for the timeout is to raise the limit rather than add Docker caching.

---

## Fix

Raise `timeout-minutes` in `migrate-validate.yml` from `10` to `15` to give `supabase start` headroom on slow runners without changing caching strategy.
