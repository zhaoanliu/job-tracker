# Workflow Cost Evaluations

Periodic snapshots of Claude API token usage across GitHub Actions workflows.
For root-cause analysis and the optimization plan, see
[`workflow-cost-optimization.md`](workflow-cost-optimization.md).

---

## Evaluation 1 — 2026-06-01

### Source

Anthropic Console, ~10-day window ending June 1.

### Figures

| Metric | Value |
|---|---|
| Total cost | ~$150 |
| Input tokens | 145M |
| Output tokens | 1.1M |
| Input:output ratio | 130:1 |
| Primary model | `claude-opus-4-7` (unintended default) |

### Root cause

No `--model` flag in any workflow. Pinned CLI `@2.1.145` defaulted to Opus
($5/$25 per MTok). The 130:1 ratio comes from multi-turn context accumulation —
Claude Code resends the full conversation history on every turn, so a 20-turn
session that reads 10 files can hit 400–600K input tokens by the last turn.

### Actions taken

- **PR #528** — pin `CLAUDE_MODEL=claude-sonnet-4-6` in `install-claude`. Expected −40%.
- **PR #530** (backlog) — reduce `--max-turns` across all workflows. Expected −40–50%.
- **PR #531** (backlog) — route cheap tasks to Haiku. Expected −60–70% on routed calls.
- **PR #711** — log every invocation to `workflow_runs` Supabase table so future
  evaluations have per-run data instead of Console aggregates.

---

## Evaluation 2 — 2026-06-16

### Source

GitHub Actions run history (June 1–15, 14 days). Actual dollar figures require
checking the Anthropic Console; this evaluation uses run counts and known per-run
cost structure.

### Model in effect

`claude-sonnet-4-6` ($3/$15 per MTok) — PR #528 merged June 1.

### Workflow activity

`auto-fix.yml` triggers on two distinct event paths, which is important for
understanding what the 111 active runs actually represent.

#### `auto-fix.yml` trigger paths

**Path A — Sentry webhook** (`repository_dispatch: sentry-issue`)

Sentry POSTs to the app's `/api/sentry-webhook` endpoint, which dispatches a
`sentry-issue` event to GitHub. These are errors Sentry observed in production
(captured via `captureConsoleIntegration` from `console.error` calls).

7 issues in this window, of which:

| Issue | Error | PR | Outcome |
|---|---|---|---|
| #634 | `TypeError: Cannot read properties of undefined (reading 'call')` — Next.js v15.5.18 broke isolated webpack chunks importing `@sentry/nextjs` | #635 | Auto-merged; postmortem at `docs/postmortem-issue-634.md`; added ESLint rule + prod-build E2E safeguard |
| #683 | `Error: Acquiring exclusive LockManager lock immediately failed` — Supabase auth token race | #684 | Auto-merged |
| #648 | `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` | #649 | Manual merge (auth path) |
| #641 | `ExperimentalWarning: vm.USE_MAIN_CONTEXT_DEFAULT_LOADER` — Node.js warning surfaced by `captureConsoleIntegration` | #642 | Auto-merged; noise, not a real bug |
| #549 | Google Careers JD import: `console.error` when `extractGoogleCareersFromPage` returned null — Sentry captured it | #550 | Manual merge (open; scraper logic) |
| #517 | `fetch-job-description`: non-2xx 429 from careers.confluent.io | #518 | Auto-merged |
| #638 | CD startup failure: missing `contents: read` permission | #639 | Auto-merged |

**Path B — `on: issues: [opened, reopened, closed]`**

Any issue event on the repo triggers `auto-fix.yml`. The `auto-fix` job runs when
an issue is opened or reopened with a `bug` label. This path handles two distinct
sources:

*User-reported JD import failures* — user tries to import a URL, extraction fails,
creates an issue (manually or via `/report-jd-import-bug` skill). These are NOT
Sentry-detected; they are user-discovered. 10 issues in this window, all required
**manual merge** (scraper logic touches a core extraction path):

| Issue | Domain | PR |
|---|---|---|
| #543 | Databricks careers | #544 merged |
| #574 | Coupang (Cloudflare-blocked, needed Greenhouse handler) | #576 merged |
| #601 | Google Careers (second breakage, different root cause) | #602 merged |
| #650 | Pinterest careers | #651 merged |
| #655 | amazon.jobs | #656 merged |
| #679 | Ashby embed boards (`?ashby_jid=`) | #680 merged |
| #681 | Shopify careers | #682 merged |
| #687 | OpenAI careers | #704 open |
| #693, #699 | DigitalOcean (`?gh_jid=`) — 3 attempts, still failing | #709 open |

*CI/workflow self-healing* — `ci-auto-fix.yml`, `cd-auto-fix.yml`, and the Sentry
pipeline create issues titled `"CI failure: ..."` or `"CD failure: ..."`. When
those issues open, `auto-fix.yml` also triggers via `on: issues`. ~20 issues in
this window, mix of auto-merged and manual:

Representative examples: missing `actions: write` permission (#675), bad `if:`
condition on reusable workflow call (#671), jq operator precedence crash in rebase
workflow (#539), ci-auto-fix skipping on already-closed issue (#677),
branch coverage below 80% threshold (#526).

#### All workflows — active run counts (June 1–15)

"Active" = success + failure; excludes skipped runs (early `if:` exit before any
Claude call).

| Workflow | Active runs | Max-turns (current) | Notes |
|---|---|---|---|
| `auto-fix.yml` | 111 | 15 | See breakdown above |
| `Auto-fix CI failures` | 48 | 15 | Triggered by CI dispatch |
| `Rebase conflicting PRs` | 75 | 15 | Mechanical; cheap per run |
| `Feature: design` | 9 | 30 | Highest per-run cost |
| `Feature: implement` | 9 | est+12 per subtask | |
| `Auto-fix self-reported bugs` | 2 | 30 | `bug-fix.yml`; low volume now |
| **Total** | **~254** | | |

Rate: ~18 Claude-invoking runs/day — flat vs the June 1 baseline (~17.7/day on Opus).

### Auto-merge rate (all fix PRs, June 1–15)

| Outcome | Count | What they were |
|---|---|---|
| Auto-merged | 16 | CI/infra fixes, small Sentry errors, one 429 rate-limit |
| Manual merge | 19 | JD import scrapers, auth fixes, larger workflow changes |
| Open | 3 | DigitalOcean (stuck after 3 attempts), OpenAI, Google Careers |

### Cost estimate

Console check required for exact figures. Expected based on flat volume and
Sonnet pricing: ~$9/day → **~$126 for 14 days** (vs $150/10 days on Opus = $180
if that rate had continued). Verify against Console.

### New workflows not in June 1 plan

- **`bug-fix.yml`**: `max-turns=30` — same ceiling as `feature-design`, the highest
  in the codebase. Only 2 active runs so far but should be added to #530's
  reduction plan (proposed: 18).
- **`report-jd-import-bug.yml`**: `max-turns=20` — reasonable for multi-step
  investigation; leave as-is.

### Pending actions

| Action | Issue | Status |
|---|---|---|
| Reduce `--max-turns` (add `bug-fix.yml` to plan) | #530 | Backlog |
| Haiku/Sonnet routing | #531 | Backlog (needs #530 first) |
| Per-invocation Supabase logging | #711 | PR open — merge to unlock data-driven evaluations |
