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
4. Report the issue URL and number.
5. Proactively ask for more context to help the bot fix it faster. In a single follow-up message ask for all of the following — make clear they are all optional:
   - Steps to reproduce (numbered)
   - Which page, feature, or component is affected
   - What you expected vs what actually happened
   - Any error messages visible in the UI or browser console
6. If the user provides any details, post them as a comment on the issue:
   - `gh issue comment <N> --body "<formatted context>"`
   Continue adding comments if the user has more to add. Do NOT start implementing a fix.
