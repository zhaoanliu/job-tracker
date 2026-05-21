Create a GitHub feature request issue for future tracking (backlog).

Usage: /open-issue [--auto] <title>

Steps:
1. Parse $ARGUMENTS. If the first token is `--auto`, set auto-implement mode and use the remaining tokens as the title. Otherwise treat all of $ARGUMENTS as the title. If no title is provided, ask the user for one.
2. Create the issue with:
   - Title: `[Feature Request] <title>`
   - Labels (default): `status: backlog`
   - Labels (with `--auto`): `status: auto-implement` — this triggers `feature-implement.yml` to implement the issue immediately
   - No body required unless the user provided extra detail.
   - Default command: `gh issue create --title "[Feature Request] <title>" --label "status: backlog"`
   - `--auto` command: `gh issue create --title "[Feature Request] <title>" --label "status: auto-implement"`
3. Report the issue URL and number to the user.
