# Confluent — Principal Engineer, Engineering AI Productivity

**Role:** Principal Engineer, Engineering AI Productivity  
**Company:** Confluent (IBM subsidiary)  
**Req:** R04405 — Remote, United States

---

## Project summary

**ApplyTrackr** ([applytrackr.app](https://applytrackr.app)) is a production kanban board for tracking job applications — built with Next.js 14 App Router, Supabase (Postgres + auth), and deployed on Vercel. The app itself is straightforward; the engineering story is in the automation layer built around it.

The project has a **fully autonomous AI-powered SDLC pipeline**:

- **Auto-fix pipeline:** Sentry captures a production error → HMAC-validated webhook fires → GitHub `repository_dispatch` event triggers → Claude Code analyzes the stack trace and edits the codebase → local CI runs (lint + tsc + tests) → PR opened with risk-based routing: low-risk fixes auto-merge; high-risk changes wait for human review → merged PR closes the GitHub issue and resolves the Sentry alert. End-to-end with no human touch.
- **Feature pipeline:** User submits a feature request → owner adds `status: approved` → Claude generates a design spec (reads the codebase, fetches external URLs, writes structured implementation plan with machine-readable JSON + human checkboxes) → owner refines the spec → `status: auto-implement` triggers → Claude implements step by step, ticking checkboxes as it goes, runs Playwright AC verification, self-heals failures → PR opened closing both the feature issue and design issue.
- **CI/CD self-healing:** Any CI failure fires a `ci-failure` dispatch → `ci-auto-fix.yml` fetches the failed logs, runs Claude to fix the root cause, pushes back to the PR branch so CI re-runs automatically.
- **Governance layer:** Risk scoring built into Claude's output, safeguard reverts to prevent the model from modifying its own orchestration, hydration error skip (unfixable browser-extension issues auto-closed), AC coverage enforcement as a CI gate.

The full pipeline is event-driven — webhooks and GitHub dispatch events are the message bus — making it directly analogous to a Kafka-based producer/consumer architecture at enterprise scale.

**Stack:** Next.js 14, Supabase, Tailwind CSS, Sentry, Vercel, GitHub Actions, Claude Code (Anthropic API), Playwright, Vitest, Temporal (migration in progress — issue #505).

---

## The core narrative

You've built a **production agentic AI pipeline** on a real deployed app: Sentry error → webhook → GitHub dispatch → Claude Code → automated PR (with risk-based routing for auto-merge vs human review). That's not a demo or a prototype — it's a live system handling production bugs autonomously. This maps directly to what Confluent wants.

The meta-point: your pipeline is itself an event-driven system, which is Confluent's domain. You can credibly say "I've built event-driven agentic workflows in production — and your platform is what makes that pattern scale to an enterprise."

---

## STAR Stories

### 1. Define and deliver an agentic AI workflow

**Situation:** Production Next.js app with Sentry error monitoring. Manual triage was taking time and errors were piling up.

**Task:** Design a zero-touch path from Sentry alert to merged fix, without human involvement for routine bugs.

**Action:** Built the full pipeline — HMAC-validated Sentry webhook → `repository_dispatch` → `auto-fix.yml` workflow that: fetches the full Sentry event (stack trace, error type, culprit) via Sentry API, constructs a structured prompt for Claude, runs `claude --dangerously-skip-permissions` to edit code, runs local CI (lint + tsc + test:coverage), then routes the PR by risk score (low-risk: auto-merge; high-risk: human review). Added a safeguard revert step that always restores `.github/` from `origin/main` after Claude runs — preventing the model from modifying its own orchestration layer.

**Result:** Routine bugs (null guards, type fixes, missing checks) now go from Sentry alert to merged PR in under 10 minutes with no human touch. High-risk changes still get reviewed. Built explicit governance: the model self-scores risk and the workflow enforces the routing — humans only see what they need to see.

**Confluent angle:** This is exactly what they want to build internally — automating the manual parts of the SDLC. Draw the parallel: your pipeline uses GitHub's event dispatch as the message bus; at Confluent scale, that becomes Kafka topics triggering worker pools.

---

### 2. Multi-step automated workflow with human-in-the-loop gates

**Situation:** Feature requests from users were unstructured, and implementation had no design phase — leading to misaligned PRs.

**Task:** Build a two-phase design → implement pipeline with explicit human approval gates.

**Action:** Built `feature-design.yml` (Phase 1) and `feature-implement.yml` (Phase 2). Design phase: Claude reads the codebase, fetches external URLs to investigate ATS backends, writes a structured spec to a GitHub issue with a machine-readable `<!-- implementation-plan-json -->` block and human-readable checkboxes. Human reviews the design, edits checkboxes if needed, then adds `status: auto-implement` label. Implement phase: Claude parses the JSON plan, executes subtasks in order, ticks off checkboxes as it goes, runs Playwright AC verification, and opens a PR with both issues in `Closes #X #Y`. The system is idempotent — interrupted runs resume from the last completed step.

**Result:** Features now ship with verified acceptance criteria. The `verify-ac` composite action self-heals implementation failures (up to 2 attempts) before opening the PR. The design spec becomes a living document that both Claude and humans can edit.

**Metrics angle:** `check-ac-coverage.mjs` runs in CI on every PR and fails if any AC item has no tagged test. That's a measurable quality gate built into the pipeline.

---

### 3. Eliminate manual workflows with measurable ROI

**Situation:** CI failures on PRs required a developer to diagnose the log, find the fix, push a correction, and wait for CI to re-run — a 20–30 minute loop per failure.

**Task:** Automate the CI self-healing loop entirely.

**Action:** Built `ci-auto-fix.yml` — triggers on `ci-failure` repository dispatch (fired by all 4 CI workflows on failure). Fetches up to 500 lines of failed-step logs via `gh run view --log-failed`, collects diff vs main, runs Claude to fix the root cause, then for feature branches pushes directly back to the PR branch (using `GH_PAT` checkout to avoid GitHub's `GITHUB_TOKEN` suppression of CI triggers). Built two concurrency layers to prevent infinite loops: GitHub blocks `GITHUB_TOKEN` push triggers, and an actor check skips runs where `actor == 'github-actions[bot]'`.

**Result:** Lint errors, type errors, and test failures on PRs are now auto-healed within ~3 minutes. The system handles its own failures — `cd-auto-fix.yml` and `db-fix.yml` extend the same pattern to Vercel deployments and Supabase migrations.

---

### 4. Responsible AI / governance in agentic systems

The JD explicitly calls for this. Concrete layers in your implementation:

- **Risk scoring built into the agent's output** — Claude writes `low` or `high` to `/tmp/risk.txt` based on explicit criteria (file count, change type, what was touched). The workflow reads this file and routes accordingly. The model gates itself.
- **Hard constraints in prompts** — "Do NOT modify `.github/`", "Do NOT remove env-var guards", "Write ONLY 'low' or 'high' to risk.txt". The prompt is a specification, not a suggestion.
- **Safeguard revert step** — even if Claude ignores the constraint and edits `.github/`, the workflow reverts it to `origin/main` before the PR is opened. Defense in depth.
- **No-ops are explicit** — when Claude makes no changes, the workflow comments, closes the issue, and resolves Sentry. It doesn't silently do nothing.
- **Hydration error skip** — `replay_hydration_error` issues (browser extension DOM mutations, no stack trace, unfixable in app code) are detected by `issueType` in the Sentry API response and auto-closed with an explanation. The model never runs on unfixable issues — saves cost, prevents hallucinated fixes.
- **AC coverage enforcement** — `check-ac-coverage.mjs` in CI fails if any acceptance criterion has no tagged test. An AI-generated feature can't ship without verified test coverage.

---

### 5. Design a system and evaluate alternatives (Temporal vs GitHub Actions)

**Situation:** The feature pipeline spans days/weeks with human pause points. GitHub Actions has no durable state between runs — labels were being used as a makeshift database and bash retry loops were hand-rolled.

**What I documented:** 13 workarounds in `docs/github-actions-audit.md` — `GH_PAT` token swap to avoid GITHUB_TOKEN suppression, concurrent-run deduplication with list-API lag guards, bash retry loops for Anthropic 529 rate limits, etc.

**The Temporal evaluation:** Workflow/activity split handles the "durable state between human gates" problem natively. Signals vs polling for CI status is the key design tradeoff:
- Polling (check-runs API every 30s): self-contained, no infrastructure dependency
- Signals (webhook → `ci-passed` signal): elegant but requires the worker to be reachable

Decision: start with polling, design the activity interface to allow swapping to signals later. Self-hosted via docker-compose ($25–50/month VPS) vs Temporal Cloud ($200/month minimum) — not justified at current scale, but the architecture is clean enough that migrating to Cloud later is a config change.

This shows distributed systems thinking, cost-conscious architecture, and the ability to document why alternatives were rejected.

---

## Technical Talking Points

### Event-driven agentic architecture

Your pipeline uses event dispatch as the coordination primitive — a Sentry webhook fires, a GitHub `repository_dispatch` event routes to the right workflow, the workflow runs asynchronously, and the result (PR opened, issue closed, Sentry resolved) is itself an event with downstream effects. This is isomorphic to a Kafka-based producer/consumer architecture.

**The Confluent bridge:** "At Confluent's scale, the right substrate for this is a Kafka topic per event type, with worker pools subscribing — you get replay, dead-letter queuing, and audit trail for free."

### LLM integration patterns

- **Prompt as contract:** the prompt specifies exact output files and formats (`/tmp/risk.txt` = single word only, `/tmp/summary.txt` = exactly three markdown sections). Parsing is deterministic because the contract is enforced at the prompt level.
- **Context injection:** the auto-fix prompt includes the full Sentry event (stack trace, error type, culprit, most recent 8 frames with `[app]` markers). Without this, the model exhausts its turn budget without finding the bug. Context quality is the single biggest lever on agentic system performance.
- **Model routing:** `install-claude` exports `CLAUDE_MODEL=claude-sonnet-4-6` as the default; step-level `env: CLAUDE_MODEL: claude-haiku-4-5-20251001` overrides it for cheap classification tasks. This is the pattern for cost optimization in production agentic systems.
- **Cost tracking:** every Claude run appends `cost=$X in=Y cache=Z out=W` to `$GITHUB_STEP_SUMMARY`. Per-run spend data is available for ROI analysis.

### Distributed systems / workflow orchestration

- **Concurrency control:** per-issue concurrency groups (`cancel-in-progress: false`) queue concurrent runs rather than race. When two Sentry alerts fire simultaneously for the same error, the second run finds an existing open issue and an existing PR and skips — deduplication at the orchestration layer, not the code layer.
- **Idempotency:** `fix/issue-N-<timestamp>` branch names ensure re-runs never collide. The dedup check (list API vs search API, to avoid indexing lag) is a distributed systems problem — went with the eventually-consistent-safe path.

---

## Confluent-Specific Angle

### Why Confluent specifically

1. You've been studying Temporal for workflow orchestration — the next natural learning step is Kafka for the messaging layer. Confluent is the world's Kafka experts.
2. Your agentic pipeline has the same fundamental shape as a streaming data pipeline: events trigger workers, workers produce state changes, state changes trigger downstream events. The difference is the payload is LLM output instead of business data.
3. You're building toward a Kafka→Flink→Grafana portfolio project for real-time analytics. Understanding Confluent's product firsthand as an employee directly accelerates the learning.

### Questions to ask them

- "Is the AI productivity tooling primarily for Confluent's internal R&D teams, or does the role also include helping customers adopt similar patterns?" (Tests whether the 60/40 execution/strategy split is real or aspirational)
- "What's the current state of AI adoption across engineering — are teams early-adopters or skeptical?" (Reveals whether you're building from scratch or accelerating existing adoption)
- "What does the Kafka + agentic pattern look like internally — is there work to connect Confluent's own platform to internal AI workflows?" (Shows domain curiosity and direct relevance)
- "How do you handle the responsible AI piece when the automation is generating code that goes to production?" (Surfaces their governance maturity — lets you compare to your risk-routing approach)

---

## One-Liner for "Tell me about yourself"

> "I've spent the last year building a production agentic AI system that closes the loop from Sentry error to merged code fix with zero human touch — including the governance layer that decides when to auto-merge vs require review. The system is fundamentally event-driven, which is why I'm drawn to Confluent: the pattern I've built at small scale is what Kafka makes possible at enterprise scale."

---

## JD → Story mapping

| JD requirement | Your story |
|---|---|
| Define agentic flows strategy | Auto-fix pipeline design: webhook → dispatch → Claude → risk-routed PR |
| Identify SDLC bottlenecks | CI self-heal loop (20-30 min manual → 3 min automated) |
| Cross-functional alignment | Feature pipeline: user request → design approval → AC verification → merge |
| Governance & responsible AI | Risk scoring, safeguard revert, hydration error skip, AC coverage enforcement |
| LLM integration, agentic patterns | Prompt-as-contract, context injection, model routing, cost tracking |
| Distributed systems expertise | Concurrency groups, idempotency, eventual consistency dedup, Temporal evaluation |
| Define KPIs & success metrics | Per-run cost in step summaries, AC coverage as a CI gate, auto-merge rate |
| Real-time / event-driven background | Pipeline is event-driven; direct bridge to Kafka/Confluent's domain |
