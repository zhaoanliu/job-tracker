# Job URL Extraction — Design Doc

**Status:** Planned  
**GitHub issues:** Public #255 · Internal #260  
**Last updated:** 2026-05-24

> **Decision (2026-05-24):** Phase 1 scope reduced. Fetch the full page content and populate the `jd` field only — no ATS API detection, no LLM, no structured field parsing. Phases 2+ handle structured extraction.

---

## Problem

Adding a job application today requires manually copying the job title, company name, location, work mode, and full job description from the posting page into the form. That is 5–6 fields of copy-paste friction before the user can even start tracking the application.

## Goal

User pastes a job posting URL → backend extracts structured data → form fields are pre-populated for review → user edits and saves. Extraction never auto-saves; the user always has the final word.

---

## Codebase Context

### What already exists

| Area | Current state |
|---|---|
| `components/modals/ApplicationModal.tsx` | 4-tab modal (Details / Progress / Job Description / History). "Job Posting URL" (`link` field) lives in Details, already has an "open in new tab" button next to it — natural home for an "Import" button. |
| `lib/types.ts` → `Application` | `jd: string | null` stores HTML from RichTextEditor. `link: string | null` is the job URL. `location` and `workmode` are constrained enums, not free text. |
| `@playwright/test` | **devDependency only** — used for Playwright E2E tests, not production. There is no headless-browser scraping infrastructure in production code. |
| LLM integrations | **None.** No `@anthropic-ai/sdk`, `openai`, or similar packages anywhere in the codebase. |
| Hosting | **Vercel Fluid Compute.** Standard Playwright cannot run here without a custom Chromium binary layer. |

### Data model gaps

The proposed extraction schema includes fields that have no column in the current `applications` table:

| Extracted field | Existing column | Gap |
|---|---|---|
| `job_title` | `role` | ✅ maps directly |
| `company_name` | `company` | ✅ maps directly |
| `location` | `location` (enum) | ⚠️ enum won't match free-text — see decision below |
| `remote_policy` | `workmode` (enum: On-site / Hybrid / Remote) | ⚠️ needs normalization |
| `description` + `requirements` | `jd` (HTML string) | ⚠️ LLM outputs markdown → must convert to HTML |
| `employment_type` | — | ❌ no column |
| `salary_range` | — | ❌ no column |
| `posted_date` | — | ❌ no column (separate from application `date`) |
| `canonical_url` | `link` | ✅ already set by the user pasting it |

**Decision (Phase 1):** Populate `jd` only — no structured field mapping at all. All other gaps are deferred to Phase 2+ when LLM extraction is introduced.

---

## Tiered Extraction Strategy

### Tier 1 — ATS Direct API (Phase 1)

Detect known ATS platforms from the URL and call their public JSON APIs. No browser, no LLM, sub-200ms response.

| ATS | URL pattern | API endpoint |
|---|---|---|
| Greenhouse | `boards.greenhouse.io/{co}/jobs/{id}` or `job-boards.greenhouse.io/{co}/jobs/{id}` | `boards-api.greenhouse.io/v1/boards/{co}/jobs/{id}` |
| Lever | `jobs.lever.co/{co}/{id}` | `api.lever.co/v0/postings/{co}/{id}` |
| Ashby | `jobs.ashbyhq.com/{co}/{id}` | `api.ashbyhq.com/posting-api/job-board/...` (public) |

Detection lives in `lib/extraction/ats-detect.ts` — a pure function mapping URL → `{ ats, company, jobId } | null`. Easy to extend.

Greenhouse and Lever return structured JSON with job title, company, location, description HTML, and sometimes compensation. No scraping or LLM needed.

### Tier 2 — Plain HTTP + Readability + LLM (Phase 2)

For URLs that don't match any known ATS:

1. **Server-side `fetch()`** with a realistic `User-Agent` — covers many static/SSR job pages (company blogs, simple job sites).
2. **Mozilla Readability** (`@mozilla/readability` + `jsdom`) — strips nav/footer/sidebar boilerplate, returns the main article content. This is a pure Node.js library, no browser needed.
3. **Claude API** (`claude-sonnet-4-6` or current equivalent) — receives the cleaned text (truncated at ~8 000 tokens), returns the extraction schema as structured JSON using tool use.

This handles a large fraction of real cases without Playwright.

### Tier 3 — Playwright with `@sparticuz/chromium` (Phase 3)

For pages that require JavaScript rendering (Workday, Oracle, some Greenhouse embeds):

- Install `@sparticuz/chromium-min` (pre-built Chromium for serverless, ~50 MB) + `playwright-core`.
- Launch with `chromium.executablePath()` and `{ headless: true }`.
- Use `playwright-extra` + `puppeteer-extra-plugin-stealth` for bot-detection bypass.
- **Memory:** Each browser context is 100–200 MB. Vercel Fluid Compute allocates up to 3 008 MB per function; set `maxInstances` appropriately.
- **Cold start:** Chromium init adds 2–4 s. Combined with page render (5–15 s) and LLM (~2 s), total latency is 10–25 s — too long for a synchronous response. The async job pattern (see below) is required here.
- **Workday:** Hardest case. Stealth plugin handles most Cloudflare/PerimeterX checks. Some Workday instances will still block; log and fall back gracefully.

> **Hosting note:** `@sparticuz/chromium-min` is a 50 MB layer. Vercel supports it but the package must be listed in `dependencies` (not devDependencies) and the function must be configured with `maxDuration` in `vercel.json`. Alternatively, run Playwright on a dedicated sidecar (Railway / Fly.io / Render) and call it via HTTP — better isolation and no Vercel layer constraints. Decide before starting Phase 3.

---

## API Design

### `POST /api/extract-job`

**Request:**
```json
{ "url": "https://boards.greenhouse.io/stripe/jobs/123456" }
```

**Response (synchronous, Tiers 1–2):**
```json
{
  "status": "ok",
  "tier": "ats-api",
  "data": {
    "job_title": "Senior Software Engineer",
    "company_name": "Stripe",
    "workmode": "Hybrid",
    "jd_html": "<p>...</p>",
    "raw": { /* original API response for debugging */ }
  }
}
```

**Response (async, Tier 3 — Phase 3):**
```json
{ "status": "pending", "job_id": "extr_abc123" }
```
Frontend polls `GET /api/extract-job/[job_id]` until `status` is `"ok"` or `"error"`.

**Error response:**
```json
{ "status": "error", "code": "bot_blocked" | "timeout" | "parse_failed" | "invalid_url", "message": "..." }
```

### URL validation (SSRF protection)

Before any fetch, validate in `lib/extraction/validate-url.ts`:
- Scheme must be `http` or `https`.
- Resolve hostname to IP; reject private ranges: `10.x`, `172.16–31.x`, `192.168.x`, `127.x`, `::1`, link-local.
- Reject hostnames resolving to RFC 1918 addresses (DNS rebinding protection).
- Max URL length: 2 048 chars.

---

## LLM Extraction Schema

Used by Tier 2 (and Tier 3) as a Claude tool definition:

```typescript
interface ExtractedJob {
  job_title: string
  company_name: string
  location: string | null           // free-text, not mapped to enum in Phase 1
  employment_type: string | null    // "Full-time", "Contract", etc.
  remote_policy: 'remote' | 'hybrid' | 'onsite' | null
  salary_range: {
    min: number | null
    max: number | null
    currency: string | null
  } | null
  posted_date: string | null        // ISO date
  description: string               // full JD, markdown
  requirements: string | null       // separate qualifications block if present
  canonical_url: string
}
```

**Prompt constraints:**
- System: "You are a structured data extractor. Return only the JSON schema. Do not add commentary."
- Input truncated to 8 000 tokens (≈32 000 chars) of Readability-cleaned text.
- Use Claude tool use (structured output) to guarantee schema compliance.
- Model: `claude-sonnet-4-6` (current default; configurable via env var `EXTRACTION_MODEL`).

**Markdown → HTML conversion:**  
The JD field stores HTML. LLM returns markdown. Convert with `marked` (already used by many Next.js projects, or use a lightweight custom converter). Add `marked` to dependencies in Phase 2.

---

## Async Job Pattern (Phase 3)

```
Client                  /api/extract-job         /api/extract-job/[id]      Supabase
  │──── POST url ──────────▶│                                               │
  │◀─── { job_id } ─────────│─── INSERT extraction_jobs ────────────────────▶│
  │                          │                                               │
  │                    [background]                                          │
  │                    launch Playwright                                     │
  │                    fetch + LLM                                           │
  │                    UPDATE extraction_jobs ────────────────────────────────▶│
  │                                                                          │
  │──── GET /api/extract-job/[id] ─────────────────▶│                       │
  │◀─── { status, data } ─────────────────────────── │◀─ SELECT ────────────│
```

Poll interval: 2 s, max 30 polls (60 s total). Hard server timeout: 45 s per extraction attempt.

> **Phase 1–2 note:** No async pattern needed. The route responds synchronously. Total latency: ATS tier <500 ms, HTTP+LLM tier 3–8 s (acceptable for a user-initiated action).

---

## Caching

A `jd_extraction_cache` table (Phase 2):

```sql
create table public.jd_extraction_cache (
  canonical_url text primary key,
  result        jsonb not null,
  tier          text not null,
  extracted_at  timestamptz not null default now()
);
-- No RLS needed: cache is read-only by all users, contains no PII
-- TTL: purge rows older than 7 days via pg_cron or a cleanup route
```

Before any extraction, check the cache by canonical URL. On success, write to cache. Cache miss still runs extraction normally.

---

## Observability

A `jd_extraction_log` table (Phase 1, used for debugging and prompt iteration):

```sql
create table public.jd_extraction_log (
  id           uuid primary key default gen_random_uuid(),
  url          text not null,
  canonical_url text,
  tier         text,          -- 'ats-api' | 'http-llm' | 'playwright-llm' | 'failed'
  ats_detected text,          -- 'greenhouse' | 'lever' | 'ashby' | null
  success      boolean not null,
  error_code   text,
  duration_ms  integer,
  created_at   timestamptz not null default now()
);
-- No user_id: logs are infra-level, not per-user
-- RLS: disabled (service role only)
```

Log every attempt. On failure, also store the raw HTML/response in a separate Supabase Storage bucket (`extraction-debug`) so failed cases can be replayed for prompt tuning.

---

## UI Integration

The trigger lives **next to the "Job Posting URL" input** in the Details tab of `ApplicationModal`:

```
[ https://...                    ] [↗] [Import ↓]
```

Behavior:
1. "Import" button is disabled when `form.link` is empty or invalid.
2. On click: button shows spinner + "Fetching…" label; all form fields are read-only during fetch.
3. On success: pre-populate `company`, `role`, `jd`, `workmode`; switch to "Job Description" tab so user can see what was extracted; show a green inline banner "Fields populated from job posting — review before saving."
4. On error: show an error toast ("Couldn't extract job details — paste the description manually."); do not change any form state.
5. **Never overwrite non-empty fields** — if `company` already has a value, don't replace it. Only populate blank fields.

---

## Phased Delivery

### Phase 1 — Full page content → `jd` field (no parsing)

**Goal:** User pastes a URL, clicks Import, and the full job description content is fetched and placed in the `jd` field. No structured extraction, no ATS detection, no LLM. Zero new npm packages, zero schema migrations.

**Approach:** Server-side `fetch()` the URL → parse with `jsdom` + `@mozilla/readability` (both already in devDependencies via Playwright) to strip nav/headers/footers → return the main content HTML → populate `jd`.

> `jsdom` is already a devDependency (`^24.1.3`). `@mozilla/readability` needs to be added to `dependencies`.

Tasks:
- [ ] `lib/extraction/validate-url.ts` — SSRF-safe URL validator (block private IPs, localhost, non-http/https schemes)
- [ ] `lib/extraction/fetch-jd.ts` — fetch URL, run Readability, return cleaned HTML; cap at 100 KB
- [ ] `app/api/extract-job/route.ts` — POST `{ url }` → synchronous response `{ html }` or `{ error }`
- [ ] `components/modals/ApplicationModal.tsx` — "Import" button next to Job Posting URL input; loading state; on success set `jd` (only if currently empty) and switch to Job Description tab; on error show inline message
- [ ] Unit tests: URL validator, `fetch-jd` (mock `fetch` with HTML fixture), API route
- [ ] Component test: "Import" button states (idle / loading / success / error / non-empty jd guard)

### Phase 2 — Plain HTTP + Readability + LLM tier

**Goal:** Cover company career pages, simple job boards, and any ATS not in Phase 1.

Tasks:
- [ ] Add `@anthropic-ai/sdk`, `@mozilla/readability`, `jsdom`, `marked` to `dependencies`
- [ ] `lib/extraction/readability.ts` — fetch URL, parse with jsdom + Readability, return cleaned text
- [ ] `lib/extraction/llm-extract.ts` — send to Claude with tool use schema, return `ExtractedJob`
- [ ] Wire Tier 2 into `app/api/extract-job/route.ts` as fallback after Tier 1 miss
- [ ] `supabase/migrations/TIMESTAMP_jd_extraction_cache.sql` — cache table
- [ ] Cache lookup/write in the API route
- [ ] `EXTRACTION_MODEL` env var (default `claude-sonnet-4-6`), `ANTHROPIC_API_KEY` Vercel secret
- [ ] Unit tests: readability extractor (mock fetch + real HTML fixture), LLM extractor (mock Claude SDK)
- [ ] Sentry error logging for LLM failures

### Phase 3 — Playwright + stealth tier + async jobs

**Goal:** Handle JavaScript-rendered pages (Workday, Oracle, some Greenhouse embeds).

Tasks:
- [ ] **Hosting decision first** — Vercel layer (`@sparticuz/chromium-min`) vs. dedicated sidecar service
- [ ] If sidecar: scaffold a minimal Express service in a new repo or subdirectory
- [ ] `lib/extraction/playwright-fetch.ts` — launch Chromium with stealth, navigate, extract HTML
- [ ] `supabase/migrations/TIMESTAMP_extraction_jobs.sql` — async job queue table
- [ ] `app/api/extract-job/[id]/route.ts` — polling endpoint
- [ ] Frontend polling loop in `ApplicationModal` (2 s interval, 60 s timeout)
- [ ] Update UI: "Fetching (this may take up to 30 s)…" for Playwright path
- [ ] E2E test: mock Playwright extraction, verify UI polling flow

---

## Open Questions

1. **Hosting for Playwright (Phase 3):** Run `@sparticuz/chromium-min` inside Vercel Fluid Compute, or deploy a dedicated Playwright sidecar? Vercel layer is simpler ops but adds ~50 MB to the function bundle and needs `maxDuration` configured. Sidecar is better isolation but another service to maintain.

2. **`location` enum mismatch:** The extracted location is free-text ("San Francisco, CA") but `ApplicationLocation` is a constrained enum (Bellevue WA / Seattle WA / Redmond WA / Remote). Options: (a) skip location population entirely, (b) add an unconstrained location field to the schema, (c) attempt fuzzy mapping (risky). What do you prefer?

3. **Which fields to surface in the UI on import?** Current plan: populate `company`, `role`, `jd`, `workmode` only. Should `salary_range` and `employment_type` go somewhere — Notes field? New DB columns? Or out of scope entirely?

4. **LLM provider:** No existing LLM integration. Claude API (`@anthropic-ai/sdk`) is the natural choice given the toolchain, but costs money per extraction. Estimate: ~1 500–3 000 tokens per extraction at Sonnet pricing ≈ $0.004–0.008 per call. Cache makes repeat lookups free. Acceptable?

5. **"Import" button placement:** Current proposal is next to the "Job Posting URL" input in the Details tab. Alternative: a separate "Import from URL" banner at the top of the modal when the form is empty. Which feels better?

6. **Overwrite behavior:** Current plan: only populate blank fields. If `company` is already set (e.g., user opened the modal and typed something), leave it. Should extracted data ever overwrite existing content? (Possibly with a confirmation.)

7. **Rate limiting:** Should the `/api/extract-job` endpoint be rate-limited per user (e.g., 20 extractions/day)? Supabase auth session is available server-side so per-user limiting is feasible. Concern: LLM tier costs money and Playwright tier consumes significant CPU.

---

## Risks

### 1. Vercel / Playwright incompatibility (High — Phase 3 blocker)

Playwright with full Chrome is ~300 MB and needs OS-level dependencies not present in Vercel's runtime. `@sparticuz/chromium-min` solves this but is 50 MB per cold start and has known compatibility gaps (some CSS/JS APIs missing). If testing reveals unacceptable failure rates, the fallback is a dedicated sidecar, adding operational complexity. **Mitigate:** Don't start Phase 3 without a Chromium compatibility spike on Vercel.

### 2. Workday bot detection (High — affects Phase 3 coverage)

Workday uses PerimeterX + server-side rendering. Stealth plugin bypasses most fingerprinting but Workday specifically checks browser behavior patterns. Success rate in testing is uncertain. Residential proxies would improve this but are out of scope. **Mitigate:** Log all Workday extraction attempts; treat failures as expected, fall through to manual paste with a clear error message.

### 3. LLM cost at scale (Medium)

At current usage (personal tool, single user) LLM cost is negligible (<$1/month). If the product ever expands to multiple users, the HTTP+LLM tier could cost $0.004–0.008 per extraction. The cache (Phase 2) eliminates repeat costs. Rate limiting (Open Question 7) caps abuse. **Mitigate:** Add per-user rate limiting before any public growth.

### 4. ATS API schema drift (Low-Medium)

Greenhouse and Lever public APIs are stable but undocumented/unofficial. If they change response shape, extractions silently return wrong data. **Mitigate:** Log raw API responses (`raw` field in the log table); add a canary test that hits a known stable job URL and asserts the expected shape.

### 5. Data model migration risk (Low — Phase 2+)

Adding `salary_range`, `employment_type`, `posted_date` columns follows the established migration checklist. Risk is low if the checklist is followed. The Phase 1 approach (skip these fields) avoids migration risk entirely for the first ship.
