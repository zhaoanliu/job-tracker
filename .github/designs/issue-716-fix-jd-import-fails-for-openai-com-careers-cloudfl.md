_Design for feature request #716: fix: JD import fails for openai.com/careers/ (Cloudflare-blocked, Ashby board slug lookup needed)_

# Design: OpenAI Careers Pre-fetch Handler (issue #716)

## What the user wants

When a user imports `https://openai.com/careers/{slug}/`, the JD importer should return the job title, company (OpenAI), location, and description. Today the import fails: openai.com is Cloudflare-blocked (HTTP 403 on every server-side request), so neither a page fetch nor any existing handler can fire. OpenAI uses Ashby ATS with board slug `openai`. The public board listing API (`https://api.ashbyhq.com/posting-api/job-board/openai`) returns HTTP 200 with all jobs including full `descriptionHtml` for each. The URL slug (e.g. `principal-software-engineer-infrastructure-security-remote-us`) can be matched against jobs by slugifying `title + '-' + location`.

Verified by investigation:
- `openai.com` returns 403 with Cloudflare challenge on server-side curl
- `https://api.ashbyhq.com/posting-api/job-board/openai` returns HTTP 200 with 721 jobs, `descriptionHtml` included inline, no auth required
- Target job `ace42c6d-8663-4b30-9337-ec70cf071d73` ("Principal Software Engineer, Infrastructure Security", "Remote - US") is present in the listing
- Slugifying `"Principal Software Engineer, Infrastructure Security" + "-" + "Remote - US"` → `"principal-software-engineer-infrastructure-security-remote-us"` matches the URL slug exactly

## Proposed implementation

Add a pre-fetch handler block in `route.ts` that detects `openai.com` / `www.openai.com` with path `/careers/{slug}/`, fetches the Ashby board listing API, finds the job whose `slugify(title + '-' + location)` matches the URL slug, and returns the job's `descriptionHtml` prefixed with a metadata header built from the listing fields. The handler returns `null` (falls through to HTML scraping) if the API returns non-2xx, throws, or no job matches the slug.

### Files to modify or create

- `app/api/fetch-job-description/route.ts` — add `slugifyAshbySlug` helper, `buildOpenAIAshbyMeta` builder, `fetchOpenAIAshbyJob` async function, and a pre-fetch detection block after the Databricks handler
- `__tests__/fixtures/ashby-openai-board.json` — new fixture: real board listing API response trimmed to 3 jobs (2 representative + target `ace42c6d`)
- `__tests__/api/fetch-job-description.test.ts` — add 4 new unit tests covering all ACs

### UI changes

None. The handler runs server-side during JD import; the imported job description appears in the existing application modal exactly as it does for all other ATS handlers.

## Implementation plan

<!-- implementation-plan-json
[
  {
    "id": 1,
    "title": "Add OpenAI Ashby board pre-fetch handler + fixture + tests",
    "scope": "Create __tests__/fixtures/ashby-openai-board.json (real trimmed board listing with target job ace42c6d). In route.ts: add slugifyAshbySlug(s: string): string helper (lowercase + replace [^a-z0-9]+ with '-' + strip edges), buildOpenAIAshbyMeta builder extracting title/company 'OpenAI'/location/employmentType/department/team into buildMetaTable rows, fetchOpenAIAshbyJob(slug, signal) async function that GETs https://api.ashbyhq.com/posting-api/job-board/openai, finds the matching job, and returns meta+descriptionHtml or null on any failure. Add detection block after the Databricks handler: match (openai.com || www.openai.com) + pathname /careers/{slug}/, call fetchOpenAIAshbyJob, return on success or fall through. Write 4 unit tests tagged [AC-716-1] through [AC-716-4]: happy path (title/company/location/description from fixture), non-2xx fallback, throws fallback, non-matching hostname. Run npm run test:coverage and fix any threshold failures.",
    "files_to_create": ["__tests__/fixtures/ashby-openai-board.json"],
    "files_to_modify": [
      "app/api/fetch-job-description/route.ts",
      "__tests__/api/fetch-job-description.test.ts"
    ],
    "test_file": "__tests__/api/fetch-job-description.test.ts",
    "estimated_turns": 20,
    "ac_items": [1, 2, 3, 4]
  }
]
-->

- [ ] **Step 1: Add OpenAI Ashby board pre-fetch handler + fixture + tests** (~20 turns) — Create the board listing fixture, add `slugifyAshbySlug` / `buildOpenAIAshbyMeta` / `fetchOpenAIAshbyJob` to `route.ts` with a pre-fetch detection block, and write all 4 AC-tagged unit tests.

## Design decisions

**Board listing API vs per-job API**
- Chosen: `GET https://api.ashbyhq.com/posting-api/job-board/openai` (board listing)
- Alternative: `GET https://api.ashbyhq.com/posting-api/job-board/openai/jobs/{uuid}` (per-job)
- Why listing: the per-job API requires auth (returns HTTP 401 on direct curl). The URL slug contains no UUID to pass to a per-job API anyway. The listing returns `descriptionHtml` inline — no second fetch needed. The listing has 721 jobs (~300 KB JSON), which is the unavoidable cost given the URL has no job identifier beyond the human-readable slug.

**`descriptionHtml` directly vs fetching `jobs.ashbyhq.com/{company}/{uuid}` for JSON-LD**
- Chosen: use `descriptionHtml` from the board listing response directly
- Alternative: use the UUID from the matched listing entry to call `fetchAshbyJobFromCanonical` (which fetches `jobs.ashbyhq.com/openai/{uuid}` and extracts JSON-LD)
- Why direct: avoids a second network call. The listing's `descriptionHtml` is pre-cleaned HTML — the same content the JSON-LD approach would return. There is no benefit to a second round-trip.

**Slug matching: `slugify(title + '-' + location)`**
- Chosen: concatenate title + `'-'` + location, then lowercase and replace all `[^a-z0-9]+` runs with a single `-`, strip edge hyphens
- Alternative: match only on title slug (ignoring location)
- Why include location: the OpenAI URL slug is demonstrably derived from both title and location (e.g. `…-remote-us` suffix comes from "Remote - US"). Title-only matching would collide on roles that share a title but differ only in location. Verified against the live listing: no two jobs with the same (title, location) pair exist.

**Hardcode `openai` board slug**
- Chosen: the board slug is hardcoded as `"openai"` in the fetch URL
- Alternative: derive slug from hostname (`openai.com` → `openai`)
- Why hardcode: the existing Ashby custom-domain handler derives slug from the hostname (`careers.confluent.io` → `confluent`), but openai.com is a root domain — using the second-to-last label of `openai.com` would yield `openai` anyway. Hardcoding is clearer and matches the pattern used for Coupang, Pinterest, HubSpot, DigitalOcean, and Databricks where the board slug doesn't match the domain in an obvious way.

**Employment type formatting**
- Chosen: explicit map `{ FullTime: 'Full-time', PartTime: 'Part-time', Contract: 'Contract', Internship: 'Internship' }` with unknown values passed through as-is
- Alternative: regex split on camelCase boundaries (`"FullTime".replace(/([A-Z])/g, ' $1').trim()` → `"Full Time"`)
- Why map: produces idiomatic output (`Full-time` not `Full Time`) and matches Workable's approach for employment type labels. Values not in the map fall through unchanged rather than silently producing wrong output.

## Acceptance criteria

- [ ] **1.** Importing `https://openai.com/careers/principal-software-engineer-infrastructure-security-remote-us/` returns a response with `<h1>Principal Software Engineer, Infrastructure Security</h1>` in the HTML
- [ ] **2.** The returned HTML contains `OpenAI` (company name)
- [ ] **3.** The returned HTML contains `Remote - US` (location)
- [ ] **4.** The returned HTML contains job description content from the `descriptionHtml` fixture field
- [ ] **5.** When the Ashby board API returns HTTP 404, the response falls back to HTML scraping (the sentinel fallback body is returned)
- [ ] **6.** When the Ashby board API fetch throws a network error, the response falls back to HTML scraping
- [ ] **7.** For a URL on a different hostname (e.g. `https://stripe.com/careers/some-role/`), the OpenAI board API is never called

## Human verification steps

- [ ] Import `https://openai.com/careers/principal-software-engineer-infrastructure-security-remote-us/` in the live app and verify the job title "Principal Software Engineer, Infrastructure Security", company "OpenAI", location "Remote - US", and description body are all present in the imported result. (This job may be filled or removed from the board; if so, pick any current `https://openai.com/careers/{slug}/` URL from the live listing.)

## Open questions

None.
