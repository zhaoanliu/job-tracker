_Design for feature request #720: fix: JD import fails for openai.com (/careers/{slug})_

# Design: OpenAI careers JD import via Ashby board listing API

## What the user wants

When a user pastes an `openai.com/careers/{slug}` URL into the JD import field, the app should return the job's title, company, location, and description — just like other supported ATS URLs. Today the route server-side fetches openai.com, hits a Cloudflare JS challenge, gets back an empty/garbled page, and falls through to a generic scraper that finds nothing useful.

## Proposed implementation

Add a pre-fetch handler that recognises `openai.com/careers/{slug}` URLs, calls the public Ashby board listing API at `api.ashbyhq.com/posting-api/job-board/openai`, and finds the matching job by word-overlap between the URL slug and each job's `title + location`. On a match (≥70% overlap), the handler builds a metadata header from the board listing fields and returns `descriptionHtml` directly — no second HTTP fetch needed. All failures silently fall through to the existing HTML scraping pipeline.

### Why no second fetch to `jobs.ashbyhq.com/{uuid}`

Other Ashby handlers (`ashbyCustomMatch`, `ashbyDirectMatch`) call `fetchAshbyJobFromCanonical` because the UUID is in the URL and the board listing is never fetched. Here we must fetch the board listing anyway to resolve the slug to a job. The listing response already includes `descriptionHtml`, `title`, `location`, `team`, and `employmentType` — all the fields we need. Fetching the canonical page a second time for its JSON-LD would save nothing useful (JSON-LD has `datePosted` and optional `baseSalary`, neither critical) at the cost of an extra round-trip and an extra function call.

### Files to modify or create

- **`app/api/fetch-job-description/route.ts`** — add `buildOpenAIAshbyMeta` helper function and a new pre-fetch handler block for `openai.com/careers/{slug}` (inserted between the Databricks handler and the Ashby custom-domain handler, around line 1114)
- **`__tests__/fixtures/ashby-openai-job.json`** — new fixture: a single Ashby board listing job entry (real API response for job `ace42c6d-8663-4b30-9337-ec70cf071d73`, "Principal Software Engineer, Infrastructure Security", without the redundant `descriptionPlain` field)
- **`__tests__/api/fetch-job-description.test.ts`** — add `describe('OpenAI careers (Ashby board listing)')` with 4 tagged test cases
- **`app/api/fetch-job-description/CLAUDE.md`** — add OpenAI row to the ATS integrations table

### UI changes

None. The JD import modal already handles all recognised and unrecognised URLs; no component changes are needed.

## Implementation plan

<!-- implementation-plan-json
[
  {
    "id": 1,
    "title": "Add OpenAI Ashby board listing handler and tests",
    "scope": "Create __tests__/fixtures/ashby-openai-job.json with the real board listing entry for job ace42c6d-8663-4b30-9337-ec70cf071d73. Add buildOpenAIAshbyMeta() function and the openai.com/careers/{slug} pre-fetch handler block to route.ts (between Databricks and Ashby custom-domain handlers). Add 4 tagged unit tests (AC-720-1 through AC-720-4) to fetch-job-description.test.ts. Update CLAUDE.md ATS table. Run npm run test:coverage before committing.",
    "files_to_create": ["__tests__/fixtures/ashby-openai-job.json"],
    "files_to_modify": [
      "app/api/fetch-job-description/route.ts",
      "__tests__/api/fetch-job-description.test.ts",
      "app/api/fetch-job-description/CLAUDE.md"
    ],
    "test_file": "__tests__/api/fetch-job-description.test.ts",
    "estimated_turns": 20,
    "ac_items": [1, 2, 3, 4]
  }
]
-->

- [ ] **Step 1: Add OpenAI Ashby board listing handler and tests** (~20 turns) — Create the fixture file, implement the pre-fetch handler with word-overlap matching and `buildOpenAIAshbyMeta`, and add all 4 AC-tagged tests.

## Design decisions

**Extract directly from board listing vs. fetch canonical Ashby URL**
- Chosen: extract `descriptionHtml`, `title`, `location`, `team`, `employmentType` from the board listing response directly.
- Alternative: after finding the UUID from the board listing, call `fetchAshbyJobFromCanonical('openai', uuid, signal)` to get JSON-LD from `jobs.ashbyhq.com`.
- Why chosen: the board listing is fetched anyway to resolve the slug. It already contains `descriptionHtml` and all the metadata fields we display. The extra round-trip to `jobs.ashbyhq.com` would only add `datePosted` and optional `baseSalary`, which are not displayed by the generic Ashby handler for custom domains either. One fewer HTTP request and no branching complexity.

**Word-overlap threshold: 70%**
- Chosen: count how many words in the URL slug appear in `slugified(title + ' ' + location)`; require ≥70% overlap.
- Alternative: exact-string match, Levenshtein distance, or a lower/higher threshold.
- Why chosen: the issue author verified this threshold works for the target URL (`principal-software-engineer-infrastructure-security-remote-us` → "Principal Software Engineer, Infrastructure Security" at 100% overlap). 70% allows minor title drift (different word order, extra qualifier) without producing false positives. Lower thresholds risk matching unrelated jobs; higher thresholds fail when Ashby updates a title slightly.

**Hardcode company slug `openai` in handler**
- Chosen: the board API URL `api.ashbyhq.com/posting-api/job-board/openai` is hardcoded; the hostname match is restricted to exactly `openai.com`.
- Alternative: generic Ashby board lookup using the company name derived from the hostname (e.g. `openai.com` → `openai`). This would require knowing every domain→slug mapping and handling slug mismatches.
- Why chosen: this is a company-specific handler (as are the Stripe, HubSpot, Coupang, and Pinterest handlers). Hardcoding avoids false positives on other sites that happen to have `/careers/{slug}` paths.

**`employmentType` formatting: split CamelCase**
- The board listing returns `"FullTime"` (CamelCase), not `"FULL_TIME"` (the JSON-LD format used elsewhere). Use `.replace(/([a-z])([A-Z])/g, '$1 $2')` to produce `"Full Time"`.

**Handler position in route.ts**
- Inserted between the Databricks handler and the Ashby custom-domain handler (around line 1114). Logical grouping: all "Cloudflare-blocked, hardcoded-company-slug" pre-fetch handlers appear together before the generic Ashby path-pattern handlers.

## Acceptance criteria

- [ ] **1.** Importing `https://openai.com/careers/principal-software-engineer-infrastructure-security-remote-us/` returns an HTML response that contains the text "Principal Software Engineer" (title), "OpenAI" (company row), "Remote" (location), and a non-empty description paragraph — verified via mocked board listing API returning the fixture.
- [ ] **2.** When the Ashby board listing API returns HTTP 404, the route falls back to a plain HTML fetch of the original `openai.com` URL (observed via fetch mock call inspection).
- [ ] **3.** When the Ashby board listing API throws a network error, the route falls back to a plain HTML fetch of the original `openai.com` URL (observed via fetch mock call inspection).
- [ ] **4.** Importing `https://openai.com/blog/some-post` does not trigger a fetch to `api.ashbyhq.com/posting-api/job-board/openai` (path pattern `/blog/` does not match `/careers/{slug}`).

## Human verification steps

- [ ] Import `https://openai.com/careers/principal-software-engineer-infrastructure-security-remote-us/` in the live app and confirm the modal populates with the job title, OpenAI as company, location, and a full description. (Job may be delisted by the time this is reviewed; pick any live `openai.com/careers/{slug}` URL to re-verify the handler fires.)

## Open questions

None.
