Create a customer-facing roadmap issue for a planned feature. The implementation spec is generated later by the design phase.

Usage: /plan-feature <title>

Steps:
1. If no title is provided in $ARGUMENTS, ask the user for one.

2. Create the **customer-facing roadmap issue**:
   - Title: `[Feature Request] <title>`
   - Label: `status: planned`
   - Body: a short, non-technical description of the feature from a user's perspective. Keep it to 2–4 sentences. No implementation details.
   - Command: `gh issue create --title "[Feature Request] <title>" --label "status: planned" --body "..."`
   - Do NOT add `user-requested` — that label is reserved for issues submitted via the in-app Feedback form.
   - Capture the issue number as `PUBLIC_N`.

3. Report the URL to the user. Remind them: add `status: approved` to kick off the design phase, which will generate a structured implementation spec with a reviewable plan before implementation starts.
