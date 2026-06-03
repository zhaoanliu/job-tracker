_Design for feature request #522: fix: JD import fails for amperity.com/careers URLs (?gh_jid= with __NEXT_DATA__ embed)_

# Design: JD import for amperity.com/careers URLs (`?gh_jid=` + `__NEXT_DATA__` embed)

## What the user wants

When a user pastes a URL like `https://amperity.com/careers/7931915?gh_jid=7931915`, the JD import button should extract and display the job description. Today it returns nothing useful because the `?gh_jid=` handler only recognises Greenhouse embed script tags, and Amperity's Next.js SSG page does not include one. The fix is to add a fallback path that reads the job payload from the `<script id="__NEXT_DATA__">` block that Next.js bakes into every server-rendered page.

## Proposed implementation

Add a new helper `extractNextDataGreenhouseJob(html: string): string | null` in `route.ts` that regex-extracts the `__NEXT_DATA__` JSON, navigates to `props.pageProps.job`, and runs it through the existing `buildGreenhouseMeta` + `decodeHtmlEntities` pipeline already used by the other Greenhouse paths. Extend the existing `gh_jid` handler to call this helper after failing to find an embed script tag, so the URL falls through to generic HTML scraping only if the `__NEXT_DATA__` path also finds nothing.

**Path discrepancy vs. issue description**: The issue states `props.pageProps.data.job` but live investigation of the page HTML shows the job object is at `props.pageProps.job` — `data` is a sibling key (Contentful CMS content), not a parent. The implementation uses the observed path.

### Files to modify or create

- `__tests__/fixtures/amperity-nextdata-job.json` — **new** — minimal `__NEXT_DATA__` structure (`{ props: { pageProps: { job: { ... } } } }`) captured from the live page; ground truth for assertions.
- `app/api/fetch-job-description/route.ts` — **modify** — add `extractNextDataGreenhouseJob()` helper (non-exported); extend the `gh_jid` block (lines 988-996) to call it after the embed-script path yields nothing.
- `__tests__/api/fetch-job-description.test.ts` — **modify** — add a new `describe` block ("Greenhouse __NEXT_DATA__ embed") with required test cases.

### UI changes

No UI changes. The fix operates entirely in the API route; the user experience is that the JD import button populates the job description field where it previously returned nothing. No new UI states, no component changes.

## Implementation plan

<!-- implementation-plan-json
[
  {"id":1,"title":"Create __NEXT_DATA__ fixture file","scope":"Capture the minimal __NEXT_DATA__ JSON structure from the live Amperity page and save it as __tests__/fixtures/amperity-nextdata-job.json. The fixture must contain the full props.pageProps.job object (title, company_name, location, content) exactly as returned by the page. Commit this file before any test references it.","files_to_create":["__tests__/fixtures/amperity-nextdata-job.json"],"files_to_modify":[],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":10},
  {"id":2,"title":"Add extractNextDataGreenhouseJob helper + extend gh_jid handler + add tests","scope":"In route.ts, add non-exported function extractNextDataGreenhouseJob(html: string): string | null — regex-match <script id=\"__NEXT_DATA__\" type=\"application/json\">, JSON.parse, read props.pageProps.job, guard on typeof job.content === 'string', call buildGreenhouseMeta(job) + decodeHtmlEntities(job.content). Extend the gh_jid handler block (after line 995) to call this helper when the embed-script match is absent. In the test file, import the fixture and add a 'Greenhouse __NEXT_DATA__ embed' describe block with happy-path, missing-content, malformed-JSON, and non-matching-URL tests. Step 2 depends on Step 1 (fixture must exist).","files_to_create":[],"files_to_modify":["app/api/fetch-job-description/route.ts","__tests__/api/fetch-job-description.test.ts"],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":20}
]
-->

- [ ] **Step 1: Create `__NEXT_DATA__` fixture file** (~10 turns) — Fetch the live Amperity page and save the minimal `props.pageProps.job` structure as `__tests__/fixtures/amperity-nextdata-job.json`; commit before any test references it.
- [ ] **Step 2: Add `extractNextDataGreenhouseJob` helper + extend `gh_jid` handler + add tests** (~20 turns) — Implement the helper in `route.ts`, wire it into the `gh_jid` fallback, and add the `describe` block in the test file using the fixture from Step 1. (Depends on Step 1.)

## Design decisions

**Use `props.pageProps.job` not `props.pageProps.data.job`**: Live investigation of the page HTML shows `data` and `job` are sibling keys under `pageProps`. The issue description's stated path is incorrect. The implementation follows the observed structure.

**Reuse `buildGreenhouseMeta` unchanged**: The `pageProps.job` object has exactly the fields `buildGreenhouseMeta` already reads (`title`, `company_name`, `location.name`). Passing it as `Record<string, unknown>` requires no type wrangling and no new metadata builder, which keeps the diff minimal.

**Single `decodeHtmlEntities` call**: The `content` field in `__NEXT_DATA__` is stored with HTML entities (`&lt;p&gt;` etc.) — identical encoding to the Greenhouse boards API response. One call to `decodeHtmlEntities` is sufficient. There is no second encoding layer despite the issue description's "double-encoded" label (which refers to the same pattern, not two independent encoding passes).

**Non-exported helper in `route.ts`**: Tests reach this path via the `POST` handler (mock `fetch` returns the HTML with `__NEXT_DATA__`), so the helper does not need to be exported or moved to `lib/`. Exporting it from a route file would risk a Next.js production build failure (only HTTP-method exports are allowed).

**Strict `typeof job.content === 'string'` guard**: The handler must not produce garbled output if `content` is null, undefined, or a non-string type. The guard ensures silent fallthrough to `extractJobContent` in those cases.

## Acceptance criteria

- [ ] `POST /api/fetch-job-description` with `url = https://amperity.com/careers/7931915?gh_jid=7931915` (fetch mocked to return HTML containing the fixture's `__NEXT_DATA__` block) returns `{ html: ... }` where the HTML contains "Lead Software Development Engineer - Infrastructure", "Amperity", "Seattle, WA", and decoded body text (e.g. "AI-first company").
- [ ] When the `__NEXT_DATA__` block is present but `props.pageProps.job.content` is absent (or empty), the handler falls through to `extractJobContent` (no early return from the `gh_jid` block).
- [ ] When the `__NEXT_DATA__` script tag contains malformed JSON, `extractNextDataGreenhouseJob` returns `null` and the handler falls through without throwing.
- [ ] A URL with `?gh_jid=` that also has a Greenhouse embed script tag (`greenhouse.io/embed/job_board/js?for=sofi`) uses the embed-board Greenhouse API path and does not call `extractNextDataGreenhouseJob` (existing SoFi behaviour unchanged).
- [ ] A URL without a `?gh_jid=` param is not affected by the new code path (fetch call count to `greenhouse.io` remains zero for such a URL).

## Human verification steps

- [ ] Paste `https://amperity.com/careers/7931915?gh_jid=7931915` into the JD import field on a live app instance and confirm the job description (title, company, location, full body) is populated. Note: this job posting may go stale; any currently-active Amperity job URL with `?gh_jid=` should exhibit the same behaviour.

## Open questions

None.
