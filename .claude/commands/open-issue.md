Create a GitHub issue for future tracking or automated bot implementation.

Usage: /open-issue <title> [--auto-implement]

Steps:
1. Parse $ARGUMENTS. Check if `--auto-implement` is present anywhere in the string; if so, set `has_auto=true` and strip `--auto-implement` from the title (trim whitespace).
2. If no title remains after stripping, ask the user for one.
3. Create the issue:
   - If `has_auto`:
     - Title: `[Feature Request] <title>`
     - Labels: `status: auto-implement`
     - Command: `gh issue create --title "[Feature Request] <title>" --label "status: auto-implement"`
     - Note: the `feature-implement.yml` bot will pick this up automatically and open a PR.
   - Else:
     - Title: `[Feature Request] <title>`
     - Labels: `status: backlog`
     - Command: `gh issue create --title "[Feature Request] <title>" --label "status: backlog"`
   - Do NOT add `user-requested` — that label is reserved for issues submitted via the in-app Feedback form.
4. Report the issue URL and number to the user.
