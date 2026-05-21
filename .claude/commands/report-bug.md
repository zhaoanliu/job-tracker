Report a bug as a GitHub issue. The auto-fix bot will pick it up, implement a fix, and auto-merge if low-risk. Does NOT implement anything in the current session.

Usage: /report-bug <title> [— description]

Steps:
1. Parse $ARGUMENTS. The title is everything before " — " (em dash). Everything after is the description (optional).
2. If no title is provided, ask the user for one.
3. Create the issue:
   - Title: `fix: <title>`
   - Labels: `bug`
   - Body: the description if provided, otherwise `"No additional description."` (gh issue create requires --body in non-interactive mode)
   - Command: `gh issue create --title "fix: <title>" --label "bug" --body "<description or fallback>"`
   - Capture the issue number from the URL printed to stdout.
4. Report the issue URL and number. Note that `auto-fix.yml` will pick it up automatically and open a PR.
5. If the user wants to discuss the bug further (reproduce steps, stack traces, additional context), add that information as a comment on the issue:
   - `gh issue comment <N> --body "<context>"`
   Continue adding comments as the discussion unfolds — do NOT start implementing a fix.
