# Temporal Migration Plan

*Status: planned — not yet implemented*
*GitHub issue: #505*
*Related: [GitHub Actions audit](github-actions-audit.md) · [Feature pipeline](feature-pipeline.md)*

---

## Why Temporal

The current feature pipeline (`feature-design.yml` → `feature-implement.yml` → `verify-ac`) spans three separate GitHub Actions runs with no durable state between them. Coordination happens entirely through GitHub issue labels, PR descriptions, and committed design files. This means:

- If a run fails mid-way, there is no automatic resume — the next step is triggered by a human manually re-adding a label
- GitHub issue labels are the "database" — fragile and not queryable
- Long waits (days between design approval and implementation) burn no runner but also have no built-in notification or escalation

The [GitHub Actions audit](github-actions-audit.md) documents 13 specific workarounds required to build reliable orchestration on a platform designed for CI pipelines, not stateful workflows. Every `sleep`, every `grep -q "529"`, every GH_PAT swap is a symptom of the same three root problems:

1. **No durable state between steps** — three separate runs share nothing; labels are the glue
2. **No reliable event delivery** — GITHUB_TOKEN silently suppresses events (2 production incidents)
3. **Eventually-consistent APIs that lie** — `mergeable: UNKNOWN`, search index lag causing duplicate issues

---

## What moves to Temporal

**Only the feature pipeline.** Bug fix, CI repair, deploy fix, and nightly E2E flows stay on GitHub Actions — they are short-lived, stateless, and work well there. The feature pipeline is the only flow that:

- Spans days or weeks
- Has multiple human pause points
- Requires durable state across phases
- Needs per-workflow identity (dedup by issue)

| Flow | Current | After migration |
|---|---|---|
| Bug fix (Sentry → fix → deploy) | GitHub Actions | GitHub Actions (unchanged) |
| CI failure auto-fix | GitHub Actions | GitHub Actions (unchanged) |
| Deploy failure auto-fix | GitHub Actions | GitHub Actions (unchanged) |
| Nightly E2E auto-fix | GitHub Actions | GitHub Actions (unchanged) |
| **Feature pipeline** | **GitHub Actions (3 separate runs)** | **Temporal (single durable workflow)** |

---

## Target architecture

```
User feedback / /plan-feature
        ↓
  featureWorkflow(issueId)          ← Temporal workflow starts
        ↓
  [Activity] generateDesign()       ← Claude generates #Y design proposal
        ↓
  [Signal wait] "approved"          ← pauses; owner sends signal after reviewing #Y
        ↓
  [Activity] runImplementation()    ← Claude implements each subtask in order
        ↓
  [Activity] verifyAcceptanceCriteria()  ← Playwright AC test
        ↓
  [Activity] openPullRequest()      ← PR opened via GH_PAT
        ↓
  [Signal wait] "pr-merged"         ← pauses; fires when PR merges to main
        ↓
  [Activity] verifyDeployment()     ← confirms Vercel deploy succeeded
        ↓
  workflow complete
```

### Why each step is an Activity

- **Independent retry** — each activity retries on failure with configurable backoff; no need for hand-rolled `grep -q "529"` loops
- **Atomic execution** — if the worker crashes mid-activity, Temporal replays from the last checkpoint; state is never lost
- **Visibility** — every activity shows in the Temporal UI with start time, duration, attempt count, and failure reason

### Human signals replace label polling

Currently: owner adds `status: approved` label → GitHub webhook fires → `feature-implement.yml` triggers
After: owner sends a signal to the running workflow instance → workflow resumes

```typescript
// Signal the running workflow from a CLI command or GitHub Action
await client.getHandle(workflowId).signal('approved');
await client.getHandle(workflowId).signal('auto-implement');
```

The workflow ID is `feature-{issueNumber}` — one workflow per issue, dedup is trivial.

---

## What Temporal eliminates

| GitHub Actions workaround | Root cause | Temporal solution |
|---|---|---|
| `grep -q "529"` retry loop × 6 files | No native activity retry | Retry policy on each activity, once |
| GH_PAT swap on every merge/push | GITHUB_TOKEN suppresses events | Explicit signal delivery, guaranteed |
| `fetch + rebase + count-commits` guard | Concurrent runners share no state | Workflow execution is atomic |
| Label-based multi-day pipeline coordination | No cross-run state | Workflow instance persists across days |
| 2-attempt AC verify cap with no rollback | No compensating action primitive | Activities are transactional; compensating actions are first-class |
| Polling loop for `mergeable: UNKNOWN` | Eventually-consistent API | Long-poll via signal; no sleep loops |
| REST list API instead of search (dedup) | Search index lag | One workflow per issue — dedup by workflow ID |

---

## Implementation plan

### Prerequisites
- [ ] Temporal Cloud account (or self-hosted Temporal server via Docker)
- [ ] `@temporalio/client` and `@temporalio/worker` npm packages
- [ ] Temporal worker running as a long-lived process (Fly.io, Railway, or a Vercel Edge function for signals only)

### Phase 1 — Scaffolding
- [ ] Add `temporal/` directory to repo
- [ ] Define `featureWorkflow` in TypeScript
- [ ] Define activity stubs (generateDesign, runImplementation, verifyAC, openPR, verifyDeployment)
- [ ] Set up local Temporal dev server for testing (`temporal server start-dev`)
- [ ] Write unit tests for workflow logic using Temporal's test framework

### Phase 2 — Activity implementation
- [ ] `generateDesign` — port `feature-design.yml` Claude invocation to a TypeScript activity
- [ ] `runImplementation` — port `feature-implement.yml` subtask loop to activities
- [ ] `verifyAcceptanceCriteria` — port `verify-ac` composite action
- [ ] `openPullRequest` — wrap `gh pr create` call
- [ ] `verifyDeployment` — poll Vercel deployment status

### Phase 3 — Signal wiring
- [ ] Build a lightweight GitHub Action (`signal-workflow.yml`) that sends a signal to the running workflow when the owner adds a specific label
- [ ] Replace `feature-design.yml` trigger with workflow start
- [ ] Replace `feature-implement.yml` trigger with signal

### Phase 4 — Worker deployment
- [ ] Deploy Temporal worker to Fly.io (or equivalent)
- [ ] Connect to Temporal Cloud
- [ ] Run feature pipeline end-to-end in staging
- [ ] Deprecate `feature-design.yml` and `feature-implement.yml`

---

## Key Temporal concepts to learn during implementation

- **Workflows** — deterministic functions that orchestrate activities; must be replay-safe (no random, no Date.now() directly)
- **Activities** — where side effects live (API calls, file I/O, Claude invocations); can be retried independently
- **Signals** — async messages sent to a running workflow from outside; used for human gates
- **Queries** — read-only inspection of workflow state without affecting execution
- **Task queues** — workers poll a named queue; worker and workflow must agree on the queue name
- **Time travel** — Temporal replays workflow history on worker restart; activities that completed are not re-run
- **Schedules** — for triggering workflows on a cron (nightly E2E could eventually move here)

---

## Resources

- [Temporal TypeScript SDK docs](https://docs.temporal.io/develop/typescript)
- [Temporal samples (TypeScript)](https://github.com/temporalio/samples-typescript)
- `temporal server start-dev` — local dev server, no account needed to start
