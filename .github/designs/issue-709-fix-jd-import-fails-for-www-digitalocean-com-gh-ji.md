_Design for feature request #709: fix: JD import fails for www.digitalocean.com (?gh_jid=)_

# Design Proposal: JD import fails for www.digitalocean.com (?gh_jid=) (#709)

## What the user wants

Importing a DigitalOcean job URL like `https://www.digitalocean.com/careers/position/apply?gh_jid=7975125&gh_src=312a08e31us` currently returns nothing useful. The user wants it to return the job title, company, location, and description — the same structured content the existing Greenhouse integration returns for other employers.

## Proposed implementation

Add a pre-fetch handler in `app/api/fetch-job-description/route.ts` immediately after the Pinterest handler, following the identical Coupang/Pinterest pattern: detect `hostname === 'www.digitalocean.com'` and a non-null `?gh_jid=` query parameter, hardcode the Greenhouse board slug `digitalocean98`, and call `fetchGreenhouseJob('digitalocean98', ghJid, controller.signal)` before the HTML fetch. On success return the structured response; on non-2xx or network error fall through to HTML scraping. Save a real API fixture from `boards-api.greenhouse.io/v1/boards/digitalocean98/jobs/7975125` and write 4 tagged unit tests.

**Verification of the Greenhouse API:** `curl -s "https://boards-api.greenhouse.io/v1/boards/digitalocean98/jobs/7975125"` returns HTTP 200 with `title: "Principal Software Engineer"`, `company_name: "DigitalOcean"`, `location.name: "Seattle"`, and `content` (double-HTML-entity-encoded, per the standard Greenhouse pattern). The board slug `digitalocean98` is confirmed correct.

**Why pre-fetch (not post-fetch):** The `www.digitalocean.com/careers/position/apply` page is a Next.js SPA that loads the Greenhouse job board widget client-side. The server-rendered HTML shell contains no `greenhouse.io/embed/job_board/js?for=...` script tag, so the post-fetch embed-board handler cannot extract the board slug. The board slug `digitalocean98` was found in the page's webpack JS bundle at `/_next/static/chunks/app/careers/position/apply/page-*.js`. Hardcoding it in a pre-fetch handler (same as Coupang/Pinterest) is the right approach.

### Files to modify or create

- **`__tests__/fixtures/greenhouse-digitalocean-job.json`** — new fixture; real JSON response from `boards-api.greenhouse.io/v1/boards/digitalocean98/jobs/7975125` (fetched via curl; already verified returning HTTP 200)
- **`app/api/fetch-job-description/route.ts`** — add one handler block (~10 lines) after the Pinterest handler (line 1088); no changes to any existing function
- **`__tests__/api/fetch-job-description.test.ts`** — add one new `describe` block with 4 tagged unit tests; add one `import` for the new fixture
- **`app/api/fetch-job-description/CLAUDE.md`** — add DigitalOcean row to the ATS integrations table

### UI changes

None. This is a server-side JD import handler; no user-visible UI changes are required. When the import succeeds, the existing UI already displays the title, company, location, and description returned by the API.

## Implementation plan

<!-- implementation-plan-json
[
  {
    "id": 1,
    "title": "Add DigitalOcean Greenhouse pre-fetch handler + fixture + tests",
    "scope": "1) Save real API response to __tests__/fixtures/greenhouse-digitalocean-job.json. 2) In route.ts, add the handler block after the Pinterest block (after line 1088): detect hostname==='www.digitalocean.com' && parsed.searchParams.get('gh_jid'), call fetchGreenhouseJob('digitalocean98', ghJid, controller.signal), return on success, fall through on failure. 3) In the test file, add import for the new fixture and a describe block 'DigitalOcean careers (www.digitalocean.com, Greenhouse-backed, board \"digitalocean98\")' with 4 tests tagged [AC-709-1] through [AC-709-4]. 4) Update app/api/fetch-job-description/CLAUDE.md ATS table with the new DigitalOcean row.",
    "files_to_create": ["__tests__/fixtures/greenhouse-digitalocean-job.json"],
    "files_to_modify": [
      "app/api/fetch-job-description/route.ts",
      "__tests__/api/fetch-job-description.test.ts",
      "app/api/fetch-job-description/CLAUDE.md"
    ],
    "test_file": "__tests__/api/fetch-job-description.test.ts",
    "estimated_turns": 15,
    "ac_items": [1, 2, 3, 4]
  }
]
-->

- [ ] **Step 1: Add DigitalOcean Greenhouse pre-fetch handler + fixture + tests** (~15 turns) — Save the real Greenhouse API fixture, add the handler block in route.ts following the Coupang/Pinterest pattern, and write 4 unit tests tagged [AC-709-1] through [AC-709-4].

## Design decisions

**Pre-fetch handler (not post-fetch).** The post-fetch embed-board handler (lines 1256–1270) works by finding `greenhouse.io/embed/job_board/js?for={board}` in the fetched HTML. DigitalOcean's career page loads that script client-side so it is absent from the server-rendered HTML. The only reliable option is a pre-fetch handler with a hardcoded board slug. This matches the existing Coupang and Pinterest handlers exactly. Alternative considered: fetching the webpack JS bundle to extract the board slug dynamically — rejected because it requires an additional HTTP round-trip, is brittle against bundle filename changes, and adds complexity for a one-line constant.

**Hostname restricted to `www.digitalocean.com` only (no bare `digitalocean.com`).** The DigitalOcean careers URL always uses `www.`. Unlike Coupang and Pinterest (where both `www.` and bare hostnames appear in real user URLs), there is no evidence of `digitalocean.com/careers` links in the wild. A bare-hostname check would never fire and could theoretically intercept unrelated `digitalocean.com` URLs that happen to have a `?gh_jid=` parameter. Keeping the match tight follows the principle of least surprise.

**Board slug `digitalocean98` hardcoded.** The slug was confirmed by fetching `https://boards-api.greenhouse.io/v1/boards/digitalocean98/jobs/7975125` — HTTP 200. Dynamic extraction from the JS bundle is fragile and unnecessary since Greenhouse board slugs are stable identifiers that rarely change.

## Acceptance criteria

- [ ] **1.** Importing `https://www.digitalocean.com/careers/position/apply?gh_jid=7975125` returns HTML containing the job title "Principal Software Engineer", company "DigitalOcean", location "Seattle", and a non-empty description body
- [ ] **2.** When the Greenhouse API returns a non-2xx status code for a DigitalOcean URL, the handler falls back to HTML scraping (fetch is called twice: once for the Greenhouse API, once for the page HTML)
- [ ] **3.** When the Greenhouse API throws a network error for a DigitalOcean URL, the handler falls back to HTML scraping (page HTML fetch still succeeds and its content is returned)
- [ ] **4.** A DigitalOcean URL without the `gh_jid` query parameter does not trigger the Greenhouse API call (only the page HTML fetch is made)

## Human verification steps

- [ ] Manually import `https://www.digitalocean.com/careers/position/apply?gh_jid=7975125&gh_src=312a08e31us` in the live app at https://applytrackr.app and verify the imported fields show "Principal Software Engineer", "DigitalOcean", "Seattle", and a full job description. (Job posting may go stale; if it does, pick any current DigitalOcean job with a `?gh_jid=` parameter and verify the same fields are populated.)

## Open questions

None.
