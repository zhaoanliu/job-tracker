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

3. Report the URL to the user, then explain the two-stage approval flow and tell them the **next** step is `status: approved` (not `status: auto-implement`):
   1. Add `status: approved` to the public issue → the design phase runs and generates a structured implementation spec with a reviewable plan.
   2. Refine that spec as needed.
   3. Add `status: auto-implement` to the public issue → the implementation phase runs and opens a PR.

   Always lead with `status: approved`. `status: auto-implement` applied first skips the design-review step entirely, so never present it as the immediate next action.
