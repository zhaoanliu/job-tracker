Create a GitHub feature request issue for future tracking (backlog).

Usage: /open-issue <title>

Steps:
1. The title argument is the feature description. If no title is provided, ask the user for one.
2. Create the issue with:
   - Title: `[Feature Request] $ARGUMENTS`
   - Labels: `user-requested`, `status: backlog`
   - No body required unless the user provided extra detail.
   - Command: `gh issue create --title "[Feature Request] $ARGUMENTS" --label "user-requested" --label "status: backlog"`
3. Report the issue URL and number to the user.
