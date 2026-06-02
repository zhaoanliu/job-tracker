_Design for feature request #534: [Feature Request] Notify users by email when their requested feature ships to production_

## What the user wants

When a user submits a feature request via the in-app feedback form and that feature is later implemented and deployed to production, the submitter should automatically receive an email telling them their request shipped. The goal is to close the feedback loop so users know their input was acted on.

One ambiguity: the request says "at deploy time, referencing the original request." This design interprets that as: the notification fires on the exact deploy that contains the implementing PR, identified by the PR's `Closes #N` reference to the original GitHub issue.

## Proposed implementation

On each successful production deployment triggered by a `push` to `main`, a new step in `cd.yml` runs a TypeScript script that (1) uses GitHub's compare API over the `before`…`after` SHA range to find every PR merged in this deploy, (2) extracts `Closes #N` issue references from those PR bodies, and (3) for each closed issue that carries the `user-requested` label, parses the submitter's email from the issue body and sends a branded notification email via Resend.

The submitter's email is already stored in each GitHub issue's body by the existing `/api/feature-request` route as `**Submitted by:** user@example.com`, so no database changes are required.

### Files to modify or create

- `scripts/notify-feature-shipped.ts` — **New.** TypeScript script with exported `findShippedFeatureIssues` and `sendShippedEmail` helpers (importable by tests) and a `main()` CLI entry point. Uses Node 18+ built-in `fetch`; no third-party SDK imports.
- `__tests__/scripts/notify-feature-shipped.test.ts` — **New.** Vitest unit tests that stub `fetch` globally and verify: correct label filtering, email extraction, Resend payload shape, and graceful skipping of `unknown`-email issues.
- `.github/workflows/cd.yml` — **Modified.** Add a post-deploy step (guarded by `steps.deploy-vercel.outcome == 'success'` and `github.event_name == 'push'`) that runs `npx --yes tsx scripts/notify-feature-shipped.ts` with `RESEND_API_KEY`, `GH_TOKEN`, `BEFORE_SHA`, `CURRENT_SHA`, and `GITHUB_REPOSITORY` injected from secrets/context.
- `README.md` — **Modified.** Document `RESEND_API_KEY` as a required GitHub Actions secret (it already exists in Vercel env; it must also be added to repo secrets for `cd.yml` to access it).

### UI changes

None. The notification is a post-deploy pipeline step. No component, page, or user-facing element in the app changes.

## Implementation plan

<!-- implementation-plan-json
[
  {"id":1,"title":"Write notify-feature-shipped script and Vitest tests","scope":"Create scripts/notify-feature-shipped.ts exporting three functions: (1) extractClosedIssueNumbers(prBody: string): number[] — parses all 'Closes #N' / 'closes #N' patterns from a PR body; (2) findShippedFeatureIssues(repo, beforeSha, currentSha, ghToken) — calls GET https://api.github.com/repos/{repo}/compare/{before}...{sha} to get commits, then for each commit calls GET https://api.github.com/repos/{repo}/commits/{sha}/pulls (Accept: application/vnd.github.v3+json), collects unique issue numbers from PR bodies via extractClosedIssueNumbers, fetches each issue, filters to those with state 'closed' and label 'user-requested', and returns array of {issueNumber, title, htmlUrl, email} (email parsed from '**Submitted by:** <email>' in body, skipped if missing or 'unknown'); (3) sendShippedEmail(to, featureTitle, resendApiKey) — POSTs to https://api.resend.com/emails with from 'ApplyTrackr <noreply@applytrackr.app>', subject 'Your feature request just shipped on ApplyTrackr', and HTML email (branded, includes stripped title without '[Feature Request] ' prefix and a CTA button to https://applytrackr.app). Export a main() function that reads BEFORE_SHA, CURRENT_SHA, GITHUB_REPOSITORY, GH_TOKEN, RESEND_API_KEY from process.env, calls findShippedFeatureIssues, calls sendShippedEmail for each result, and logs outcomes. Add 'if (import.meta.url === new URL(process.argv[1], 'file:').href) { main() }' guard so tests can import without running. Write __tests__/scripts/notify-feature-shipped.test.ts using vi.stubGlobal('fetch', vi.fn()) to mock all HTTP calls: test extractClosedIssueNumbers parses 'Closes #42', 'closes #7', multiple matches; test findShippedFeatureIssues skips non-user-requested issues, skips unknown emails, returns correct shape for qualifying issues; test sendShippedEmail calls Resend with correct fields and strips '[Feature Request] ' from title; test sendShippedEmail logs error without throwing on Resend failure.","files_to_create":["scripts/notify-feature-shipped.ts","__tests__/scripts/notify-feature-shipped.test.ts"],"files_to_modify":[],"test_file":"__tests__/scripts/notify-feature-shipped.test.ts","estimated_turns":20},
  {"id":2,"title":"Wire notification step into cd.yml and update README","scope":"In .github/workflows/cd.yml, add a new step to the deploy job immediately after the 'Close open CD failure issues on successful deploy' step. The step name is 'Notify users whose feature requests shipped'. Condition: if: steps.deploy-vercel.outcome == 'success' && github.event_name == 'push' && github.event.before != '0000000000000000000000000000000000000000'. Env block: GH_TOKEN: ${{ secrets.GH_PAT }}, RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}, BEFORE_SHA: ${{ github.event.before }}, CURRENT_SHA: ${{ github.sha }}, GITHUB_REPOSITORY: ${{ github.repository }}. Run: npx --yes tsx scripts/notify-feature-shipped.ts. In README.md, add RESEND_API_KEY to the GitHub Actions secrets table (or equivalent section) with description 'Resend API key — also needed in GitHub Actions secrets (in addition to Vercel) for the post-deploy feature-shipped notification'. Run actionlint to verify the updated workflow. Step 2 depends on Step 1.","files_to_create":[],"files_to_modify":[".github/workflows/cd.yml","README.md"],"test_file":"__tests__/scripts/notify-feature-shipped.test.ts","estimated_turns":8}
]
-->

- [ ] **Step 1: Write notify-feature-shipped script and Vitest tests** (~20 turns) — Create `scripts/notify-feature-shipped.ts` with exported `extractClosedIssueNumbers`, `findShippedFeatureIssues`, `sendShippedEmail`, and `main` functions; write `__tests__/scripts/notify-feature-shipped.test.ts` with stubbed `fetch` covering label filtering, email extraction, Resend payload shape, and error handling.
- [ ] **Step 2: Wire notification step into cd.yml and update README** (~8 turns) — Add a post-deploy step to `.github/workflows/cd.yml` gated on `push` event + successful deploy, injecting `RESEND_API_KEY` from secrets; update README to document the new required GitHub Actions secret. Step 2 depends on Step 1.

## Design decisions

**Script in `scripts/` vs. new Next.js API route.** A `scripts/` file was chosen because this is a CI pipeline operation, not a user-triggered request. An API route would require the deployed app to HTTP-call itself from the workflow, adding an unnecessary round-trip and a self-dependency between the deploying code and the running app. The script runs directly in the GitHub Actions runner where all required secrets are already available.

**Commit-range approach vs. recently-closed issues polling.** Using GitHub's compare API (`/compare/{before}...{sha}`) over the exact SHA range is deterministic — it identifies precisely which PRs were merged in this deploy, regardless of timing. Polling for `user-requested` issues closed within the last N minutes is racy: two back-to-back deploys could double-notify or a slow deploy could miss issues.

**`npx --yes tsx` vs. compiling to plain JS.** The codebase is entirely TypeScript; keeping the script in TypeScript is consistent. `tsx` runs TypeScript directly without a build step and is downloaded on-demand by `npx` in ~3–5 seconds. No permanent tooling change is needed. A `.mjs` alternative would work but would be the only JavaScript file in an otherwise all-TypeScript codebase.

**Parsing email from the GitHub issue body vs. storing in a new database table.** The submitter's email is already embedded in every `user-requested` issue as `**Submitted by:** email@example.com` by the existing `/api/feature-request` route. The GitHub issue is the established source of truth for feature requests. Adding a `feature_requests` Supabase table solely to mirror data already in GitHub would be overengineering.

**`RESEND_API_KEY` as a new GitHub Actions secret.** The key already exists in the Vercel environment (used by `/api/invite`). Adding it to GitHub repo secrets is a one-time, low-effort setup. The alternative — calling a deployed API endpoint from `cd.yml` to send the email — reintroduces the self-dependency problem ruled out above.

## Acceptance criteria

- [ ] `extractClosedIssueNumbers` returns `[42]` when given a PR body containing `Closes #42`
- [ ] `extractClosedIssueNumbers` returns multiple numbers from a body with both `Closes #5` and `closes #12`
- [ ] `findShippedFeatureIssues` returns an empty array when the compared commit range contains no PRs that reference `user-requested` issues
- [ ] `findShippedFeatureIssues` skips issues that do not have the `user-requested` label (verified by mocking the GitHub issues API to return a different label)
- [ ] `findShippedFeatureIssues` skips issues where the body contains `**Submitted by:** unknown`
- [ ] `findShippedFeatureIssues` returns `{ email: 'user@example.com', title: '[Feature Request] Dark mode', ... }` for a qualifying issue
- [ ] `sendShippedEmail` calls `POST https://api.resend.com/emails` with `to` matching the submitter's address, `subject` containing `"shipped"`, and `html` containing the feature title with `[Feature Request] ` stripped
- [ ] `sendShippedEmail` includes a link to `https://applytrackr.app` in the generated HTML
- [ ] `sendShippedEmail` logs an error and does not throw when Resend returns a non-2xx response

## Human verification steps

- Submit a feature request from a real account, implement it on a branch, merge the PR to `main`, and confirm that a notification email arrives at the submitter's address from `noreply@applytrackr.app` referencing the correct feature title.
- Confirm the email subject contains `"shipped"` and the body includes a working link back to `https://applytrackr.app`.

## Open questions

None.
