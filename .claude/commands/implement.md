Create a GitHub feature request issue, implement it on a branch, and open a PR.

Usage: /implement <title> — optionally followed by a description after a newline

Steps:
1. Parse the title from $ARGUMENTS (first line). Use remaining lines as the issue body if present.
2. Create the GitHub issue:
   - Title: `[Feature Request] <title>`
   - Labels: `status: in progress`
   - Command: `gh issue create --title "[Feature Request] <title>" --label "status: in progress" [--body "<body>"]`
   - Capture the issue number from the URL printed to stdout.
3. Ensure you are on main and it is up to date: `git checkout main && git pull origin main`
4. Create a feature branch: `git checkout -b feat/issue-<N>-<slug>` where `<slug>` is the title lowercased with spaces replaced by hyphens, trimmed to ~30 chars.
5. Implement the feature following project conventions (see CLAUDE.md):
   - No comments unless the WHY is non-obvious
   - Write or update tests for the new behaviour
   - Update README.md if the feature is user-visible
6. Commit all changes: `git add <files> && git commit -m "feat: <title> (closes #<N>)"`
7. Push the branch: `git push -u origin feat/issue-<N>-<slug>`
8. Open a PR whose title matches the issue title plus the issue number:
   ```
   gh pr create \
     --title "[Feature Request] <title> (#<N>)" \
     --body "Closes #<N>" \
     --base main
   ```
9. Report the PR URL to the user.
