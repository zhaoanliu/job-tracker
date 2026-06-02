# Workflow Cost Optimization

Analysis of the ~$150/10-day API spend on Claude in GitHub Actions workflows,
root causes, and a three-PR plan to reduce it.

## What happened

The Anthropic Console showed 145M input tokens / 1.1M output tokens over ~10 days,
almost entirely on `claude-opus-4-7`. Every `claude` CLI call in all workflows
omitted `--model`, inheriting the default from the pinned
`@anthropic-ai/claude-code@2.1.145`. That version (released 2026-05-19) defaulted
to `claude-opus-4-7` ($5/$25 per MTok). The current CLI (v2.1.160) defaults to
`claude-sonnet-4-6` — but the workflows were pinned and never picked up the change.

## Root cause 1 — wrong model

No `--model` flag anywhere. Pinned CLI version = Opus default.

**Fix (PR #1 — #528):** `install-claude/action.yml` installs a `claude-logged`
wrapper script alongside the CLI. The wrapper hard-codes `--dangerously-skip-permissions`,
`--model "${CLAUDE_MODEL}"`, and `--output-format json`, so all 11 call sites reduce to:

```bash
claude-logged --max-turns N -p "$(cat /tmp/prompt.txt)"
```

The wrapper also appends a cost line to `$GITHUB_STEP_SUMMARY` on every run:
```
cost=$0.24 in=5000 cache=120000 out=312
```

`CLAUDE_MODEL` defaults to `claude-sonnet-4-6` (set by `install-claude` via
`$GITHUB_ENV`). Override per step with `env: CLAUDE_MODEL: <model>` for future
routing. To change the default: one line in `install-claude/action.yml`.

Expected effect: ~40% cost reduction (Opus at $5/$25 → Sonnet at $3/$15).

## Root cause 2 — context window growth

The 130:1 input:output ratio (145M in / 1.1M out) comes from multi-turn context
accumulation. Claude Code in `-p` (non-interactive) mode re-sends the full
conversation history on every turn, including all tool results (file reads, command
output). A 20-turn bug-fix session that reads 10 files can hit 400–600K input
tokens by the final turn.

**Current `--max-turns` values vs what tasks actually need:**

| Workflow | Call site | Current | Proposed (#530) | Rationale |
|---|---|---|---|---|
| `auto-fix.yml` | main fix | 20 | 10 | Sentry gives file + line; fixes are 1–3 files |
| `auto-fix.yml` | CI-fix retry | 15 | 8 | Concrete build log = complete diagnosis |
| `ci-auto-fix.yml` | main fix | 20 | 10 | CI log + diff is a complete diagnosis |
| `ci-auto-fix.yml` | CI-fix retry | 15 | 8 | Same |
| `cd-auto-fix.yml` | build fix | 20 | 10 | Build errors are usually 1 type error |
| `feature-design.yml` | design gen | 30 | 18 | Writing markdown/JSON, not code exploration |
| `feature-implement.yml` | subtask buffer | `estimated+12` | `estimated+5` | Buffer too generous |
| `verify-ac` | AC gen | 20 | 8 | One file, follows a template |
| `verify-ac` | AC self-heal | 25 | 15 | Has concrete diff to work from |
| `rebase` | conflict resolve | 15 | 15 | Leave — conflicts can be complex |
| `db-fix.yml` | migration fix | 10 | 10 | Already reasonable |

Tracking issue: #530

## Root cause 3 — full feature context repeated per subtask

`feature-implement.yml` prepends `cat /tmp/prompt.txt` (the entire feature prompt
including design spec) to every subtask prompt (line 342–343). For a 5-subtask
feature with 25 turns each, the design spec is re-read 125 times as a fixed prefix.

**Important:** `/tmp/prompt.txt` contains critical hard rules (Next.js route
constraint, test requirements, summary format) — not just context. Do not remove
it without first moving those rules into the subtask RULES block. This is a
separate, careful change tracked under #530.

## PR #3 — cost-aware model routing (Haiku vs Sonnet)

Tracked in #531. Prerequisite: #528 + #530 both merged and confirmed clean.

### Routing principle

Use Haiku ($1/$5 per MTok) where the answer is mechanical and checkable.
Use Sonnet ($3/$15) where judgment matters and being wrong is costly or hard to reverse.

### Routing table

| Workflow | Default | Escalate to Sonnet when |
|---|---|---|
| `auto-fix.yml` | Haiku | Culprit path matches: `auth`, `session`, `token`, `payment`, `billing`, `migrations`, `.sql`, `middleware`, `sentry-webhook` |
| `ci-auto-fix.yml` | Haiku | Failed workflow is `migrate-validate` or `e2e-auth` |
| `cd-auto-fix.yml` | Haiku | Error involves API routes or auth |
| `feature-design.yml` | **Always Sonnet** | Judgment-heavy — drives all subsequent implementation |
| `feature-implement.yml` | Haiku | `files_to_modify` touches `app/api/`, `supabase/`, auth paths |
| `db-fix.yml` | **Always Sonnet** | Production migration — irreversible if wrong |
| `rebase` | **Always Haiku** | Mechanical text merge |
| `verify-ac` | **Always Haiku** | Template-following test generation |

### Key implementation constraints

1. **`feature-implement.yml` subtask loop** is a single `run:` bash block — cannot
   use composite action `uses:` steps inside it. Routing must call `route.py`
   directly as a Python subprocess, or determine the model before the loop.

2. **Haiku + auto-merge safety:** if Haiku misjudges a fix as low-risk, it
   auto-merges. The existing size guard (`≤2 files, ≤20 lines`) must remain a
   hard gate regardless of routing outcome.

3. **Never silently downgrade:** when the router is uncertain (score near threshold),
   escalate to Sonnet. `db-fix` and `feature-design` always use Sonnet — no override.

### Scoring (static, zero API cost)

```
+3  culprit/modified path matches a sensitive pattern (auto-fix)
+4  failing CI workflow is migrate-validate or e2e-auth (ci-auto-fix)
+3  PR label: security / breaking-change / architecture
+2  diff > 400 lines
+2  files touched > 12
+1  estimated_turns > 20 (feature-implement subtasks)

Threshold ≥ 3  →  Sonnet
```

All thresholds and sensitive-path patterns are env-var configurable with sensible
defaults in the routing script.

## Combined cost projection

| Change | Effect vs current |
|---|---|
| PR #1: Sonnet everywhere (merged) | ~40% reduction (Opus → Sonnet) |
| PR #2: max-turns reduction | ~40–50% fewer tokens within each call |
| PR #3: Haiku routing | ~60–70% reduction on routed-to-Haiku calls |
| Combined | Rough estimate: **$10–20 per comparable period** vs $150 |

## Failure mode analysis (pre-implementation notes)

Before implementing PR #3, these failure modes were identified and must be mitigated:

- **Composite action inside bash for-loop** — cannot use `uses:` steps inside a
  `run:` block; use direct Python subprocess instead.
- **`ci-auto-fix` checks out the failing branch** — if that branch predates a new
  composite action, it won't be found. Use `continue-on-error` + Sonnet fallback.
- **Haiku risk assessment accuracy** — Haiku may rate a fix as `low` when it
  should be `high`, triggering auto-merge. Keep the size guard as the hard safety net.
- **Don't bundle routing + max-turns + subtask-prompt changes** — ship separately
  so regressions are isolatable.
