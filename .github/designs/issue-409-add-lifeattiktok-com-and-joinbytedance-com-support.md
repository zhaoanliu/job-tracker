_Design for feature request #409: Add lifeattiktok.com and joinbytedance.com support to JD import_

# Design: Add lifeattiktok.com and joinbytedance.com support to JD import (#409)

## What the user wants

When a user pastes a job URL from `https://lifeattiktok.com/search/{id}` or `https://joinbytedance.com/search/{id}` into the job import field, the app should extract a clean job description — title, location/type/code metadata, and the full body HTML — rather than falling back to the noisy generic `extractJobContent` result (~46 KB of navigation and footer mixed with the real content).

No ambiguity in the request. Both sites are accessible server-side and share identical HTML structure.

## Investigation findings

Both sites were fetched server-side with a realistic User-Agent and returned full HTML (133 KB and 107 KB respectively). Key findings:

- **No JSON-LD** on either page. The generic `extractJsonLdJobPosting` handler produces nothing useful.
- **RSC payload**: 20–23 `self.__next_f.push([1,"..."])` inline script calls per page. The string in each call is a JSON-encoded RSC wire-format chunk. Decoded and concatenated, the combined string is ~55–70 KB.
- **Title**: directly in the HTML `<title>` tag.
- **Metadata** (Location, Employment Type, Job Code): in the React component tree JSON as sibling `<p>` elements within named `<div>` keys — e.g. `["$","div","Location",{"children":[[label_p],[value_p]]}]`. The value is in the second `<p>`'s `"children"` string.
- **Description**: in an RSC T-payload: `<id>:T<hex_len>,<HTML_content>` where the content starts `<div class="editor-content"`. The hex length allows exact extraction without HTML parsing.
- **USDS jobs on lifeattiktok.com**: the `editor-content` div is absent from the RSC payload (description is restricted at the origin). These fall through to `extractJobContent` unchanged — consistent with existing behaviour.
- **Structure is byte-for-byte identical** between lifeattiktok.com and joinbytedance.com; the only differences are JS/CSS CDN hostnames and CSS class spacing values (`gap-1` vs `gap-[4px]`).

## Proposed implementation

Add a post-fetch detection block to `app/api/fetch-job-description/route.ts` that, after the page HTML is fetched, detects the hostname/path pattern, decodes and concatenates the RSC push payloads, extracts title + metadata + description, and returns. If the `editor-content` div is absent (USDS job), the block falls through to the existing `extractJobContent` pipeline — no change to existing worst-case behaviour.

All helper logic lives as non-exported functions inside `route.ts` (consistent with every other handler in the file). Fixtures are minimal HTML files captured from real pages, loaded with `readFileSync` in tests.

### Files to modify or create

- `app/api/fetch-job-description/route.ts` — add `isLifeAtTikTok` detection flag; add helper functions `extractRscPayloads`, `extractRscLabelValue`, `extractEditorContentFromRsc`, `extractLifeAtTikTokFromPage`; add handler block in `POST` after the Google Careers section.
- `__tests__/api/fetch-job-description.test.ts` — add `describe('lifeattiktok.com / joinbytedance.com')` test suite with all required ATS checklist cases.
- `__tests__/fixtures/lifeattiktok-job.html` — minimal HTML fixture: `<title>` tag + the subset of `self.__next_f.push` script calls that contain the metadata and description RSC segments, captured from a real page.
- `__tests__/fixtures/joinbytedance-job.html` — same, from joinbytedance.com real page.
- `app/api/fetch-job-description/CLAUDE.md` — add both sites to the ATS integrations table and gotchas section.

### UI changes

None. The extraction happens server-side in the existing API route. The user experience is unchanged (paste URL → see description auto-filled in the modal); the improvement is that the filled-in description is now clean rather than containing navigation/footer noise.

## Implementation plan

<!-- implementation-plan-json
[
  {"id":1,"title":"Add RSC parser helpers and lifeattiktok/joinbytedance handler to route.ts","scope":"Create __tests__/fixtures/lifeattiktok-job.html and __tests__/fixtures/joinbytedance-job.html as minimal real HTML fixtures. In app/api/fetch-job-description/route.ts: (1) add isLifeAtTikTok flag before the main fetch; (2) add extractRscPayloads(html) helper that regex-finds all self.__next_f.push([1,\"...\"]) payloads, JSON.parse-decodes each, and concatenates; (3) add extractRscLabelValue(rsc, label) helper that regex-extracts the sibling-p value from the React component tree; (4) add extractEditorContentFromRsc(rsc) helper that locates the T-payload hex-length prefix before editor-content and slices exactly that many bytes; (5) add extractLifeAtTikTokFromPage(html) that orchestrates these — extract title from <title> tag, build rows array for Location/Employment Type/Job Code, call buildMetaTable + decodeHtmlEntities on the description; (6) add the isLifeAtTikTok handler block in POST after the Google Careers section, falling through if description absent. Update app/api/fetch-job-description/CLAUDE.md.","files_to_create":["__tests__/fixtures/lifeattiktok-job.html","__tests__/fixtures/joinbytedance-job.html"],"files_to_modify":["app/api/fetch-job-description/route.ts","app/api/fetch-job-description/CLAUDE.md"],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":20,"ac_items":[1,2,3,4,5]},
  {"id":2,"title":"Write tests for lifeattiktok/joinbytedance handler","scope":"Add describe('lifeattiktok.com / joinbytedance.com') suite to __tests__/api/fetch-job-description.test.ts. Load both fixtures with readFileSync. Test cases: (a) lifeattiktok.com happy path — fixture returns title in <h1>, Location/Employment Type/Job Code in metadata table, and description body content from the real fixture; (b) joinbytedance.com happy path with its fixture; (c) USDS fallback — synthetic HTML with RSC metadata but no editor-content div falls through to extractJobContent; (d) no RSC push calls at all falls through; (e) non-matching URL (different domain) triggers exactly one fetch with no lifeattiktok parsing; (f) page returns non-2xx → 502. Run npm run test:coverage and confirm thresholds pass.","files_to_create":[],"files_to_modify":["__tests__/api/fetch-job-description.test.ts"],"test_file":"__tests__/api/fetch-job-description.test.ts","estimated_turns":15,"ac_items":[6]}
]
-->

- [ ] **Step 1: Add RSC parser helpers and lifeattiktok/joinbytedance handler to route.ts** (~20 turns) — Create real HTML fixtures; add `extractRscPayloads`, `extractRscLabelValue`, `extractEditorContentFromRsc`, `extractLifeAtTikTokFromPage` helpers; wire `isLifeAtTikTok` detection and handler block into `POST`; update the ATS CLAUDE.md.
- [ ] **Step 2: Write tests for lifeattiktok/joinbytedance handler** (~15 turns) — Add full ATS-checklist test suite loading both real fixtures; cover happy paths for both hostnames, USDS fallback, missing RSC, non-matching URL, and 502 error; run `npm run test:coverage` and confirm thresholds pass.

Step 2 depends on Step 1 (fixtures must exist before tests can import them).

## Design decisions

**Post-fetch handler, not pre-fetch**: Both Workday and Uber are post-fetch (parse after the route's generic `fetch` call). This handler follows the same pattern because the page is already fetched by the main pipeline and the 500 KB truncation limit is not a concern (pages are ~130 KB). A pre-fetch approach would duplicate the fetch call for no benefit.

**T-payload hex-length for description extraction, not balanced-div traversal**: The RSC wire format embeds an exact byte length in the `<id>:T<hex>,` prefix immediately before the `editor-content` div. Using that length (`parseInt(hexLen, 16)` + `slice`) is O(1) and correct even if the description HTML contains arbitrarily nested divs. A balanced-div traversal would require iterating character by character and can fail on self-closing tags or malformed HTML. The T-payload approach was confirmed against both real pages.

**Regex over full RSC parser for label/value extraction**: The metadata rows (Location, Employment Type, Job Code) appear in a structurally stable sibling-`<p>` pattern that has been consistent across both sites over multiple fetches. A full RSC JSON parser would require significantly more code and would be harder to maintain; the regex is simpler and the pattern is stable. If the sites restructure their component tree, the fallback is `extractJobContent` — the same worst-case behaviour as before this feature.

**`buildMetaTable` reuse, not a new `buildLifeAtTikTokMeta`**: `buildMetaTable(title, rows)` is the generic metadata-table builder already used by every ATS handler. Creating a named `buildLifeAtTikTokMeta` wrapper would violate the no-duplication rule and the no-unnecessary-abstraction rule. The rows array is assembled inline in `extractLifeAtTikTokFromPage`.

**`decodeHtmlEntities` applied to description**: The `editor-content` div uses numeric character references (e.g. `&#8203;` for zero-width space) as part of its content. Consistent with the Greenhouse and Uber handlers, `decodeHtmlEntities` is called on the extracted HTML before returning, so entities are resolved to characters. The description content is raw HTML (not double-encoded), so the decoding pass is light.

**Two separate fixture files (one per hostname)**: Although the sites share identical structure, separate fixtures confirm that the handler actually resolves each domain independently and prevents a future regression where one hostname detection branch silently stops working.

## Acceptance criteria

- [ ] **1.** Given a mocked fetch returning the `lifeattiktok-job.html` fixture for a `lifeattiktok.com/search/{id}` URL, `POST /api/fetch-job-description` returns 200 with HTML containing an `<h1>` whose text matches the real fixture's job title and a `<table>` row containing the real fixture's Location value.
- [ ] **2.** Given a mocked fetch returning the `joinbytedance-job.html` fixture for a `joinbytedance.com/search/{id}` URL, `POST /api/fetch-job-description` returns 200 with HTML containing the job title `<h1>` and Location metadata from the real fixture.
- [ ] **3.** Given a mocked fetch returning HTML that has RSC metadata rows but no `editor-content` T-payload (synthetic USDS case), the handler falls through and returns the output of `extractJobContent` on that HTML (body text, not the structured metadata).
- [ ] **4.** Given a mocked fetch returning an HTML page with no `self.__next_f.push` calls at all, the handler falls through and returns `extractJobContent` output.
- [ ] **5.** A non-lifeattiktok/joinbytedance URL triggers exactly one `fetch` call to the original URL (no extra fetch to a lifeattiktok endpoint).
- [ ] **6.** The ApplicationModal's "Import from URL" field, when called with a mocked `/api/fetch-job-description` response containing lifeattiktok-style HTML, shows the job title in the Title field and the description in the Notes/Description field. *(Tested via `page.route()` interception in E2E.)*

## Human verification steps

- Paste `https://lifeattiktok.com/search/7602378131098831157` into the job import field on a running dev instance and confirm the extracted output contains the title "(General Hire) Backend Software Engineer - Trust and Safety", "Seattle" in Location, "Regular" in Employment Type, "A250153" in Job Code, and the full body description without navigation/footer noise.
- Paste `https://joinbytedance.com/search/7256932480371837240` and confirm "Senior Research Scientist, Intelligent Editing (Multimodality)", "Seattle", "Regular", "A257435" are present and the description is clean.
- Confirm that a USDS job URL on lifeattiktok.com (if one can be located) does not cause a 500 — the response should be the noisy generic extraction, same as before this change.

## Open questions

None — all structural and reachability questions were resolved by live fetches and RSC payload inspection during design.
