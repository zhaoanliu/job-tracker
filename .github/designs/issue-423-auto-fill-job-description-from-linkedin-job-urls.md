_Design for feature request #423: [Feature Request] Auto-fill job description from LinkedIn job URLs_

# Auto-fill job description from LinkedIn job URLs

## What the user wants

When a user pastes a LinkedIn job URL (e.g. `https://www.linkedin.com/jobs/view/4415502323`) into the "Import from URL" flow in the application modal, the imported HTML should contain a clean structured header (title, company, location, employment type, plus the description body) — the same way Greenhouse, Lever, Eightfold, Workday, Uber, and Expedia URLs are already handled. Today, LinkedIn URLs fall through to the generic `extractJobContent` HTML scraper, which captures sidebar / nav / "people you may know" noise because the canonical page is largely a JS-rendered authentication gate.

No ambiguity to flag. The user explicitly listed the fields they care about (title, company, location, employment type, description); LinkedIn also exposes Seniority level, Job function, and Industries on the same endpoint and the design includes those because they're free of cost and useful — the user can delete any row they don't want in the editor.

## Proposed implementation

Detect LinkedIn job URLs by hostname + path/query, extract the numeric job ID, and call LinkedIn's public unauthenticated guest endpoint `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id}` which returns a stable, structured HTML fragment with all the fields the user wants — no JS rendering or auth needed. Add a `parseLinkedInJob(html)` helper that regex-extracts the title, company, location, criteria rows, and `show-more-less-html__markup` description block, then builds the same `<h1>{title}</h1><table>…</table><hr>{body}` shape used by the existing ATS handlers. Falls through to the existing scraping pipeline on any parse failure, exactly like the other ATS blocks.

### Files to modify or create

- `app/api/fetch-job-description/route.ts` — add `extractLinkedInJobId(parsed)`, `buildLinkedInMeta(...)`, `parseLinkedInJob(html)`, and `fetchLinkedInJob(jobId, signal)` helpers; add the LinkedIn handler block before the generic HTML fetch (alongside the Eightfold/Lever/Greenhouse blocks). Falls through to scraping on any failure.
- `__tests__/fixtures/linkedin-jobs-guest.html` — raw HTML response captured from `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4415502323` (the URL the user supplied). Committed verbatim; this is the ground truth the tests assert against.
- `__tests__/api/fetch-job-description.test.ts` — add a `describe('LinkedIn ATS (linkedin.com/jobs/view + currentJobId)')` block that loads the fixture via `fs.readFileSync`, mocks fetch to return it for the guest URL, and asserts each metadata row + description content. Covers happy path, the four supported URL forms, the missing-description fallback, the non-2xx API fallback, and a non-matching URL.
- `README.md` — extend the ATS list to mention LinkedIn.
- `CLAUDE.md` — add a LinkedIn row to the "ATS integrations already implemented" table, and a LinkedIn entry to "ATS-specific gotchas learned" capturing the guest-endpoint trick + the HTML-not-JSON fixture format.

### UI changes

No new UI surface. The feature is complete without one because LinkedIn URLs are already a valid input to the existing "Import from URL" textbox in `components/modals/ApplicationModal.tsx` — the user already pastes the URL and clicks Import today; this change only affects what HTML the API returns. The cleaned-up output appears in the same description editor users see for every other ATS, so no new affordance is needed.

## Implementation plan

<!-- implementation-plan-json
[
  {"id":1,"title":"Capture LinkedIn guest fixture and add route + tests","scope":"1) Run curl with the standard User-Agent against https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4415502323 and save the response verbatim to __tests__/fixtures/linkedin-jobs-guest.html (no edits, no truncation). 2) In app/api/fetch-job-description/route.ts, add four helpers placed near the existing ATS helpers: extractLinkedInJobId(parsed) returning the numeric job ID for these URL shapes (a) www.linkedin.com/jobs/view/{id} (b) www.linkedin.com/jobs/view/{slug-with-dashes}-{id} (c) any www.linkedin.com path with a currentJobId query param such as /jobs/search/ or /jobs/collections/recommended/ (d) www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id} — accept linkedin.com and www.linkedin.com; buildLinkedInMeta(fields) building the standard <h1>/<table>/<hr> header with rows in order: Company, Location, Posted, Seniority level, Employment type, Job function, Industries (skip any row whose value is empty); parseLinkedInJob(html) returning meta+description-or-null using regexes against the guest HTML (title from h2.top-card-layout__title or .topcard__title, company from a.topcard__org-name-link, location from the second span.topcard__flavor inside div.topcard__flavor-row, posted-time from span.posted-time-ago__text, the four criteria values from li.description__job-criteria-item by matching their h3 subheader text, description body from div.show-more-less-html__markup with surrounding wrapper tags stripped); fetchLinkedInJob(jobId, signal) calling the guest endpoint with the existing USER_AGENT and 10s timeout, returning parseLinkedInJob output or null on any non-2xx / non-text response / parse failure. 3) Wire the handler into the POST handler before the main page fetch: const linkedInJobId = extractLinkedInJobId(parsed); if (linkedInJobId) { const liHtml = await fetchLinkedInJob(linkedInJobId, controller.signal); if (liHtml !== null) return NextResponse.json({ html: liHtml }); } — falls through to the existing generic fetch on any failure. 4) Add the LinkedIn test block to __tests__/api/fetch-job-description.test.ts: import the fixture via readFileSync, write a fetchMock that returns it for the jobs-guest URL and a fallback HTML page for anything else, assert title/company/location/employment-type/description-content on the happy path, then add tests for each of the four URL shapes routing to the same fetch, a non-2xx response falling back to extractJobContent, a missing-description-div fallback, and a non-LinkedIn URL not triggering the handler. Tests must import the fixture file — never inline HTML literals.","files_to_create":["__tests__/fixtures/linkedin-jobs-guest.html"],"files_to_modify":["app/api/fetch-job-description/route.ts","__tests__/api/fetch-job-description.test.ts"],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":22},
  {"id":2,"title":"Update README and CLAUDE.md with LinkedIn ATS entry","scope":"Update README.md to mention LinkedIn alongside the other supported ATS sources in the Import-from-URL feature description. Update CLAUDE.md in two places: (1) add a LinkedIn row to the 'ATS integrations already implemented' table — URL pattern column: 'www.linkedin.com/jobs/view/{id}, /jobs/view/{slug-id}, or any path with ?currentJobId={id}'; data source: 'linkedin.com/jobs-guest/jobs/api/jobPosting/{id} (HTML fragment, no auth)'; fixture: 'linkedin-jobs-guest.html'. (2) Add a LinkedIn bullet under 'ATS-specific gotchas learned' covering: canonical page URL is JS-rendered and effectively auth-gated when fetched server-side (no JSON-LD); the guest endpoint returns clean structured HTML with no auth; the fixture is .html (not .json) loaded via fs.readFileSync — distinct from every other ATS which uses JSON fixtures; currentJobId query-param URLs (jobs/search, jobs/collections/recommended) all resolve to the same guest endpoint via the same numeric ID. Step 2 depends on Step 1.","files_to_create":[],"files_to_modify":["README.md","CLAUDE.md"],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":6}
]
-->

- [ ] **Step 1: Capture LinkedIn guest fixture and add route + tests** (~22 turns) — Capture the guest-endpoint HTML to `__tests__/fixtures/linkedin-jobs-guest.html`, add `extractLinkedInJobId` / `buildLinkedInMeta` / `parseLinkedInJob` / `fetchLinkedInJob` helpers and wire them into the POST handler, and add a LinkedIn `describe` block to the route tests that asserts every metadata row and the description content against the real fixture.
- [ ] **Step 2: Update README and CLAUDE.md with LinkedIn ATS entry** (~6 turns) — Mention LinkedIn in the README's Import-from-URL feature description and add LinkedIn rows to the ATS table + gotchas section in CLAUDE.md. Depends on Step 1.

## Design decisions

**Use the `jobs-guest/jobs/api/jobPosting/{id}` endpoint instead of scraping `linkedin.com/jobs/view/{id}` directly.**
(a) The handler calls a separate dedicated guest endpoint that returns a structured HTML fragment with no auth.
(b) Alternative considered: scraping the canonical `/jobs/view/{id}` page (the URL the user actually pastes). Rejected because that page returns a 200 with `<title>` set but no `<script type="application/ld+json">`, no description in the static HTML, and no useable structured data — the real content is rendered client-side after an auth gate. JSON-LD-based approaches like the Workday/Uber/Expedia handlers therefore can't work on LinkedIn.
(c) Better here because: server-side reachability is verified (`curl` returns 200 with the full description in ~26 KB of HTML for the test URL), the markup is stable LinkedIn-controlled CSS class names that have been unchanged for years, and the fields exposed (title, company, location, four criteria items, description, posted time) are exactly the set the user asked for.

**Store the fixture as raw HTML (`.html`) instead of a parsed JSON snapshot.**
(a) Commit the verbatim response body and load it in tests via `fs.readFileSync` rather than pre-parsing into a JSON shape.
(b) Alternative considered: parse fields out of the response and commit them as `linkedin-job.json` to match the other six fixtures. Rejected because the parser is the thing under test — committing the post-parsed JSON would mean the tests verify shapes we invented, not shapes LinkedIn actually returns (the same problem CLAUDE.md flags for invented fixture data).
(c) Better here because: the parser is regex-based against real CSS classes — the only way the tests give real coverage is if they consume the real HTML. The cost is one extra import style in the test file, which is a deliberate signal that LinkedIn is the only HTML-fragment ATS.

**Put the helpers inside `route.ts` rather than splitting into `lib/`.**
(a) Helpers live next to the other ATS helpers in `route.ts` and tests exercise them via the `POST` handler.
(b) Alternative considered: a `lib/linkedin.ts` with directly-importable functions. Rejected because every existing ATS handler (Greenhouse, Lever, Eightfold, Workday, Uber, Expedia) lives in `route.ts` and is exercised through `POST` in tests — splitting LinkedIn out would be the odd one and break the established convention. The Next.js route-export constraint doesn't bite here because nothing needs to be exported from the route file; the helpers are file-local.
(c) Better here because consistency with five sibling integrations beats a marginal testability win — and we'd reach the same coverage either way.

**Include the four "criteria" rows (Seniority level, Employment type, Job function, Industries) in the metadata header even though the user only listed Employment type.**
(a) Render all four rows by default; users can delete any they don't want in the description editor.
(b) Alternative considered: render only the four fields the user explicitly named (title, company, location, employment type). Rejected because the guest endpoint returns all four criteria items in the same HTML block; extracting them is the same code path; rows with empty values are already filtered out by the same skip-if-empty rule the other ATS handlers use; and Seniority level / Job function are useful filtering signals when reviewing applications later.
(c) Better here because the marginal complexity is zero (already in the response, already filterable) and the rows are easy for the user to delete if unwanted, but impossible to retrieve later if not captured.

## Acceptance criteria

- [ ] User pastes `https://www.linkedin.com/jobs/view/4415502323` into the "Import from URL" textbox in the application modal, clicks Import, and sees the description editor populated with a `<h1>` job title followed by a metadata table containing Company / Location / Employment type rows, followed by the cleaned LinkedIn job description body — with **no** "People you may know", navigation, or LinkedIn footer noise.
- [ ] User pastes a `linkedin.com/jobs/view/{slug-with-dashes}-{id}` URL (the format LinkedIn generates when sharing) and gets the same clean import behaviour.
- [ ] User pastes a `linkedin.com/jobs/collections/recommended/?currentJobId={id}` URL (the format that appears when navigating LinkedIn's job feed) and gets the same clean import behaviour.
- [ ] User pastes a LinkedIn URL for an expired or invalid job ID (404 from the guest endpoint) and the import does not fail with a 500 — instead it falls back to the existing generic scrape behaviour (so the user sees whatever the canonical page returns, just like today).
- [ ] `npm test` passes including the new LinkedIn `describe` block.
- [ ] `npm run test:coverage` continues to pass coverage thresholds.
- [ ] `README.md` and `CLAUDE.md` mention LinkedIn in their ATS sections.

## Open questions

None.
