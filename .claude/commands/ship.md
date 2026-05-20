Check CI on a PR and merge it if all checks pass.

Usage: /ship <PR-number>  (or /ship with no argument to detect the PR for the current branch)

Steps:
1. Resolve the PR number:
   - If $ARGUMENTS is a number, use it directly.
   - Otherwise, detect it from the current branch: `gh pr view --json number --jq '.number'`
   - If no PR is found, report that and stop.
2. Show current checks: `gh pr checks <N>`
3. Evaluate the result:
   a. **All checks pass** → merge with squash and delete the branch:
      ```
      gh pr merge <N> --squash --delete-branch
      ```
      Report the merge as successful and include the PR URL.
   b. **Some checks are pending** → report which ones are still running and suggest trying again when they finish.
   c. **Some checks have failed** → list the failing checks by name, do NOT merge. Ask the user whether to investigate the failures.
4. After a successful merge, check whether the linked issue (from "Closes #N" in the PR body) was automatically closed:
   - `gh pr view <N> --json closingIssuesReferences --jq '.closingIssuesReferences[].number'`
   - If the issue is still open, close it: `gh issue close <issue-N>`
