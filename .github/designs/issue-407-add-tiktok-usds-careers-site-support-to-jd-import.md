_Design for feature request #407: Add TikTok USDS careers site support to JD import_

# Design: Add TikTok USDS careers site support to JD import

## What the user wants

The user wants to paste a `careers.tiktokusds.com/usds/position/{id}/detail` URL into the job tracker and have the job description automatically imported. Currently the route fetches the page, gets ~371 KB of JavaScript-rendered SPA HTML containing no job content, runs `extractJobContent` on it, and returns garbage — typically the `Brand` JSON-LD config blob or empty HTML. The user sees unusable content in the description field with no explanation.

## Proposed implementation

Add a post-fetch hostname guard in `route.ts` that fires after `extractGenericJobPostingFromPage` (the existing generic JSON-LD handler). If the hostname is `careers.tiktokusds.com` and no JSON-LD content was found, return HTTP 422 with a specific, actionable error message directing the user to copy-paste. Placing the guard after the generic JSON-LD handler means ByteDance adding a `JobPosting` JSON-LD block in the future would automatically resolve the error without any code change — consistent with the "Option C first, monitor for JSON-LD" recommendation.

No headless browser, no external services, no new dependencies. One guard, one error message, one set of tests.

### Files to modify or create

- **`app/api/fetch-job-description/route.ts`** — add a `careers.tiktokusds.com` hostname check immediately after the `extractGenericJobPostingFromPage` call; return HTTP 422 with a user-readable message if reached.
- **`__tests__/api/fetch-job-description.test.ts`** — add a `describe('TikTok USDS')` block with four test cases covering the 422 path, the JSON-LD bypass path, and the "non-USDS URLs unaffected" path.
- **`app/api/fetch-job-description/CLAUDE.md`** — add `careers.tiktokusds.com` to the ATS integrations table as "unsupported — JS-rendered, Stargate API blocked" with the gotcha notes.

### UI changes

No UI component changes. The existing `showImportError` handler in `ApplicationModal.tsx` (line 176) already surfaces `body.error` from a non-2xx response as a red banner. The new 422 response routes through this path; users see the error message as a toast/banner just like any other import failure. The message text is the only user-visible change.

## Implementation plan

<!-- implementation-plan-json
[
  {"id":1,"title":"Add TikTok USDS hostname guard and tests","scope":"In route.ts, add a check after extractGenericJobPostingFromPage: if parsed.hostname === 'careers.tiktokusds.com', return NextResponse.json({ error: '...' }, { status: 422 }). In the test file, add a describe('TikTok USDS') block with: (a) SPA shell HTML → fetch is called once, returns 422 with actionable message; (b) HTML containing a JobPosting JSON-LD → returns 200 with extracted content (generic handler bypasses the guard); (c) non-USDS URL → unaffected, guard not reached. Update app/api/fetch-job-description/CLAUDE.md with the new unsupported-site entry.","files_to_create":[],"files_to_modify":["app/api/fetch-job-description/route.ts","__tests__/api/fetch-job-description.test.ts","app/api/fetch-job-description/CLAUDE.md"],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":12,"ac_items":[1,2,3,4]}
]
-->

- [ ] **Step 1: Add TikTok USDS hostname guard and tests** (~12 turns) — Add a `careers.tiktokusds.com` post-fetch guard in `route.ts` that returns HTTP 422 with a user-readable message; add test cases verifying the 422 path, the JSON-LD bypass, and non-USDS unaffected; update the CLAUDE.md ATS table.

## Design decisions

**Post-fetch detection, not pre-fetch:** The guard is placed after `extractGenericJobPostingFromPage`, not before the HTTP fetch. This means the route still fetches the page and runs the generic JSON-LD handler on every attempt. The cost is one extra HTTP request (≈ 500 ms) per failed import — acceptable since users encounter this at most a few times before learning to copy-paste. The benefit is that if ByteDance adds a `JobPosting` JSON-LD block, the generic handler picks it up automatically with no code change. Pre-fetch detection would be faster but would require a deliberate code change to start working when the site improves.

**HTTP 422 Unprocessable Entity, not 200 with fallback content:** The previous behavior returned HTTP 200 with `extractJobContent(raw)` — which produced JavaScript config text and config JSON as "job description." Returning 422 with an error message is strictly better: the user knows import failed rather than seeing silently wrong content. The existing client already handles non-2xx responses with `showImportError(body.error)`.

**No fixture file:** Unlike ATS extractors, this handler returns an error — there is no data to extract and no fixture needed. Test cases use inline minimal SPA HTML (a `<head>` with the Brand JSON-LD and a bare `<div id="root"></div>` body) which is sufficient to verify that no job content is found and the guard fires. Committing a 371 KB fixture of a page we deliberately don't parse would be noise.

**Hostname-only check (not path pattern):** The guard checks `parsed.hostname === 'careers.tiktokusds.com'` without inspecting the path. All URLs on this hostname are JS-rendered by the same SPA with the same Stargate-gated API; the issue is the platform, not the path. A path pattern like `/usds/position/\d+/detail` would provide false precision (an unreachable list page also can't be scraped) while adding regex maintenance overhead.

## Acceptance criteria

- [ ] **1.** Submitting `https://careers.tiktokusds.com/usds/position/7629863744949815557/detail` via the import button shows an error banner (not a description field population) containing the phrase "copy and paste" or "manually".
- [ ] **2.** The API returns HTTP 422 (not 200 or 502) for any `careers.tiktokusds.com` URL when the fetched HTML contains no `JobPosting` JSON-LD block.
- [ ] **3.** When the fetched `careers.tiktokusds.com` HTML does contain a valid `JobPosting` JSON-LD block, the API returns HTTP 200 with the extracted job description (the generic JSON-LD handler fires before the guard).
- [ ] **4.** A non-USDS URL (e.g. `https://boards.greenhouse.io/acme/jobs/123`) is unaffected — the guard does not trigger and the existing handler returns 200 as before.

## Human verification steps

- Submit `https://careers.tiktokusds.com/usds/position/7629863744949815557/detail` in the import dialog on the live site and confirm the error banner appears with an actionable message. (The live job posting may expire; substitute any current `careers.tiktokusds.com/usds/position/{id}/detail` URL.)

## Open questions

None. All questions from the original request were resolved by investigation:

- **Vercel `maxDuration`:** `vercel.json` currently contains only `{"ignoreCommand":"exit 0"}` — no `maxDuration` is set and none is needed because this design adds no headless-browser path.
- **19-digit position ID stability:** The ID `7629863744949815557` in the URL is ByteDance's internal Hire platform ID. The URL pattern `careers.tiktokusds.com/usds/position/{id}/detail` is confirmed stable (the same ID appears in both the USDS site and lifeattiktok.com without modification). The guard checks the hostname only and does not depend on the ID format.
- **API accessibility:** Directly confirmed via `curl`: `GET /api/v1/usds/position/detail/?position_id={id}` returns `{"error":{"code":4022,...}}` (Stargate gateway block). No unauthenticated server-side data path exists.
- **lifeattiktok.com for the same job:** Confirmed — the RSC flight data contains the job title in `<title>` and `<meta name="description">` but renders a "not-found" component as the page body. The full description is not available via this route for USDS jobs.
