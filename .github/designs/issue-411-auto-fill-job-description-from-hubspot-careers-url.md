_Design for feature request #411: [Feature Request] Auto-fill job description from HubSpot careers URLs_

# Auto-fill job description from HubSpot careers URLs (#411)

## What the user wants

When a user pastes a HubSpot careers URL (e.g. `https://www.hubspot.com/careers/jobs/7621322`) into the "Import from URL" field in the application modal, the system should auto-fill the job title, location, company, and description — the same way Greenhouse, Lever, Workable, Eightfold, etc. URLs already do.

The user's premise that the HubSpot page is fully JavaScript-rendered is correct (the server-side HTML contains no JSON-LD `JobPosting` block and no embedded job payload), but investigation reveals that HubSpot's careers site is just **a Greenhouse career board with board slug `hubspotjobs`**. The fix is one new URL detection block that calls the existing `fetchGreenhouseJob` helper — no HTML parsing required.

## Proposed implementation

Add a new URL detection branch to `app/api/fetch-job-description/route.ts` that matches `hubspot.com/careers/jobs/{id}` (with or without `www.`, with optional trailing slash/query string) and delegates to the existing `fetchGreenhouseJob('hubspotjobs', id, signal)` helper. On API failure the handler falls through to the existing generic HTML scraping path, identical to every other Greenhouse-backed integration. No new helper functions, meta builders, or HTML parsers are needed — the Greenhouse JSON shape and metadata header are already wired up.

### Files to modify or create

- **`app/api/fetch-job-description/route.ts`** — add a new detection block matching HubSpot URLs and calling `fetchGreenhouseJob('hubspotjobs', jobId, controller.signal)`. Place it alongside the other "URL-based ATS detection before page fetch" handlers (after the existing `directGhMatch` block, before `linkedInMatch`) so we avoid an extra page-fetch round trip.
- **`__tests__/fixtures/hubspot-job.json`** — new fixture. Snapshot of `boards-api.greenhouse.io/v1/boards/hubspotjobs/jobs/7621322` (Principal Software Engineer, Security, Detection & Response — Remote USA). Standard Greenhouse response shape, ~13KB.
- **`__tests__/api/fetch-job-description.test.ts`** — add a new `describe('HubSpot careers (Greenhouse-backed)')` block with happy-path, fallback, and non-matching-URL tests that follow the Greenhouse-block patterns already in this file.
- **`app/api/fetch-job-description/CLAUDE.md`** — add a row to the "ATS integrations already implemented" table (HubSpot, `hubspot.com/careers/jobs/{id}`, board name `hubspotjobs`, fixture `hubspot-job.json`) and a gotcha note explaining that the board name is not present anywhere in the page HTML — it only appears in the minified careers JS bundle's "Apply via Greenhouse" sign-in link, so the slug is hardcoded as `hubspotjobs` rather than extracted at runtime.
- **`README.md`** — add HubSpot to the list of supported ATS URL formats in the "Import job descriptions" section if such a list exists; otherwise no README change needed.

### UI changes

None. The "Import from URL" textbox and button in `components/modals/ApplicationModal.tsx` already accept arbitrary URLs and POST to `/api/fetch-job-description`. The user-visible effect is solely behavioural: pasting a HubSpot URL now yields a populated description field where previously it returned scraped navigation chrome. The feature is complete without UI changes because URL detection is server-side and the integration is intentionally invisible — the user just pastes whatever URL their browser shows.

## Implementation plan

<!-- implementation-plan-json
[
  {"id":1,"title":"Capture HubSpot Greenhouse API fixture","scope":"Run `curl -s https://boards-api.greenhouse.io/v1/boards/hubspotjobs/jobs/7621322 > __tests__/fixtures/hubspot-job.json` from inside the worktree to save a real Greenhouse JSON response snapshot for use as a test fixture. The response shape matches existing Greenhouse fixtures (`title`, `company_name`, `location.name`, `content` with double-HTML-entity-encoded HTML). Do not hand-edit the file. If job 7621322 ever 404s, list jobs at `https://boards-api.greenhouse.io/v1/boards/hubspotjobs/jobs` and pick another active engineering posting. No code changes in this step.","files_to_create":["__tests__/fixtures/hubspot-job.json"],"files_to_modify":[],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":5},
  {"id":2,"title":"Add HubSpot URL detection in fetch-job-description route","scope":"In `app/api/fetch-job-description/route.ts`, add a new URL match block after the existing `directGhMatch` block and before `linkedInMatch`. Detect hostname === 'www.hubspot.com' OR hostname === 'hubspot.com' AND pathname matches /^\\/careers\\/jobs\\/(\\d+)\\/?$/. On match, call `fetchGreenhouseJob('hubspotjobs', jobId, controller.signal)`; if it returns non-null, return NextResponse.json({ html }); otherwise fall through to the generic page fetch + extractJobContent path. No new helpers, no new meta builder — reuse the existing fetchGreenhouseJob and buildGreenhouseMeta. Step 2 depends on Step 1 (the fixture must exist before tests in Step 3 can import it).","files_to_create":[],"files_to_modify":["app/api/fetch-job-description/route.ts"],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":10},
  {"id":3,"title":"Add HubSpot tests + update CLAUDE.md table","scope":"Add a `describe('HubSpot careers (Greenhouse-backed)')` block to `__tests__/api/fetch-job-description.test.ts` with these tests, all using `import hubspotJob from '../fixtures/hubspot-job.json'` and the existing `jsonResponse`/`htmlResponse`/`mockUser` helpers: (a) happy path — `https://www.hubspot.com/careers/jobs/7621322` calls only `boards-api.greenhouse.io/v1/boards/hubspotjobs/jobs/7621322` (fetch called once), and response HTML contains the real fixture title, `HubSpot`, location string, and a substring from the decoded content; (b) bare hostname — `https://hubspot.com/careers/jobs/7621322` matches identically; (c) trailing slash — `https://www.hubspot.com/careers/jobs/7621322/` matches; (d) API returns 404 → falls back to HTML scraping with a stub page returning `<p>Scraped JD</p>`; (e) API throws (network error) → falls back to HTML scraping; (f) non-matching URL (e.g. `https://www.hubspot.com/products`) → handler is not triggered (the Greenhouse API URL is never called). Also update `app/api/fetch-job-description/CLAUDE.md` to add HubSpot to the ATS table and a one-line gotcha noting the board slug `hubspotjobs` is hardcoded because it does not appear in the page HTML — only in the minified JS bundle. Step 3 depends on Steps 1 and 2.","files_to_create":[],"files_to_modify":["__tests__/api/fetch-job-description.test.ts","app/api/fetch-job-description/CLAUDE.md"],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":15}
]
-->

- [ ] **Step 1: Capture HubSpot Greenhouse API fixture** (~5 turns) — Save a real `boards-api.greenhouse.io/.../hubspotjobs/jobs/7621322` JSON response to `__tests__/fixtures/hubspot-job.json` via `curl`; no code changes.
- [ ] **Step 2: Add HubSpot URL detection in fetch-job-description route** (~10 turns) — In `route.ts`, add a regex match for `hubspot.com/careers/jobs/{id}` that delegates to the existing `fetchGreenhouseJob('hubspotjobs', id, signal)` helper, with fallthrough to HTML scraping on API failure. Depends on Step 1.
- [ ] **Step 3: Add HubSpot tests + update CLAUDE.md table** (~15 turns) — Add the HubSpot describe-block to the route's test file (happy path, www/bare/trailing-slash variants, 404 fallback, throw fallback, non-matching URL) using the real fixture, then add a row to the ATS table in the route's CLAUDE.md. Depends on Steps 1 and 2.

## Design decisions

**(a) Hardcode the Greenhouse board slug `hubspotjobs` rather than extract it from the page.**
Alternative considered: fetch the page HTML and look for a reference to the board (e.g. parse the `careers-directory.min.js` bundle for a sign-in link). Hardcoding is better here because (i) the board slug never appears in the page HTML — only inside a ~1MB minified JS bundle as part of `my.greenhouse.io/users/sign_in?job_board=hubspotjobs`, which is brittle to extract; (ii) HubSpot won't change its Greenhouse board name without changing every careers URL on its site; (iii) this matches how Workday tenants and Eightfold board slugs are NOT hardcoded only because they vary per company — HubSpot is a single-company ATS user, so there is no value in dynamic extraction; (iv) hardcoding avoids a wasted page-fetch round trip when the API URL is fully derivable from the input URL.

**(b) Place the handler before the page fetch, alongside Lever/Eightfold/direct-Greenhouse/Workable.**
Alternative considered: place it after the page fetch alongside the embed-board (`gh_jid`) handler, which also uses Greenhouse but requires the page HTML to discover the board name. The pre-fetch placement is better because the HubSpot URL alone fully determines the API URL — there is nothing to discover from the page, so fetching the page first is pure latency cost. This also matches the existing convention: handlers move to the post-fetch section only when they need to inspect the page to identify which API to call.

**(c) Reuse `fetchGreenhouseJob` rather than introduce a `fetchHubSpotJob` wrapper.**
Alternative considered: add a thin `fetchHubSpotJob(jobId, signal)` wrapper that hardcodes the board name. Direct reuse is better because (i) HubSpot is Greenhouse — there is no transformation specific to HubSpot's response, no special metadata fields, no HTML decoding quirks beyond what `fetchGreenhouseJob` already handles; (ii) adding a wrapper would imply HubSpot needs special treatment and invite future contributors to add HubSpot-specific logic in a place that should remain a passthrough; (iii) the call site stays self-documenting: `fetchGreenhouseJob('hubspotjobs', id, signal)` directly states "HubSpot's Greenhouse board is named hubspotjobs."

## Acceptance criteria

- [ ] User pastes `https://www.hubspot.com/careers/jobs/7621322` into the Import URL field of the application modal, clicks "Import", and sees the description textarea populated with a Greenhouse-style HTML block containing the real job title ("Principal Software Engineer, Security, Detection & Response"), `HubSpot` as the company, the location row, and the full job description body.
- [ ] User pastes the bare-hostname variant (`https://hubspot.com/careers/jobs/7621322`) and the trailing-slash variant (`https://www.hubspot.com/careers/jobs/7621322/`) — both succeed identically.
- [ ] When the Greenhouse API is temporarily unreachable (simulated via 404 in tests), the request still completes successfully by falling back to the generic HTML scraper, rather than returning an error to the user.
- [ ] Pasting a non-job HubSpot URL (e.g. `https://www.hubspot.com/products`) does not invoke the Greenhouse API and instead falls through to the generic HTML scraper unchanged.
- [ ] `npm run test:coverage` passes with no regression in coverage thresholds.
- [ ] `npm run lint` and `npx tsc --noEmit` pass.

## Open questions

None. The Greenhouse API was verified live (HTTP 200, `content` length 13013, 196 active postings on the `hubspotjobs` board), the URL pattern was verified for both `www.` and bare hostnames (both 200, both canonicalising to `www.hubspot.com/careers/jobs/{id}`), and the existing `fetchGreenhouseJob` helper already handles every quirk this integration needs (double-HTML-entity-decoded content, missing-content fallback, metadata header).
