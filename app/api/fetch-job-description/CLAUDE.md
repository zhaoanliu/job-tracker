## ATS integrations (`route.ts`)

The JD import route detects ATS-specific URL patterns and calls their public APIs to get structured job data, avoiding JS rendering. Each ATS block follows the same structure: detect URL → call API → build metadata header → return HTML. Falls back to generic HTML scraping on any API failure.

**Adding a new ATS integration — checklist:**

1. **Find the URL pattern and data source.** Look at what the job URL looks like, then find where structured data lives:
   - **Preferred**: a public unauthenticated JSON API endpoint (Greenhouse, Lever, Eightfold pattern)
   - **Fallback**: JSON-LD `JobPosting` schema embedded in the page HTML (Workday pattern — use when the API requires browser session cookies or auth)
   - Test server-side reachability with `curl` before committing to an API approach — a 401/403/406 means the API is browser-gated and you need the HTML fallback instead

2. **Fetch real data and write the fixture file first — before touching route.ts or the test file.**

   Writing the fixture is a `Write` call — the issue and worktree must already exist before you run `curl` and save the file. Do not write the fixture into local `main` and then create the worktree; untracked files do not carry over to worktrees and the file will be left behind in `main` as a stale artifact.

   For a JSON API:
   ```bash
   curl -s "https://<ats-api>/<job-id>" > __tests__/fixtures/<ats-name>-job.json
   ```

   For HTML-embedded JSON-LD (Workday pattern):
   ```bash
   # Fetch the page, extract the JSON-LD block, save as the fixture object
   curl -s "https://<job-url>" | python3 -c "
   import sys, re, json
   html = sys.stdin.read()
   m = re.search(r'<script[^>]*type=[\"\\']application/ld\+json[\"\\'][^>]*>(.*?)</script>', html, re.DOTALL)
   items = json.loads(m.group(1))
   items = items if isinstance(items, list) else [items]
   jp = next(i for i in items if i.get('@type') == 'JobPosting')
   print(json.dumps(jp, indent=2))
   " > __tests__/fixtures/<ats-name>-job.json
   ```

   **The fixture file must exist and be committed before the test file references it.** Never write the test first and fill in the data later — the fixture is the ground truth that shapes the assertions.

3. **Identify which fields to display.** Read the fixture to find job title, location, team/department, work type, and description fields. Map them to rows in the metadata `<table>` header (follow the pattern in `buildGreenhouseMeta`, `buildLeverMeta`, `buildEightfoldMeta`, `buildWorkdayMeta`).

4. **Add detection + data extraction + meta builder** in `route.ts`:
   - For JSON API ATS: add the handler block before the generic HTML fetch. Pattern: match URL → `try { fetch API → build meta + body → return } catch { /* fall through */ }`
   - For HTML JSON-LD ATS (Workday): detect the hostname before the fetch, fetch the page normally, then parse the JSON-LD from the HTML after the fetch. Pattern: `if (isTargetATS) { const result = extractFromPage(raw); if (result) return result }` — placed after `raw` is populated, before `extractJobContent`.
   - Fall through to HTML scraping on any failure — never throw from an ATS block

5. **Write tests that import from the fixture file.** Tests must use `import fixture from '../fixtures/<name>.json'` — never inline the fixture data as a literal object in the test. Inlining defeats the purpose: it only tests shapes you invented, not shapes the real API actually returns.

   For JSON API fixtures:
   ```typescript
   import myAtsJob from '../fixtures/myats-job.json'
   // ...
   const fetchMock = vi.fn().mockImplementation((url: string) => {
     if (url === MY_ATS_API_URL) return Promise.resolve(jsonResponse(myAtsJob))
     return Promise.resolve(htmlResponse('<html><body>fallback</body></html>'))
   })
   ```

   For HTML JSON-LD fixtures (Workday pattern):
   ```typescript
   import workdayAdobeJob from '../fixtures/workday-adobe-job.json'
   function workdayPage(ld: object): string {
     return `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`
   }
   // ...
   const fetchMock = vi.fn().mockResolvedValue(htmlResponse(workdayPage(workdayAdobeJob)))
   ```

   Required test cases for every ATS:
   - Happy path: data source returns fixture → HTML contains title, key metadata fields, description content (assert against values present in the real fixture, not invented strings)
   - Non-2xx / API throws → falls back to HTML scraping
   - Missing description field → falls back to HTML scraping
   - Non-matching URL → handler not triggered (fetch call count = 1)
   - Any optional field absent in the real fixture but possible in practice → one synthetic test with a `// Synthetic:` comment explaining why

**ATS integrations already implemented:**

| ATS | URL pattern | Data source | Fixture |
|---|---|---|---|
| Eightfold.ai | `{origin}/careers/job/{id}` | `{origin}/api/apply/v2/jobs/{id}` (JSON API) | `eightfold-microsoft-job.json` (Microsoft, job 1970393556868060) |
| Greenhouse (direct) | `boards.greenhouse.io/{board}/jobs/{id}` or embedded ref in page HTML | `boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}` (JSON API) | `greenhouse-scaleai-job.json` (Scale AI, job 4599700005) |
| Greenhouse (embed board) | `{company}.com/careers/job/?gh_jid={id}` — company career page with `?gh_jid=` query param | `boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}` (JSON API); board name extracted from `?for=` in embed script tag | `greenhouse-sofi-job.json` (SoFi, job 7679621003) |
| Greenhouse (Stripe careers) | `stripe.com/jobs/listing/{slug}/{id}` — server HTML is a JS SPA with no Greenhouse references, so the post-fetch handlers can't detect it | `boards-api.greenhouse.io/v1/boards/stripe/jobs/{id}` (JSON API); board name is hardcoded to `stripe` | `greenhouse-stripe-job.json` (Stripe, job 7761694) |
| HubSpot | `hubspot.com/careers/jobs/{id}` (with or without `www.`) | `boards-api.greenhouse.io/v1/boards/hubspotjobs/jobs/{id}` (JSON API); board slug `hubspotjobs` is hardcoded | `hubspot-job.json` (HubSpot, job 7621322) |
| Coupang | `(www.)coupang.jobs/en/jobs/{id}/{slug}/?gh_jid={id}` — Cloudflare blocks server-side HTML fetches (403) | `boards-api.greenhouse.io/v1/boards/coupang/jobs/{id}` (JSON API); board slug `coupang` is hardcoded; job ID from `?gh_jid=` query param | `greenhouse-coupang-job.json` (Coupang, job 7822518) |
| Databricks | `www.databricks.com/company/careers/{dept}/{slug}-{id}` — custom Gatsby career site with no Greenhouse references in HTML | `boards-api.greenhouse.io/v1/boards/databricks/jobs/{id}` (JSON API); board slug `databricks` is hardcoded; job ID is the trailing numeric segment of the path slug | `greenhouse-databricks-job.json` (Databricks, job 7993609002) |
| Lever | `jobs.lever.co/{company}/{uuid}` | `api.lever.co/v0/postings/{company}/{uuid}` (JSON API) | `lever-posting-no-lists.json`, `lever-posting-with-lists.json` (Mistral) |
| Uber | `www.uber.com/*/careers/list/{id}/` | JSON-LD `JobPosting` block embedded in page HTML; description is HTML-entity-encoded | `uber-job.json` (job 156729) |
| Workable | `apply.workable.com/{company}/j/{shortcode}` | `apply.workable.com/api/v1/accounts/{company}/jobs/{shortcode}` (JSON API) | `workable-gable-job.json` (Gable, 6EF9ADEAB7) |
| Workday | `{tenant}.wd{N}.myworkdayjobs.com/…/job/…` | JSON-LD `JobPosting` block embedded in page HTML (CXS API requires browser cookies) | `workday-adobe-job.json` (Adobe, R168193) |
| Expedia | `careers.expediagroup.com/job/{slug}/{location}/{id}/` | `schema.org/JobPosting` JSON-LD embedded in page HTML (WordPress-hosted career site) | `expedia-job.json` (Expedia Group, R-105467-3) |
| LinkedIn | `www.linkedin.com/jobs/view/{id}` | `www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id}` (HTML fragment with named CSS classes — no JSON API and no JSON-LD on the public page) | `linkedin-job.html` (LinkedIn, job 4415502323) |
| Google Careers | `www.google.com/about/careers/applications/jobs/results/{id}-{slug}` and `careers.google.com/jobs/results/{id}-{slug}` | `AF_initDataCallback({key: 'ds:0', ..., data:[...]})` block embedded in `careers.google.com` page HTML — www.google.com changed ~June 2026 to async client-side loading; handler redirects www fetches to careers.google.com | `google-careers-job.json` (Google, job 92918703267422918) |
| Ashby (custom domain) | `careers.{company}.{tld}/jobs/job/{uuid}` — e.g. `careers.confluent.io/jobs/job/{uuid}` | Custom domains deploy on Vercel with bot protection (429 on server-side fetch); handler derives company slug from hostname (`careers.confluent.io` → `confluent`) and fetches `jobs.ashbyhq.com/{company}/{uuid}` instead; that page embeds `schema.org/JobPosting` JSON-LD without bot gating | `ashby-confluent-job.json` (Confluent, 85107937-8f12-4336-abb8-e88f344c6bcc) |
| Ashby (direct) | `jobs.ashbyhq.com/{company}/{uuid}` | Same `schema.org/JobPosting` JSON-LD path as custom domains; explicit handler for canonical Ashby URLs | same fixture |
| Gem | `jobs.gem.com/{boardId}/{extId}` | `POST https://jobs.gem.com/api/public/graphql` — `ExternalJobPostingQuery` GraphQL operation returning `oatsExternalJobPosting` | `gem-auger-job.json` (Auger, posting `am9icG9zdDqF9OtLq0iQ9-wa_O4b2WV2`) |
| Generic fallback | Any career page not matched by the above | `schema.org/JobPosting` JSON-LD embedded in page HTML — `extractGenericJobPostingFromPage` runs after all named ATS handlers | same handler as Expedia; verified on `careers.expediagroup.com` with multiple jobs |

**ATS-specific gotchas learned:**
- **Greenhouse (direct)**: `content` field is double HTML-entity-encoded after `JSON.parse` — `&lt;p&gt;` stays as-is after parse and must be decoded with `decodeHtmlEntities()` before returning.
- **Greenhouse (embed board)**: Company career pages (e.g. `sofi.com/careers/job/?gh_jid=ID`) render job content client-side via the Greenhouse embed JS — HTML scraping returns nothing. Board name is in the embed script src (`?for=sofi`); job ID is the `gh_jid` query param. Detection happens after the page HTML is fetched: match `gh_jid` URL param + `greenhouse.io/embed/job_board/js?for={board}` in raw HTML, then call the Greenhouse API.
- **Coupang**: `www.coupang.jobs` is protected by Cloudflare — server-side fetches return HTTP 403 before reaching the `?gh_jid=` embed-board handler. The handler must run pre-fetch with a hardcoded board slug (`coupang`). Job ID is read from `?gh_jid=`; the `content` field is double-HTML-entity-encoded (same as other Greenhouse responses) and decoded by `fetchGreenhouseJob` via `decodeHtmlEntities`.
- **HubSpot**: The board slug `hubspotjobs` is hardcoded because it does not appear in the page HTML — only inside the minified careers JS bundle's "Apply via Greenhouse" sign-in link (`my.greenhouse.io/users/sign_in?job_board=hubspotjobs`), which is too brittle to extract at runtime.
- **Eightfold**: The job URL ID (in the path) is a large ~16-digit integer internal ID (e.g. `1970393556868060`), not the human-readable `display_job_id` (e.g. `200037915`). `work_location_option` can be `null` on some postings. `locations` array often includes "Multiple Locations" entries that should be filtered out.
- **Lever**: Content is split across `opening`, `description`, `lists` (array of `{text, content}` sections), and `additional` — all must be concatenated. Not all fields are populated on every posting.
- **Uber**: URL pattern is `/global/en/careers/list/{id}/` — NOT an Eightfold `/careers/job/{id}` URL, so the Eightfold handler does not match it. Description is HTML-entity-encoded (like Greenhouse); `extractUberFromPage` calls `decodeHtmlEntities` before returning. `jobLocation` can be a single object or an array — `buildUberMeta` handles both by joining multiple entries with ` | `. `occupationalCategory` maps to the "Department" row (shows e.g. "Engineering"; not the fuller "Backend, Engineering" label Uber renders in its UI from internal data not present in JSON-LD).
- **Workable**: The v1 JSON API (`apply.workable.com/api/v1/accounts/{company}/jobs/{shortcode}`) is publicly accessible (no auth required). Job content is split across three separate HTML fields — `description`, `requirements`, `benefits` — all of which must be concatenated (some may be empty strings on certain postings). The `type` field uses short codes (`"full"`, `"part"`, `"contract"`, `"temporary"`, `"internship"`) mapped to human-readable labels. The page HTML is a JS-rendered SPA with no JSON-LD, so the API is the only reliable server-side data source.
- **Workday**: The CXS API (`/wday/cxs/{tenant}/{site}/jobs/{id}`) returns HTTP 406 from server-side requests — it requires browser session cookies. Use the JSON-LD `JobPosting` schema embedded in the page HTML instead (`extractWorkdayFromPage`). The fixture is the JSON-LD object (not a raw API response); wrap it in a minimal HTML page via `workdayPage(ld)` in the test. The description field in Workday JSON-LD is plain text (not HTML), unlike the other ATS handlers which return HTML bodies.
- **Expedia / generic handler**: `extractGenericJobPostingFromPage` is the final JSON-LD fallback, after all named ATS checks. Expedia's `identifier` is a plain string (e.g. `"R-105467-3"`) — unlike Workday which wraps it as `{"value": "..."}`. The handler supports both forms. Description is HTML (not plain text), so no entity decoding is needed. URL format is `careers.expediagroup.com/job/{slug}/{location-slug}/{id}/`; the same job can appear at multiple location slugs with different ID suffixes (e.g. `R-99666`, `R-99666-1`, `R-99666-2`). To find another Expedia URL for testing, grep the jobs listing page: `curl -s https://careers.expediagroup.com/jobs/ | grep -oE '/job/[a-z0-9-]+/[a-z0-9-]+/[A-Z0-9-]+/'`.
- **LinkedIn**: The public `linkedin.com/jobs/view/{id}` page is a JS-rendered SPA — the server-side HTML contains no JSON-LD `JobPosting` block and no embedded JSON payload, so the generic JSON-LD fallback produces only navigation/sidebar noise. The `www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id}` endpoint is the only unauthenticated server-side source: it returns an HTML fragment (not JSON), parsed via CSS-class regexes against named classes — `topcard__title`, `topcard__org-name-link`, `topcard__flavor--bullet`, `description__job-criteria-list` (label/value pairs in `li.description__job-criteria-item`), and `show-more-less-html__markup` (description body innerHTML). The Voyager/GraphQL APIs require authenticated session cookies and return 401 server-side, so they are not usable. URL detection handles both bare numeric IDs and slugged forms (e.g. `/jobs/view/principal-staff-software-engineer-...-at-linkedin-4415502323`) by capturing the trailing `\d+` group.
- **Google Careers**: JS-rendered SPA with no JSON-LD and no public API. `careers.google.com` embeds the full job data server-side via `AF_initDataCallback({key: 'ds:0', hash: '...', data:[[...]], sideChannel: {}})`. **`www.google.com/about/careers/applications/` changed ~June 2026 to async client-side loading** — it no longer inlines the callback. The handler transparently redirects the HTTP fetch from `www.google.com/about/careers/applications/jobs/results/{id-slug}` to `careers.google.com/jobs/results/{id-slug}`. Both hostname patterns must still be in `isGoogleCareers` because the flag controls post-fetch extraction logic (not just which URL to fetch). **The callback appears near the end of the ~1MB response (byte ~991K)** — the Google Careers block must use `text` (full response), not `raw` (truncated at 500KB). The `data[0]` array contains: `[0]` job ID, `[1]` title, `[2]` sign-in URL, `[3]` responsibilities `[null, html]`, `[4]` qualifications `[null, html]`, `[7]` company, `[9]` locations `[[displayName, ...], ...]`, `[10]` about-the-job `[null, html]`. The fixture is the `data` outer array; the test wraps it with `googleCareersPage(data)`. Content fields are already decoded HTML. The `data[0]` array has 21 fields in the real fixture; only indices 1, 3, 4, 7, 9, 10 are used.
- **Gem**: The page is a JS-rendered SPA with no embedded job data and no JSON-LD; the public GraphQL endpoint at `POST https://jobs.gem.com/api/public/graphql` (no auth required) is the only server-side data source. `descriptionHtml` carries inline `style` attributes from Gem's Quill editor (e.g. `style="background-color: transparent; color: rgb(0, 0, 0);"`) — pass it through as-is; the browser / downstream sanitiser handles them. `extId` is base64url-encoded (e.g. `am9icG9zdDqF9OtLq0iQ9-wa_O4b2WV2`) but the API accepts it verbatim — do not decode. `compensationHtml` is a separate field; append it to the description body when present (it's multi-paragraph prose, not a single value). **Always check the GraphQL envelope's `errors[]` field**: GraphQL APIs can return HTTP 200 with `{"errors":[{"message":"…"}]}` and no `data`, so HTTP status alone is not enough — treat a non-empty `errors[]` (or missing `data.oatsExternalJobPosting`) as failure and fall through to HTML scraping.
- **Ashby**: Custom career domains (e.g. `careers.confluent.io`) are deployed on Vercel with bot protection — server-side fetches return 429. The handler detects the `/jobs/job/{uuid}` path (UUID format is Ashby's identifier), derives the company slug as the second hostname component (`careers.confluent.io` → `confluent`), and re-fetches from `jobs.ashbyhq.com/{company}/{uuid}` which has no bot gating. Falls through gracefully (→ generic HTML scraping) if the slug doesn't match an Ashby company. The Ashby per-job API (`api.ashbyhq.com/posting-api/job-board/{company}/jobs/{id}`) requires auth (401); the job board list API (`api.ashbyhq.com/posting-api/job-board/{company}`) is public but returns all jobs — too inefficient to scan. The `jobs.ashbyhq.com` page embeds JSON-LD with title, identifier (UUID as job ID), datePosted, hiringOrganization, jobLocation, employmentType, and baseSalary. The description is HTML (no entity decoding needed). The `buildGenericJobPostingMeta` `extractAddress` function falls back to `addressCountry` when `addressLocality`/`addressRegion` are absent — Ashby often provides only country for remote roles.
- **Finding real job URLs for testing**: For Lever, `api.lever.co/v0/postings/{company}?mode=json&limit=5` returns a list — find one with `lists` populated for full coverage. For Greenhouse, the board API is public. For Eightfold, the individual job API (`{origin}/api/apply/v2/jobs/{id}`) is public but the search API is auth-gated — the 16-digit internal ID cannot be derived without a real job URL. For Workday, the search API (`POST /wday/cxs/{tenant}/{site}/jobs`) works with `{"appliedFacets":{},"limit":1,"offset":0,"searchText":""}` — fetch a job's `externalPath`, then load the page HTML and capture the JSON-LD block. For Ashby, `api.ashbyhq.com/posting-api/job-board/{company}` lists all jobs with `jobUrl` pointing to `jobs.ashbyhq.com/{company}/{uuid}`. **If you cannot locate a live URL for any ATS, stop and ask the user — do not use a fake ID, do not ship hand-crafted mock data, and do not document "fixture not possible" and move on.** The user can supply a URL in seconds; silently skipping the fixture defeats the whole point of the pattern.
