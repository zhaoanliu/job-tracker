Check CI on a PR and merge it (or queue it for auto-merge if checks are still running).

Usage: /ship <PR-number>  (or /ship with no argument to detect the PR for the current branch)

Steps:
1. Resolve the PR number:
   - If $ARGUMENTS is a number, use it directly.
   - Otherwise, detect it from the current branch: `gh pr view --json number --jq '.number'`
   - If no PR is found, report that and stop.
2. Show current checks: `gh pr checks <N> || true`
   (exit code 8 means checks are pending/failing — not a real error; `|| true` prevents a red error block)
3. Evaluate the result:
   a. **All checks pass** → merge with squash and delete the branch:
      ```
      gh pr merge <N> --squash --delete-branch --repo <owner>/<repo>
      ```
      Report the merge as successful and include the PR URL.
   b. **Some checks are pending** → enable auto-merge so it merges automatically once all checks pass:
      ```
      gh pr merge <N> --auto --squash --delete-branch --repo <owner>/<repo>
      ```
      Report which checks are still running and confirm auto-merge is enabled.
   c. **Some checks have failed** → list the failing checks by name, do NOT merge. Ask the user whether to investigate the failures.
4. After a successful merge (case a), check whether the linked issue (from "Closes #N" in the PR body) was automatically closed:
   - `gh pr view <N> --json closingIssuesReferences --jq '.closingIssuesReferences[].number'`
   - If the issue is still open, close it: `gh issue close <issue-N>`
5. After a successful merge (case a), pull local main to pick up the merged commit:
   - `git pull --ff-only 2>&1 || echo "skipped: local changes present"`
   - This ensures any new slash commands or skills are available immediately in the next session.
   - If the pull is blocked by local uncommitted changes, warn the user but do not fail.
6. After a successful merge (case a), clean up the worktree for this PR's branch if one exists:
   - Find the branch name: `gh pr view <N> --json headRefName --jq '.headRefName'`
   - Find the repo root and locate the worktree for that branch:
     ```
     REPO=$(git rev-parse --show-toplevel)
     path=$(git -C "$REPO" worktree list --porcelain | grep -B2 "branch refs/heads/<branch>" | grep "^worktree" | awk '{print $2}')
     ```
   - If found, remove it: `git -C "$REPO" worktree remove <path> --force`
   - Report the path that was removed, or skip silently if no worktree was found.
