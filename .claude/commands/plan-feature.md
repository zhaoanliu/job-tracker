Create a two-issue pair for a planned feature: one customer-facing roadmap issue and one internal implementation issue, cross-linked.

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

3. Create the **internal implementation issue**:
   - Title: plain descriptive title (no prefix, no `[Feature Request]`), same subject as the public issue
   - Label: `status: backlog`
   - Body: synthesize all technical details from the current conversation — approach, affected files, edge cases, open questions. Include a line `Public roadmap issue: #<PUBLIC_N>` at the top.
   - Command: `gh issue create --title "<plain title>" --label "status: backlog" --body "..."`
   - Capture the issue number as `INTERNAL_N`.

4. Add a cross-link comment to the public issue pointing to the internal one:
   - `gh issue comment <PUBLIC_N> --body "Internal tracking issue: #<INTERNAL_N>"`

5. Report both URLs to the user. Remind them: add `status: auto-implement` to the internal issue (#<INTERNAL_N>) when ready to start implementation.
