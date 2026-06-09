# Post-mortem: Silent Sentry Regression Exposed by Next.js v15.5.18 Upgrade

**Sentry issue:** JAVASCRIPT-NEXTJS-K  
**GitHub issue:** #634  
**Fix PR:** #635  
**Prevention PR:** #647  
**Upgrade PR:** #621  
**Date of incident:** 2026-06-08  

---

## Summary

A static `import * as Sentry from '@sentry/nextjs'` in `app/global-error.tsx` had been broken since Sentry was first integrated (2026-05-17), but was silently masked by the older Next.js webpack bundler. The Next.js v15.5.18 upgrade (PR #621, merged 03:39 UTC on 2026-06-08) tightened isolated chunk compilation, exposing the unresolvable import. The first user to navigate away from the dashboard after the deployment hit the crash at 17:44 UTC the same day.

---

## Timeline

| Time (UTC) | Event |
|---|---|
| 2026-05-17 | Sentry integrated. `global-error.tsx` created with `import * as Sentry from '@sentry/nextjs'`. Bug is present but dormant — old Next.js masks it. |
| 2026-06-08 03:39 | PR #621 merges. Next.js upgraded to v15.5.18. New webpack behavior exposes the broken import. |
| 2026-06-08 05:34 | Affected user loads the dashboard. Their browser caches the old chunks from before the deployment. |
| 2026-06-08 17:44:32 | User clicks logout. |
| 2026-06-08 17:44:33 | Supabase `signOut` completes (HTTP 204). |
| 2026-06-08 17:44:34.433 | Next.js fetches the `/login` RSC payload. Server responds HTTP 200 — the network is fine. |
| 2026-06-08 17:44:34.442 | Next.js loads fresh post-deployment chunks for `/login`, including the new `global-error.tsx` chunk. Webpack tries to initialize the Sentry module — `modules[moduleId]` is `undefined` — and throws: `TypeError: Cannot read properties of undefined (reading 'call')`. Next.js catches it and logs the misleading message: *"Failed to fetch RSC payload for /login. Falling back to browser navigation."* |
| 2026-06-08 17:44:34.442 | `captureConsoleIntegration` picks up the `console.error` and sends it to Sentry as issue JAVASCRIPT-NEXTJS-K. Sentry opens GitHub issue #634. |
| 2026-06-08 18:03 | PR #635 merges. `global-error.tsx` fixed. |

---

## Root Cause

### Why the import was broken

Next.js compiles `global-error.tsx` into its own **isolated webpack chunk**, separate from the main app bundle. This isolation is intentional — the crash handler must work even when the rest of the app is broken. Inside an isolated chunk, webpack can only include modules that are explicitly bundled into that chunk. `@sentry/nextjs` has many transitive dependencies that webpack could not resolve within the isolation boundary, so `modules[20873]` (the Sentry module ID) was registered as `undefined`.

### Why it only started crashing after the upgrade

The broken import had been in the code since 2026-05-17 (the original Sentry integration). Older Next.js compiled or loaded `global-error.tsx` in a way that didn't trigger the module resolution failure — either the isolation boundary was less strict, or the chunk loading order was different. The v15.5.18 upgrade changed this behaviour, making the failure immediate.

### Why it looked like a network error

Next.js emits "Failed to fetch RSC payload" as a catch-all error message whenever anything goes wrong during a client-side navigation, including JavaScript crashes during chunk processing. The RSC fetch itself succeeded (HTTP 200). The crash was purely a JavaScript module resolution failure, not a network problem.

### Why it only appeared once in Sentry

The client-side Sentry sample rate is set to 10% (`tracesSampleRate: 0.1`). The incident likely affected more than one user; only 10% of events are sent to Sentry.

---

## The Fix

`app/global-error.tsx` — remove the static Sentry import and replace `Sentry.captureException` with `console.error`:

```ts
// Before
import * as Sentry from '@sentry/nextjs'
useEffect(() => { Sentry.captureException(error) }, [error])

// After
useEffect(() => { console.error(error) }, [error])
```

`captureConsoleIntegration` configured in `instrumentation-client.ts` already forwards every `console.error` to Sentry automatically. No error reporting was lost.

---

## Lessons Learned

### 1. `global-error.tsx` must never import third-party libraries statically

Because it lives in an isolated webpack chunk, it cannot pull in packages with transitive dependencies. Only browser built-ins and React itself are safe. Any library call must use a dynamic `import()` inside the function body, or be replaced with a primitive (`console.error`) that the instrumentation layer can capture.

### 2. Next.js upgrades can expose silently broken chunk patterns

Webpack bundling behaviour — especially around isolated chunks like `global-error.tsx` — can change between Next.js minor versions without appearing in changelogs. A pattern that compiles silently in one version may start crashing in the next. Visual regression tests do not catch this class of failure.

### 3. "Failed to fetch RSC payload" does not mean a network failure

This Next.js message is emitted for any error during RSC navigation processing, including JavaScript crashes. Always check the attached error and stack trace before assuming a network problem.

---

## Prevention

Two layers were added in PR #647 to catch this class of bug before it reaches production.

### ESLint rule — catches the bad import at author time

`.eslintrc.json` now bans static third-party imports in `global-error.tsx` and `not-found.tsx`. This fires on every PR, before Vercel ever sees the code. It won't catch a future library that isn't yet in the deny-list, but it prevents the exact pattern that caused this incident from reappearing.

### Production-build e2e test — catches runtime failures the ESLint rule cannot

`e2e-local.yml` now runs against a production build (`npm run build && npm start`) via `playwright.config.local.ts`, instead of the dev server. The dev server loads each module individually and never creates isolated webpack chunks — the broken Sentry import would have been invisible in dev.

A logout test in `e2e/local/auth.spec.ts` installs a `page.on('console')` listener and asserts that no `"Failed to fetch RSC payload"` errors appear during navigation. With the broken import, Next.js logs exactly that message as a side-effect of the `TypeError`. With `console.error(error)`, the test passes.

This catches any "works in dev, breaks in prod" isolated-chunk failure that the ESLint rule misses — for example, a new file compiled into its own chunk, or a gap in the deny-list.

**What neither layer catches:** a user already mid-session when a new deployment changes shared chunk hashes. Old chunks stay cached; the new isolated chunk loads; module IDs mismatch → `TypeError`. That scenario is un-testable in CI.

---

## Upgrade Risk Pattern

When upgrading Next.js (or any bundler), check files that live in **isolated webpack chunks**:

- `app/global-error.tsx` — root error boundary, always isolated
- `app/not-found.tsx` — can be isolated depending on config
- Any file that Next.js compiles into its own chunk outside the main bundle

For each of these files, verify that all top-level imports are resolvable in isolation. If a file imports a third-party library, either replace the import with a dynamic `import()` or remove it entirely.

See CLAUDE.md → "Testing" for the required visual regression checks on rendering dependency upgrades.
