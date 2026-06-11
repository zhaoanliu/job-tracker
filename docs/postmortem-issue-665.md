# Post-mortem: Automated Rebase Discards Additive PR Changes, Breaking AC Tests

**GitHub issue:** #665  
**Fix PR:** #666 (`rebase-conflicting-prs.yml` prompt)  
**Affected PR:** #630 (lifeattiktok.com + joinbytedance.com JD import)  
**Design issue:** #627  
**Conflicting merge:** PR #637 (joinbytedance.com standalone handler), merged 2026-06-08  
**Date of incident:** 2026-06-08  
**Detected:** 2026-06-10 (AC-627-1, AC-627-2 failing in CI)  

---

## Summary

`feature-implement.yml` generated a correct implementation for PR #630 at 07:39 UTC on 2026-06-08. All six acceptance criteria passed CI within minutes. Later that day at 20:36 UTC, an unrelated PR (#637) merged to main and triggered the `rebase-conflicting-prs.yml` workflow. Both PRs had inserted new code after the same anchor line in `route.ts`, producing a three-hunk merge conflict. Every conflict hunk was purely additive — neither side deleted a pre-existing line — but the Claude prompt contained the phrase "when changes are genuinely incompatible prefer the HEAD version." Claude determined that two RSC handlers serving similar hostnames were "genuinely incompatible" and kept only PR #637's additions, silently discarding all four of PR #630's RSC helper functions, its `isLifeAtTikTok` flag, and its dispatch block. AC-627-1 and AC-627-2 have been failing ever since.

---

## Timeline

| Time (UTC) | Event |
|---|---|
| 2026-06-08 07:39 | `feature-implement.yml` sub-task 1 commits `c8a8478` — 5 files including `route.ts` with `extractRscPayloads`, `extractRscLabelValue`, `extractEditorContentFromRsc`, `extractLifeAtTikTokFromPage`, `isLifeAtTikTok` flag, and dispatch block. |
| 2026-06-08 08:01 | CI run 27123940136 passes. AC-627-1 through AC-627-5 pass; AC-627-6 fails (missing `[AC-627-6]` tag in test). |
| 2026-06-08 08:03 | Auto-fix run 27124126200 adds `[AC-627-6]` tag. All six ACs pass. PR #630 CI is green. |
| 2026-06-08 20:36 | PR #637 (joinbytedance.com) merges to main. It too inserts a new function (`extractJoinByteDanceFromPage`) immediately after `buildGoogleCareersMetaFallback` — the same anchor line as PR #630's additions. |
| 2026-06-08 20:36 | `rebase-conflicting-prs.yml` fires (triggered by push to main). `git rebase origin/main` fails: CONFLICT in `route.ts` and `app/api/fetch-job-description/CLAUDE.md`. |
| 2026-06-08 20:36–20:39 | Claude runs (~3 minutes, GHA run 27165390288) with the old prompt. For all three `route.ts` conflict hunks Claude judges the incoming RSC helpers as "genuine incompatibilities with the incoming refactor" and keeps HEAD throughout — discarding the four RSC helpers, `isLifeAtTikTok`, and the lifeattiktok dispatch block. |
| 2026-06-08 20:39:43 | Force-push attributed to `zhaoanliu` (GH_PAT). Branch now has a 4-file commit `c7139b3` — `route.ts` absent, all PR #630 implementation gone. |
| 2026-06-08 20:39:47 | CI run 27165570616: AC-627-1 and AC-627-2 fail — `expected '' to contain '<h1>...'`. |
| 2026-06-10 04:59 | PR #656 (amazon.jobs) merges. `rebase-conflicting-prs.yml` fires again. This rebase succeeds cleanly (no conflict with the now-absent RSC helpers). All three PR #630 commits get new SHAs dated 05:00:36Z. |
| 2026-06-10 05:01 | CI run 27254348003: AC-627-1 and AC-627-2 still fail. Issue #633 opened. Investigation begins. |
| 2026-06-10 | Forensic reconstruction: cherry-picked `c8a8478` onto `e592fd8`, rebased onto `4ec9179`. Confirmed all three conflict hunks are purely additive. Root cause identified. |
| 2026-06-10 | PR #666 opened: replaces the subjective "genuinely incompatible" escape hatch with an objective RULE A / RULE B binary test. |

---

## Root Cause

### Why there was a conflict at all

PR #637 and PR #630 each inserted new functions in the same location in `route.ts` — immediately after `buildGoogleCareersMetaFallback` on line 665. From git's perspective this is a merge conflict because both commits modify the same region of the same file relative to their common ancestor, even though neither deletes the other's work. The conflict is structural, not semantic.

### Why Claude chose "HEAD only" for all three hunks

The old prompt included:

> *"when both sides add independent content in the same region keep BOTH additions with HEAD content first; (4) when changes are genuinely incompatible prefer the HEAD version"*

The intent of rule (4) was to handle cases where both sides modify the *same* pre-existing lines in incompatible ways (e.g. a function body rewritten in two different directions). Instead, Claude applied it to this case: two different RSC-parsing implementations that served overlapping hostnames (`joinbytedance.com` appeared in both `isJoinByteDance` on HEAD and `isLifeAtTikTok` on the incoming side). Claude's reasoning:

> *"keeping HEAD throughout for all three conflict blocks — since all three were genuine incompatibilities with the incoming refactor"*

This is wrong. "Similar purpose" is not the same as "genuinely incompatible." Both handlers would have co-existed safely: `isJoinByteDance` fires first for joinbytedance.com and returns early; `isLifeAtTikTok` (which also matches joinbytedance.com) would only be reached on a miss — a no-op. The implementations are independent, not conflicting.

### Why the subjective rule was dangerous

Rule (4) gave Claude a judgment call with no objective criteria. The prompt said to use it when changes are "genuinely incompatible" but never defined what that means. Any time Claude saw two additions that felt related or redundant, rule (4) became a plausible escape hatch for collapsing the conflict instead of preserving both sides.

### Why the failure was not caught immediately

The auto-rebase workflow makes no assertion about what it preserved. It only checks that all conflict markers are gone and that `git rebase --continue` succeeds. A rebase that silently drops half the changes looks identical to one that correctly merges them. The next CI run is the first signal — but by then the force-push has already rewritten the branch.

---

## The Three Conflict Hunks

All three were confirmed purely additive by reproducing the conflict locally (`git cherry-pick c8a8478` onto `e592fd8`, then `git rebase 4ec9179`).

**Hunk 1 — function block (lines 668–779 in the conflict file)**

| Side | Content | Pre-existing line deleted? |
|---|---|---|
| HEAD (PR #637) | `extractJoinByteDanceFromPage` — full RSC parser for joinbytedance.com | No |
| Incoming (PR #630) | `extractRscPayloads`, `extractRscLabelValue`, `extractEditorContentFromRsc`, `extractLifeAtTikTokFromPage` — RSC helpers for lifeattiktok.com | No |

**Hunk 2 — flag declaration (lines 813–820)**

| Side | Content | Pre-existing line deleted? |
|---|---|---|
| HEAD | `const isJoinByteDance = parsed.hostname === 'joinbytedance.com' && ...` | No |
| Incoming | `const isLifeAtTikTok = (parsed.hostname === 'lifeattiktok.com' \|\| parsed.hostname === 'joinbytedance.com') && ...` | No |

**Hunk 3 — dispatch block (lines 1069–1083)**

| Side | Content | Pre-existing line deleted? |
|---|---|---|
| HEAD | `if (isJoinByteDance) { ... extractJoinByteDanceFromPage ... }` | No |
| Incoming | `if (isLifeAtTikTok) { ... extractLifeAtTikTokFromPage ... }` | No |

Correct resolution: keep both sides in all three hunks (HEAD first). The base at `e592fd8` had no `isJoinByteDance`, no `isLifeAtTikTok`, and none of the helper functions — both sides are purely additive.

---

## The Fix

### Old prompt (subjective)

```
"...when both sides add independent content in the same region keep BOTH additions
with HEAD content first; (4) when changes are genuinely incompatible prefer the HEAD
version..."
```

### New prompt (objective binary test)

```
"...For each block apply exactly one of these two rules based on an objective test —
do NOT use judgment about whether the content is 'related' or 'similar':
RULE A (additive): if neither the HEAD side nor the incoming side deletes any
pre-existing line (both sides consist entirely of new additions), keep ALL content
from BOTH sides with HEAD content first then incoming content. This applies even when
both sides add functions that serve similar purposes.
RULE B (rewrite): if either side modifies or deletes a line that already existed
before the conflict (e.g. a function body changed in two different ways), keep the
HEAD version only."
```

The key changes:

1. **RULE A is now mechanical** — the test is "does either side delete a pre-existing line?" That is answerable by inspection with no judgment.
2. **The "similar purpose" trap is called out explicitly** — "This applies even when both sides add functions that serve similar purposes."
3. **No escape hatch** — there is no rule (4). Every conflict is either RULE A or RULE B. There is no "looks incompatible" path to discarding incoming additions.

---

## Lessons Learned

### 1. Subjective language in AI prompts creates exploitable escape hatches

"Genuinely incompatible" was intended to mean "the same line was rewritten in two incompatible ways." Claude read it as "these two additions serve overlapping purposes." Any phrase that requires judgment — "incompatible," "related," "redundant," "conflicting" — can be satisfied by a plausible but wrong argument. Replace judgment calls with mechanical, falsifiable tests.

### 2. The auto-rebase workflow has no safety net between Claude finishing and the force-push landing

The workflow checks that conflict markers are gone (a structural check), not that the resolved file actually contains all the intended content (a semantic check). A silent deletion looks the same as a correct resolution. Consider adding a post-resolution diff check: if the resolved file is shorter than the HEAD version by more than a threshold, abort and flag for manual review.

### 3. "Works in CI before the rebase, breaks in CI after" is the correct detection signal — but requires knowing when to look

The failure was visible at 20:39 UTC on June 8 but was not investigated until a second CI run on June 10. The PR had no active reviewer watching for regressions after the automated rebase. Automated rebases should comment on the PR with a diff summary ("X functions removed from route.ts") so regressions are visible without needing to re-examine CI.

### 4. Two PRs that add to the same location will always conflict, regardless of content

The root structural cause is that `feature-implement.yml` placed every new JD-import handler at the same insertion point (after `buildGoogleCareersMetaFallback`). Any two such PRs open simultaneously will conflict. This is a workflow property to be aware of when multiple JD-import PRs are in flight at the same time.

---

## Prevention

### Immediate — new Claude prompt (PR #666)

The new RULE A / RULE B binary test prevents the specific failure mode. Claude now has no path to discarding additive content by invoking a "compatibility" judgment.

### Still needed — repair PR #630

The `route.ts` changes lost in the rebase have not been restored. PR #630 currently fails AC-627-1 and AC-627-2. The four RSC helper functions, `isLifeAtTikTok` flag, and dispatch block need to be re-added on top of current main (which now includes both PR #637's `extractJoinByteDanceFromPage` and PR #656's `extractAmazonJobFromPage`). See issue #633.

### Future — post-resolution content audit in the rebase workflow

After Claude resolves conflicts and before force-pushing, compare the line count of each resolved file against the HEAD version. If the resolved file has fewer lines than HEAD (meaning content was dropped from the incoming side entirely), abort and label the PR for manual resolution. This catches the "silent deletion" pattern regardless of what prompt Claude was given.
