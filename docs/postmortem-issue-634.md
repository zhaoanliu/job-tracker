# Post-mortem: Silent Sentry Regression Exposed by Next.js v15.5.18 Upgrade

**Sentry issue:** JAVASCRIPT-NEXTJS-K  
**GitHub issue:** #634  
**Fix PR:** #635  
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

### Why the import was broken — cross-chunk module reference

Next.js compiles `global-error.tsx` into its own webpack chunk. The broken import caused that chunk to require Sentry's `captureException` as **module `21123`**, loaded from shared chunks `[850, 441, 826, 358]`. Sentry is NOT bundled inline into the global-error chunk — it references a module ID in the shared app bundle.

Static analysis of the production build confirms:

| State | Requires modules from shared chunks |
|---|---|
| Broken (`import * as Sentry`) | `95155` (React), `21123` **(Sentry)**, `12115` (useEffect) |
| Fixed (`console.error`) | `95155` (React), `12115` (useEffect) |

### Why it only crashed for users mid-session after the upgrade

This is a **stale cache / deployment mismatch** problem, not a webpack compilation failure. The build succeeds and the code runs fine in a fresh page load. The crash only occurs when:

1. A user has the old app loaded in their browser (old chunk hashes cached)
2. A new deployment goes out (new chunk hashes, new module IDs in shared chunks)
3. The user navigates — Next.js detects the new deployment and fetches the **new** global-error chunk
4. The new global-error chunk references module `21123` which it expects in the shared chunks
5. But the shared chunks in the browser cache are the **old** versions with different module ID mappings
6. `modules[21123]` → `undefined` → `TypeError: Cannot read properties of undefined (reading 'call')`

This is why the 12-hour session was relevant: the user loaded the dashboard before the upgrade (old chunks cached), the v15.5.18 deployment happened during their session, and the mismatch appeared only when they navigated away.

A fresh page load after the deployment would work fine — all chunks are loaded consistently from the new version. Only mid-session navigations after a deployment are affected.

### Why this cannot be reproduced in local or CI tests

Any test environment starts clean — all chunks are from the same build, so module IDs are consistent. Reproducing the crash requires loading old cached shared chunks alongside a new global-error chunk, which only occurs in production for users who were mid-session during a deployment. No `npm run build` or `vercel build` test can create that state.

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

## Upgrade Risk Pattern

When upgrading Next.js (or any bundler), check files that live in **isolated webpack chunks**:

- `app/global-error.tsx` — root error boundary, always isolated
- `app/not-found.tsx` — can be isolated depending on config
- Any file that Next.js compiles into its own chunk outside the main bundle

For each of these files, verify that all top-level imports are resolvable in isolation. If a file imports a third-party library, either replace the import with a dynamic `import()` or remove it entirely.

See CLAUDE.md → "Testing" for the required visual regression checks on rendering dependency upgrades.
