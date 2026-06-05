# Shell Audit — jq / `|| true` findings

*Conducted: 2026-06-04. Covers all `.github/workflows/` and `.github/actions/` files.*

---

## How the original bug was found (rebase-conflicting-prs.yml)

The workflow was created on May 24 with a jq operator-precedence error:

```bash
# buggy — parsed as .number | (tostring, .headRefName, .mergeable)
--jq '.[] | [.number | tostring, .headRefName, .mergeable] | @tsv'
```

jq's `|` has lower precedence than `,`, so `.number` was piped into all three expressions. Applying `.headRefName` to a number produces `"Cannot index number with string"`.

**Why it was silent for 9 days (May 24 – June 2):**

1. **Empty PR list → no error.** When no PRs are open, `.[]` produces no output and the filter never executes. Correct "success."
2. **Non-empty PR list → jq exits 1, but pipefail didn't catch it.** CI logs showed `shell: /usr/bin/bash -e {0}` (no `pipefail`). Without `pipefail`, a pipeline's exit code is the last command's exit code — the `while` loop, which exits 0. The jq error appeared in raw logs but never failed the step.
3. **No failure notification.** The rebase workflow has no `if: failure()` step and no `ci-failure` dispatch. A failed run produced a quiet red icon in Actions with no issue, no alert.

Confirmed locally:
```bash
bash -e -c 'false | while read l; do echo $l; done; echo done'
# → prints "done", exits 0   (no pipefail: while's 0 wins)

bash -eo pipefail -c 'false | while read l; do echo $l; done; echo done'
# → exits 1   (pipefail catches false's non-zero)
```

**Fix (June 2):** parenthesise the sub-expression:
```bash
--jq '.[] | [(.number | tostring), .headRefName, .mergeable] | @tsv'
```

---

## Full audit results

### Bugs fixed in this PR

**1. `feature-verify.yml:37` — null `headRefName` crashes `startswith()`**

```bash
# before
jq -r ".[] | select(.headRefName | startswith(\"feat/issue-${ISSUE_NUMBER}-\")) | .number"
# after
jq -r ".[] | select(.headRefName != null and (.headRefName | startswith(\"feat/issue-${ISSUE_NUMBER}-\"))) | .number"
```

`startswith()` requires a string. If any open PR has a null `headRefName`, jq exits 5. The `|| true` produced an empty `PR_NUMBER` → `exit 1` with "No open PR found."

**2. `feature-design.yml:97` and `feature-implement.yml:90` — null comment body crashes `contains()`**

```bash
# before
--jq '[.comments[].body | select(contains("design-issue:"))] | last'
# after
--jq '[.comments[] | select(.body != null) | .body | select(contains("design-issue:"))] | last'
```

`null | contains("string")` errors in jq. The `|| true` silently returned empty, so the design-issue lookup failed → next run created a duplicate design issue.

**3. `auto-fix.yml:439`, `bug-fix.yml:167`, `ci-auto-fix.yml:364` — `gh pr merge --auto || true` swallowed failure**

`cd-auto-fix.yml` already omits the `|| true` — the three other workflows had it accidentally. If auto-merge fails (disabled in repo settings, permissions), the PR was silently created without auto-merge and the issue comment falsely said "auto-merge enabled."

Fixed: replaced with `if GH_TOKEN=... gh pr merge ...; then ... else add-label + adjusted comment; fi`.

---

### Every `|| true` / `2>/dev/null` in the codebase — categorised

**Correct — expected non-errors:**

| Location | Pattern | Why correct |
|---|---|---|
| All workflows | `gh issue/pr edit --add/remove-label ... 2>/dev/null \|\| true` | Label may already exist or not exist |
| All workflows | `gh label create ... --force 2>/dev/null \|\| true` | `--force` handles existence; `\|\| true` covers races |
| All workflows | `grep pattern file \|\| true` | grep exits 1 on no match — not an error |
| supabase-start, verify-ac | `supabase stop \|\| true` | May not be running |
| install-claude | `jq -r ... >> "$GITHUB_STEP_SUMMARY" 2>/dev/null \|\| true` | Cost telemetry; non-critical |
| cd.yml | `VERCEL_ERR=$(tail ... 2>/dev/null \|\| true)` | File may not exist |
| detect-doc-only | `grep -Ev ... \|\| true` | No-match is the expected path |
| ci-auto-fix, auto-fix | `git diff HEAD 2>/dev/null \| head -c 20000` | No staged changes is valid |

**Correct — set +eo pipefail blocks:**

All six instances (`auto-fix.yml`, `ci-auto-fix.yml`, `feature-implement.yml` ×2, `verify-ac/action.yml`) follow the right pattern: disable strict mode, **manually capture `${PIPESTATUS[0]}`**, re-enable strict mode, branch on the captured value. None swallow the exit code silently.

**`cd-auto-fix.yml:40` `set +e`:** captures both `BUILD_EXIT` and `TSC_EXIT` before re-enabling `set -e`. Correct.

---

## The structural root cause

bash has no error taxonomy. Exit code 1 means "no match" (grep), "label not found" (gh), and "transient API failure" (gh) — indistinguishably. `|| true` is the only tool to express "I accept this exit code," and it over-suppresses: it also hides the codes you didn't intend to accept.

The right fix is either explicit exit-code capture (`if cmd; then ... else ...; fi`) or a proper language with typed exceptions. See `docs/temporal-migration-plan.md` for the planned migration of the orchestration layer to TypeScript/Temporal, which eliminates this class of problem by giving error handling a real vocabulary.

---

## New instructions added to `.github/CLAUDE.md`

- **Item 6 of the self-review checklist** expanded: jq added explicitly alongside sed/awk/python; structural trigger (every `--jq` flag); jq precedence and null-access gotchas documented; required test command shown.
- **`|| true` usage rules section** added: correct uses, wrong uses with examples, the audit reference.
