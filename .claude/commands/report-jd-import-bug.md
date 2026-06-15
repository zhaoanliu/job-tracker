Investigate a failing JD URL import, open a GitHub issue with the full root cause, then implement and ship the fix — all in one session, no confirmation prompts.

Usage: /report-jd-import-bug [URL]

## Step 1 — get the URL

Parse $ARGUMENTS. If a URL is provided, use it. If not, ask: "What is the URL that failed to import?"

## Step 2 — investigate first (before creating the issue)

Run all three in parallel:

1. **Fetch the failing URL** — `curl -s -L --max-time 10 "<url>"` and inspect the output. Look for:
   - `<script type="application/ld+json">` JobPosting blocks
   - ATS markers in HTML or query params: `gh_jid`, `ashby_jid`, `greenhouse.io/embed/job_board/js?for=`, `lever.co`, `myworkdayjobs.com`, `jobs.ashbyhq.com/{slug}/embed`, Workable widget
   - Whether job content is server-rendered or JS-rendered (page is a shell with no visible text)
   - Any `window.__` globals with embedded job data (`__NEXT_DATA__`, `__reactRouterContext`, `AF_initDataCallback`)
   - HTTP 403 / Cloudflare block (look for "Cloudflare" or "Access denied" in response)
   - If Cloudflare-blocked, check whether the Greenhouse API returns data directly: `curl https://boards-api.greenhouse.io/v1/boards/<slug>/jobs/<id>`

2. **Read the existing handler list** — read `app/api/fetch-job-description/route.ts` in full. Identify:
   - Which handlers exist and what URL patterns they match
   - Exactly why none fire for this URL (wrong hostname, missing query param, different path shape, post-fetch-only handler blocked by Cloudflare)
   - The closest existing handler to use as a template

3. **Check the ATS integration doc** — read `app/api/fetch-job-description/CLAUDE.md` if it exists for the list of already-supported sites and known gotchas.

## Step 3 — output findings to console, then create the GitHub issue

Print the investigation summary to the console first so the user can see it.

Then build the issue body. Use whatever section headings best fit the situation — past issues have used `## Bug`, `## Problem`, `## URL`, `## What fails`, `## Why it fails`, `## Root cause`, `## Current behavior`, `## Fix`. The required content is:

- **The failing URL** (always first)
- **Why no existing handler fires** (exact reason: wrong hostname / missing param / path mismatch / Cloudflare block)
- **What the fix approach is** (which handler pattern to add, which existing helper to reuse, or what new extractor to write)
- **Verified API endpoint** (if you confirmed a public API works during investigation, include the URL and the fact that it returns 200 — same as #457 and #574 did)

Extract the hostname and any distinctive URL pattern (e.g. `?gh_jid=`, `/jobs/listing/`, `/career-openings/`).

Build the title:
- Default: `fix: JD import fails for <hostname>`
- If there is a distinctive query param or path pattern: `fix: JD import fails for <hostname> (<pattern>)`

Create the issue with **both** `bug` and `status: in progress` labels — `status: in progress` prevents the auto-fix bot from opening a duplicate PR (`bug-fix.yml` fires on the `bug` label but skips if `status: in progress` is already present):

```
gh issue create \
  --title "<title>" \
  --label "bug" \
  --label "status: in progress" \
  --body "<full body with root cause and fix sections>"
```

Capture the issue number from the URL printed to stdout.

## Step 4 — implement (proceed immediately, no confirmation needed)

1. **Create a worktree** based on `origin/main`:
   ```
   git worktree add ../job-tracker-<N> -b fix/issue-<N>-jd-import-<hostname-slug> origin/main
   ```
   Do all subsequent file edits inside that worktree directory.

2. **Implement the fix** in `app/api/fetch-job-description/route.ts` following the same pattern as the closest existing handler. Also update `app/api/fetch-job-description/CLAUDE.md` to add a row for the new site.

3. **Add tests** in `__tests__/api/fetch-job-description.test.ts` following the existing fixture pattern. Add a fixture file under `__tests__/fixtures/` if needed (name it `<ats>-<company>-job.json` or `<hostname>-job.html` to match existing conventions).

4. **Run coverage from inside the worktree** — use a subshell so the npm command runs from the worktree directory:
   ```
   (cd /abs/path/to/job-tracker-<N> && npm run test:coverage)
   ```
   Fix any failures before committing.

5. **Commit** using `git -C` (never `cd && git`):
   ```
   git -C ../job-tracker-<N> add <changed files>
   git -C ../job-tracker-<N> commit -m "fix: JD import fails for <hostname> (<pattern>) (#<N>)

   Closes #<N>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
   ```

6. **Push and open PR:**
   ```
   git -C ../job-tracker-<N> push -u origin fix/issue-<N>-jd-import-<hostname-slug>
   gh pr create \
     --title "fix: JD import fails for <hostname> (<pattern>) (#<N>)" \
     --base main \
     --head fix/issue-<N>-jd-import-<hostname-slug> \
     --body "..."
   ```
   PR body must include `Closes #<N>` and a summary of root cause and fix.
