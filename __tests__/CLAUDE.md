## Testing

Unit tests use **Vitest + jsdom + Testing Library**. E2E uses **Playwright**.

**Every fix or code change must include a corresponding test update.** If you add a function, add a unit test. If you fix a bug, add a test that would have caught it. If you change behaviour, update the existing test to reflect the new expectation.

**Adding a new tab, section, or conditional render block to a component is new behaviour — it needs tests even if the component's existing tests still pass.** The existing suite passing is not sufficient; the new section must have at least one test that exercises it.

**Updating `vitest.setup.ts` to extend a mock (e.g., adding a new method to the Supabase chain) is a signal that new component behaviour was added. Before opening a PR, verify the test file for every modified component covers that new behaviour.**

**When making any fix, explicitly evaluate each layer below in order and state your reasoning for each one — do not skip silently.** Add a guard at the earliest layer that applies:
1. **TypeScript type** — can a stricter type or removing a cast prevent this class of bug entirely?
2. **Unit test** — can a fast, local test catch a regression before it reaches CI?
3. **Lint / actionlint rule** — verify by actually running the tool; don't assume it catches something without checking.
4. **CI check** — does this need a new step in `lint.yml` to catch it on every PR?
5. **CLAUDE.md note** — if none of the above are feasible, document the gotcha so it isn't rediscovered.

For each layer you skip, say why it doesn't apply (e.g. "N/A — shell script, not TypeScript" or "actionlint tested locally, does not catch this flag"). Jumping straight to step 5 without showing the reasoning for steps 1–4 is not acceptable.

The goal is to shift failures left: a TypeScript error beats a unit test failure, which beats a CI failure, which beats a production Sentry event.

Coverage thresholds (enforced in `vitest.config.ts`):

| Metric | Threshold | Why |
|---|---|---|
| Lines | 85% | Primary signal — currently at ~97% |
| Statements | 85% | Same as lines for this codebase |
| Branches | 80% | Catches untested conditionals |
| Functions | 65% | Lower because React components have many inline arrow functions (onChange, map callbacks) that require per-field interaction tests to cover; goal is 70%+ over time |

New code that drops any metric below its threshold will fail CI. KanbanBoard, KanbanColumn, and DragOverlayCard are excluded from unit coverage because they require a real drag context — they are covered by Playwright E2E tests instead.

**Always run `npm run test:coverage` before committing — not `npm test`.** `npm test` runs Vitest without coverage and will not catch threshold failures. `npm run test:coverage` is what CI runs; running it locally is the only way to catch a coverage drop before it reaches CI. If a threshold fails, add the missing tests and re-run. Follow the same cap as the self-healing review loop: up to 2 fix cycles (3 runs total); if still failing after that, push and note the remaining gap explicitly in the PR description.

**Do not mock Supabase in integration tests** — the mock singleton caused a production incident where mocked tests passed but a real migration failed. Use real Supabase or test utilities that hit a real DB.

The global Supabase mock in `vitest.setup.ts` is only for component rendering tests where DB calls are irrelevant to what's being tested.

**`coverage/` and `test-results/` are generated output — never commit them.** Both directories are in `.gitignore`. The ci-auto-fix bot runs `npm run test:coverage` to verify its fixes; any unignored generated file gets swept into the commit. If either directory ever appears in `git status`, it means `.gitignore` is missing an entry.

**Next.js route files only allow HTTP method exports.** Any named export other than `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS` causes a build error ("is not a valid Route export field") that `tsc --noEmit` and ESLint do not catch — it only surfaces at `next build`. If a route helper needs to be tested directly, move it to `lib/` and import it from there; never export it from the route file itself.

**When a page makes multiple fetch calls, test mocks must route by URL.** If `mockFetch` returns the same data for every call, the same fixture appears in every rendered section and causes "Found multiple elements" errors. Route by URL parameter (e.g. `url.includes('labels=planned')`) so each section gets independent data. This applies any time you add a new fetch call to a page that already has tests.
