# Temporal Migration Plan

*Status: planned — not yet implemented*
*GitHub issue: #505*
*Related: [GitHub Actions audit](github-actions-audit.md) · [Feature pipeline](feature-pipeline.md) · [Shell audit](shell-audit.md)*

**Deployment approach: self-hosted** (not Temporal Cloud). Rationale: learning Temporal's internals for interview preparation; infrastructure cost of Temporal Cloud (~$200/month minimum) is not justified at this scale. Self-hosted on a single VPS (docker-compose) with PostgreSQL costs $25–50/month and covers everything this project needs.

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
- [ ] Self-hosted Temporal server via `docker-compose` (server + PostgreSQL + UI — see `temporal/docker-compose.yml`)
- [ ] `@temporalio/client` and `@temporalio/worker` npm packages
- [ ] Temporal worker deployed as a long-lived process (same VPS as the Temporal server, or Fly.io/Railway)
- [ ] A small webhook receiver (Express/Hono on Vercel or same VPS) to translate GitHub events → workflow starts/signals

### Migration order — simplest to most complex

Start here to learn the core SDK before tackling advanced concepts:

**1. `rebase-conflicting-prs.yml` → first migration target**
One workflow, no child workflows, no signals. Teaches: workflow/activity split, retry policies on activities (mergeability polling), typed error handling replacing `|| true`. The jq null-type bugs fixed in `docs/shell-audit.md` become explicit typed `catch` blocks.

**2. `auto-fix.yml` / `bug-fix.yml`**
Introduces: activity heartbeating (Claude runs for minutes — activities must heartbeat so Temporal doesn't assume they died), compensation (the `.github/` revert as a compensating activity that runs if Claude modifies workflows).

**3. `ci-auto-fix.yml`**
Introduces the **signals vs polling** design decision: after pushing a fix, how do you wait for CI to pass?
- **Polling approach**: activity that calls GitHub's check-runs API every 30s until all pass — self-contained, simpler.
- **Signal approach**: webhook receiver sends a `ci-passed` signal to the waiting workflow when GitHub fires the `check_suite` event — elegant but requires the worker to be reachable from GitHub.
Being able to articulate this tradeoff is a senior-level Temporal interview question.

**4. `feature-design.yml` → `feature-implement.yml` → `verify-ac`**
Most complex: child workflows, multi-day human pause points (Signals replacing label polling), and the full saga pattern. Implement last after the SDK is well understood.

### Phase 1 — Scaffolding
- [ ] Add `temporal/` directory to repo with `docker-compose.yml`, `worker.ts`, and workflow/activity stubs
- [ ] Define `featureWorkflow` in TypeScript
- [ ] Define activity stubs (generateDesign, runImplementation, verifyAC, openPR, verifyDeployment)
- [ ] Spin up local dev server (`temporal server start-dev`) and verify UI at localhost:8080
- [ ] Write unit tests for workflow logic using Temporal's test framework

### Phase 2 — Start with rebase workflow (learn core SDK)
- [ ] Implement `checkMergeability` activity with retry policy (replaces polling loop)
- [ ] Implement `rebasePR` activity with compensation on failure
- [ ] Implement `resolveConflictsWithClaude` activity with heartbeating
- [ ] Wire GitHub push event → workflow start via webhook receiver
- [ ] Run end-to-end against a test PR; verify in Temporal UI

### Phase 3 — Port auto-fix workflows
- [ ] `fetchSentryDetails` activity
- [ ] `runClaudeFix` activity with heartbeating and typed retry (529 → backoff, other errors → fail)
- [ ] `revertWorkflowFiles` compensating activity
- [ ] `openPR` + `enableAutoMerge` activities (replaces `gh pr merge || true` with explicit typed handling)

### Phase 4 — CI auto-fix with signals or polling
- [ ] Choose and implement: polling activity or signal receiver for CI status
- [ ] Document the tradeoff decision in this file

### Phase 5 — Feature pipeline (child workflows + signals)
- [ ] `generateDesign` activity — port `feature-design.yml` Claude invocation
- [ ] `runImplementation` activity — port `feature-implement.yml` subtask loop
- [ ] `verifyAcceptanceCriteria` activity — port `verify-ac` composite action
- [ ] Build `signal-workflow.yml` GitHub Action to send signals on label events
- [ ] Replace `feature-design.yml` and `feature-implement.yml` triggers
- [ ] Run feature pipeline end-to-end; deprecate the GitHub Actions workflows

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
