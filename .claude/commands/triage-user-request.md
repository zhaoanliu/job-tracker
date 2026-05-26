Triage a user-submitted feature request interactively: clarify requirements, agree on a concrete plan, then mark the issue as approved (ready for design) or backlog.

Usage: /triage-user-request <issue-number>

Steps:

1. If no issue number is provided in $ARGUMENTS, ask the user for one.

2. Fetch the issue:
   `gh issue view $ARGUMENTS --json number,title,body,labels`

3. Summarize the request in 1–2 sentences and confirm you understand it correctly before asking anything else.

4. Ask clarifying questions one at a time — wait for the user's answer before asking the next. Generate questions based on what is genuinely ambiguous in this specific request. Do not ask about things already clear from the request or obvious from context. Common areas to probe:

   For UI fields or UI changes:
   - Where exactly does it appear? (form modal / kanban card / filter bar / stats bar — be specific)
   - Free-text input or a fixed set of values? If fixed, what are the values?
   - Required or optional?
   - Should it be filterable from the filter bar?
   - Should it show on the kanban card, or only in the detail modal?
   - What should existing applications show for this field? (empty / a default value)

   For API or backend features:
   - Who calls this? (internal automation / external client / the app itself)
   - Authentication required?
   - What does the request look like? What does the response look like?

   For workflow or automation features:
   - What triggers it?
   - What is the expected output or side effect?
   - What should happen on failure?

   Stop asking when you have enough to write acceptance criteria with no open questions.

5. Produce a concrete requirements spec and show it to the user:
   - **What**: one sentence description
   - **Where** (if UI): exact component and placement
   - **Data shape**: type, constraints, required/optional, allowed values
   - **Acceptance criteria**: bulleted checklist — what a tester must be able to do to confirm the feature works. At least one item must be a user-visible action.
   - **Out of scope**: anything explicitly not included

6. Ask: "Ready to approve this for design, or move to backlog?"

7. Based on the answer:

   **If approved:**
   - Edit the issue body to append the requirements spec under a `## Clarified requirements` heading:
     `gh issue edit $ARGUMENTS --body "$(gh issue view $ARGUMENTS --json body --jq '.body')\n\n## Clarified requirements\n<spec>"`
   - Add `status: approved`, remove `status: backlog` if present:
     `gh issue edit $ARGUMENTS --add-label "status: approved" --remove-label "status: backlog"`
   - Tell the user: issue #N is approved — the design workflow will start automatically.

   **If backlog:**
   - Post the requirements spec as a comment so context is preserved:
     `gh issue comment $ARGUMENTS --body "## Requirements clarified (backlog)\n<spec>"`
   - Ensure `status: backlog` is set:
     `gh issue edit $ARGUMENTS --add-label "status: backlog" --remove-label "status: approved"`
   - Tell the user: issue #N is in backlog with clarified requirements saved.
