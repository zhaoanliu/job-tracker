_Design for feature request #502: Add Gem.com job board support to JD import_

# Add Gem.com job board support to JD import

## What the user wants

When a user pastes a `https://jobs.gem.com/{company}/{ext-id}` URL into the JD import field, the auto-fill should populate the description with the job's title, location, team/department, employment type, and the full description body — the same experience users already get with Greenhouse, Lever, Ashby, etc. Today the import silently returns nothing useful because the page is a JS-rendered SPA and the generic fallback finds no job content.

The request is unambiguous. The user has already identified the public GraphQL endpoint that backs the SPA and supplied the exact query. Investigation confirmed: `curl` to the endpoint returns the verified fixture data with no auth, and the static page HTML is a 4 KB shell with zero `JobPosting`/`json-ld`/job-title content — so the GraphQL call is the only viable server-side data source.

## Proposed implementation

Add a Gem-specific handler to `app/api/fetch-job-description/route.ts` following the established ATS pattern (URL detect → POST GraphQL query → build metadata header → concatenate `descriptionHtml` + optional `compensationHtml` → return; fall through to HTML scraping on any failure). Detection matches `parsed.hostname === 'jobs.gem.com'` plus a pathname regex capturing the `boardId` and `extId` segments verbatim. Locations array, `job.employmentType`, `job.locationType`, `job.teamDisplayName`, and `job.department.name` map into rows in the standard `<table>` header.

### Files to modify or create

- `app/api/fetch-job-description/route.ts` — add `buildGemMeta()`, `fetchGemJob()`, and a detection block placed alongside the other ATS handlers (before the generic page fetch).
- `__tests__/api/fetch-job-description.test.ts` — add a `describe('Gem.com ATS')` block with the standard five-case coverage.
- `__tests__/fixtures/gem-auger-job.json` — committed snapshot of the real GraphQL response for `auger/am9icG9zdDqF9OtLq0iQ9-wa_O4b2WV2` (the full `{data:{oatsExternalJobPosting:{…}}}` envelope, captured with `curl` from the worktree).
- `app/api/fetch-job-description/CLAUDE.md` — add a row to the ATS integrations table and a Gem-specific gotchas bullet.

### UI changes

No new UI. The feature reuses the existing JD import field in `components/modals/ApplicationModal.tsx`: the user pastes a `jobs.gem.com/…` URL into the same auto-fill input they already use for every other ATS, the modal's auto-fill flow calls `POST /api/fetch-job-description`, and the returned HTML is rendered in the same description editor. No new buttons, fields, or states — just a previously-broken URL now returning real content.

## Implementation plan

<!-- implementation-plan-json
[
  {"id":1,"title":"Capture Gem fixture and implement route handler","scope":"Run curl against the Gem GraphQL endpoint with boardId=auger and extId=am9icG9zdDqF9OtLq0iQ9-wa_O4b2WV2, save the full {data:{oatsExternalJobPosting:{...}}} response to __tests__/fixtures/gem-auger-job.json. In app/api/fetch-job-description/route.ts add: (a) buildGemMeta(posting) emitting a <h1>title</h1><table>...</table><hr> header with rows for Company-when-derivable (skip — not in payload), Department (job.department.name), Team (job.teamDisplayName when distinct from department), Location (join locations[] by ' | ' using name; append ' (Remote)' if isRemote), Work type (humanise locationType: IN_OFFICE→'In office', REMOTE→'Remote', HYBRID→'Hybrid'), Employment type (humanise employmentType: FULL_TIME→'Full-time', PART_TIME→'Part-time', CONTRACT→'Contract', INTERNSHIP→'Internship', TEMPORARY→'Temporary'); (b) fetchGemJob(boardId, extId, signal) that POSTs the ExternalJobPostingQuery from issue #502 to https://jobs.gem.com/api/public/graphql with Content-Type application/json and the standard USER_AGENT, returns null on non-2xx / fetch throw / GraphQL errors[] present / missing oatsExternalJobPosting / empty descriptionHtml, else returns meta + descriptionHtml + (compensationHtml ?? ''); (c) a detection block placed alongside the other ATS handlers (before the generic page fetch) that matches parsed.hostname === 'jobs.gem.com' and parsed.pathname against /^\\/([A-Za-z0-9_-]+)\\/([A-Za-z0-9_=+-]+)$/, calls fetchGemJob with the captured groups, returns the HTML when non-null, and falls through to scraping on null.","files_to_create":["__tests__/fixtures/gem-auger-job.json"],"files_to_modify":["app/api/fetch-job-description/route.ts"],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":18},
  {"id":2,"title":"Add Gem unit tests and document the integration","scope":"In __tests__/api/fetch-job-description.test.ts add a describe('Gem.com ATS') block importing gemAugerJob from '../fixtures/gem-auger-job.json' with these cases (mocking global fetch and routing by URL): (1) happy path — POST to GEM_URL 'https://jobs.gem.com/auger/am9icG9zdDqF9OtLq0iQ9-wa_O4b2WV2', expect the GraphQL endpoint hit exactly once, response html contains '<h1>Principal Software Development Engineer</h1>', 'Bellevue', 'AI Enablement Engineering', 'Full-time', 'In office', and a snippet from the real descriptionHtml ('autonomous operating system for the supply chain'), plus the compensation block ('$280,000'); (2) non-2xx → falls back to extractJobContent of the page HTML; (3) GraphQL returns errors[] or null oatsExternalJobPosting → falls back; (4) empty descriptionHtml → falls back; (5) non-matching path (e.g. jobs.gem.com with only one path segment) → handler not triggered, fetch called once with the original URL; (6) Synthetic: multi-location posting — synthesise a posting with two locations and isRemote true on the second, assert both names appear joined by ' | ' and '(Remote)' is appended (mark with '// Synthetic:' comment since the real fixture has only one in-office location). Then update app/api/fetch-job-description/CLAUDE.md: add a Gem row to the ATS integrations table (URL pattern jobs.gem.com/{boardId}/{extId}; data source POST https://jobs.gem.com/api/public/graphql ExternalJobPostingQuery; fixture gem-auger-job.json) and a Gem gotchas bullet covering the descriptionHtml inline-style attributes (Quill editor output — passed through as-is, browser/sanitiser handles them), the extId being base64url and passed verbatim (no decoding), compensationHtml being a separate field appended to the description when present, and the requirement to check the GraphQL envelope's errors[] field since GraphQL APIs can return HTTP 200 with an errors[] payload.","files_to_create":[],"files_to_modify":["__tests__/api/fetch-job-description.test.ts","app/api/fetch-job-description/CLAUDE.md"],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":15}
]
-->

- [ ] **Step 1: Capture Gem fixture and implement route handler** (~18 turns) — `curl` the real GraphQL response into `__tests__/fixtures/gem-auger-job.json`, then add `buildGemMeta()`, `fetchGemJob()`, and the `jobs.gem.com` detection block to `app/api/fetch-job-description/route.ts`.
- [ ] **Step 2: Add Gem unit tests and document the integration** (~15 turns) — add the five-case test suite (happy path, non-2xx fallback, GraphQL errors fallback, empty description fallback, non-matching URL) plus one synthetic multi-location test, and update `app/api/fetch-job-description/CLAUDE.md` (table row + gotchas). Depends on Step 1.

## Design decisions

- **Use the GraphQL endpoint, not HTML scraping.** Chosen: a single `POST` to `https://jobs.gem.com/api/public/graphql`. Alternative considered: parse the page HTML. Verified the page is a 4 KB SPA shell with no JSON-LD, no embedded job payload, no `<meta>` description with the job content — there is literally nothing to scrape. The GraphQL endpoint requires no auth (verified by direct `curl`) and returns structured fields that map 1:1 to the existing meta-builder pattern.

- **Use the exact `ExternalJobPostingQuery` from issue #502.** Chosen: copy the query verbatim from the SPA bundle the user reverse-engineered. Alternative considered: hand-write a smaller query selecting only the fields we display. Verbatim wins because (a) any field we drop today is one we'd have to add back later when we want to surface it, (b) introspection isn't exposed so we can't safely guess which fields are queryable, and (c) the response size is irrelevant — this is a server-side fetch with a 500 KB cap on the response.

- **Pass `extId` to the API verbatim, no base64 handling.** Chosen: URL-path-capture and forward unchanged. Alternative considered: decode the base64url and pass the inner ID. The user's investigation and my live `curl` both confirm the API accepts the base64url form as-is; decoding would risk a different ID format the API doesn't accept, and there's no reason to introspect Gem's internal ID scheme.

- **Append `compensationHtml` to the description rather than rendering it as a meta-table row.** Chosen: concatenate `descriptionHtml + (compensationHtml ?? '')`. Alternative considered: parse the salary range out of `compensationHtml` and put it in the metadata table. Compensation HTML is multi-paragraph prose (heading + benefits + range), not a single value — flattening it to a table row loses content. Appending preserves the full block in the description editor where it belongs.

- **Treat a GraphQL `200 OK` with non-empty `errors[]` as a failure.** Chosen: explicit check for `body.errors` or missing `body.data.oatsExternalJobPosting`, return `null` to fall through. Alternative considered: rely only on HTTP status. GraphQL APIs routinely return HTTP 200 with errors in the body — every other ATS handler in this file uses REST where non-2xx == failure, so this is a Gem-specific gotcha worth coding (and documenting).

- **Fixture is the full GraphQL envelope, not the inner posting object.** Chosen: save `{"data": {"oatsExternalJobPosting": {…}}}`. Alternative considered: save just the inner posting. The full envelope is what `await res.json()` actually returns, so the test exercises the same JSON shape the production code parses. This is the same principle behind the existing ATS fixtures (each is the literal API response).

## Acceptance criteria

- [ ] Posting `https://jobs.gem.com/auger/am9icG9zdDqF9OtLq0iQ9-wa_O4b2WV2` to `/api/fetch-job-description` (with `fetch` mocked to return the committed fixture) yields HTML that contains `<h1>Principal Software Development Engineer</h1>`, the location `Bellevue`, the department `AI Enablement Engineering`, the work type `In office`, the employment type `Full-time`, a snippet from the description (`autonomous operating system for the supply chain`), and the compensation snippet `$280,000`.
- [ ] The handler issues exactly one `fetch` call — to `https://jobs.gem.com/api/public/graphql` — and does not also fetch the original page URL on the happy path.
- [ ] When the GraphQL endpoint returns HTTP 500, the handler falls back to fetching the page URL and running `extractJobContent`, returning the scraped body.
- [ ] When the GraphQL endpoint returns HTTP 200 with `{"errors": [{"message": "…"}]}` and no `data`, the handler falls back to scraping.
- [ ] When the GraphQL endpoint returns HTTP 200 with `data.oatsExternalJobPosting.descriptionHtml === ''`, the handler falls back to scraping.
- [ ] A URL like `https://jobs.gem.com/auger` (one path segment) does NOT trigger the Gem handler — exactly one `fetch` call is made, to the original URL, and the response goes through `extractJobContent`.
- [ ] A synthetic posting with two locations (the second with `isRemote: true`) renders both names joined by ` | ` with `(Remote)` appended to the remote one.
- [ ] In the existing `ApplicationModal` UI on localhost:3000, pasting the Gem URL (with `fetch` intercepted via `page.route()` to serve the fixture) populates the description editor with the rendered HTML — verifying the route's response flows end-to-end into the UI surface without modal-level changes.

## Human verification steps

- [ ] On the live deployment, paste `https://jobs.gem.com/auger/am9icG9zdDqF9OtLq0iQ9-wa_O4b2WV2` into the JD import field and confirm the description editor populates with the Principal Software Development Engineer posting (title, location, department, compensation range) — confirming the public GraphQL endpoint is still reachable from Vercel's network and the URL/job still exists.
- [ ] Find a second live Gem-hosted job at a different company (e.g. via Google `site:jobs.gem.com`), paste its URL, and confirm import succeeds — sanity check that `boardId` extraction generalises beyond the `auger` example.

## Open questions

None.
