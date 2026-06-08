_Design for feature request #628: [Feature Request] Support Google OAuth login_

# Design: Support Google OAuth Login (#628)

## What the user wants

Users should be able to sign in (or create an account) using their Google account via a "Continue with Google" button on the login page. This should work alongside the existing email/password, magic link, and sign-up flows — not replace them.

## Proposed implementation

Supabase already supports Google OAuth via `supabase.auth.signInWithOAuth()`, and the existing `/auth/callback` route already handles the PKCE code exchange (`exchangeCodeForSession`) that OAuth providers return — no changes to the callback route are needed. The entire change is adding a "Continue with Google" button to `AuthForm.tsx` that calls `signInWithOAuth({ provider: 'google', redirectTo: '/auth/callback' })`, plus enabling Google as an OAuth provider in the Supabase project dashboard and registering the callback URL in the Google Cloud Console.

### Files to modify or create

- `components/auth/AuthForm.tsx` — Add a "Continue with Google" button with a divider above the email field; show in `signin`, `signup`, and `magic` modes; hide in `reset` mode.
- `__tests__/components/auth/AuthForm.test.tsx` — Add tests for button visibility per mode and `signInWithOAuth` invocation.
- `e2e/auth.spec.ts` — Add a test asserting the Google button is visible on the login page.

No new files need to be created. The existing `/app/auth/callback/route.ts` already handles OAuth code exchange and redirects to `/dashboard` — it requires no changes.

### UI changes

**Component:** `AuthForm.tsx`  
**Where:** Between the tab bar and the email input, in all modes except `reset`.  
**Appearance:** A full-width white button with the Google "G" logo (inline SVG) and the label "Continue with Google", styled consistently with the existing form. Below the button, a horizontal divider with "or" separates it from the email/password fields.  
**Interaction:** Clicking the button calls `signInWithOAuth` which triggers a browser redirect to Google's OAuth consent page. The button is disabled while loading to prevent double-clicks. After Google authentication, the user is redirected back to `/auth/callback?code=...` and then on to `/dashboard`.

## Implementation plan

<!-- implementation-plan-json
[
  {"id":1,"title":"Add Google OAuth button to AuthForm with unit tests","scope":"Add 'Continue with Google' button to AuthForm.tsx (visible in signin/signup/magic modes, hidden in reset mode), call supabase.auth.signInWithOAuth on click with provider 'google' and redirectTo pointing to /auth/callback, disable button while loading. Add unit tests for all visibility states and the signInWithOAuth call.","files_to_create":[],"files_to_modify":["components/auth/AuthForm.tsx","__tests__/components/auth/AuthForm.test.tsx"],"test_file":"__tests__/components/auth/AuthForm.test.tsx","estimated_turns":15,"ac_items":[1,2,3,4,5]},
  {"id":2,"title":"Add E2E test for Google OAuth button visibility","scope":"Add a Playwright test to e2e/auth.spec.ts that asserts the 'Continue with Google' button is visible on /login. Note: actual Google sign-in flow requires a live Google account and cannot be automated in CI — visibility and click-through to Supabase OAuth URL is the automatable boundary.","files_to_create":[],"files_to_modify":["e2e/auth.spec.ts"],"test_file":"e2e/auth.spec.ts","estimated_turns":10,"ac_items":[]}
]
-->

- [ ] **Step 1: Add Google OAuth button to AuthForm with unit tests** (~15 turns) — Add the "Continue with Google" button to `AuthForm.tsx` covering all visibility/interaction cases, with corresponding unit tests.
- [ ] **Step 2: Add E2E test for Google OAuth button visibility** (~10 turns) — Extend `e2e/auth.spec.ts` to assert the Google button is visible on the login page. (Step 2 depends on Step 1.)

## Design decisions

**Button placement above the email field (not below the submit button):** Social auth above email/password is the established convention (Google, GitHub, most SaaS login pages). Placing it below the submit button would bury it and signal it's secondary. The alternative — placing it below — was rejected because it contradicts user expectations built by virtually every other site they've used.

**Visible in `signin`, `signup`, and `magic` modes; hidden in `reset`:** Google OAuth is an authentication mechanism, not a password reset mechanism. Showing it in `reset` mode would confuse users who arrived there specifically to recover a password-based account. The three "get me in" modes all benefit from a social login option. The `magic` tab is included because magic-link users are typically low-friction users who would also appreciate Google.

**Reuse existing `/auth/callback` route without modification:** The route already calls `exchangeCodeForSession(code)` — which is exactly the PKCE handler that Supabase's `signInWithOAuth` relies on. No route-level changes are needed. An alternative would have been to create a dedicated `/auth/google/callback` route, but that duplicates logic that's already correctly implemented and would require registering a different redirect URI in Google Cloud Console.

**Inline SVG for the Google "G" logo rather than a third-party icon library:** Adding a dependency (`react-icons`, `lucide-react`) for a single icon is disproportionate. The official Google "G" logo is a small, stable SVG that can be inlined directly in the button. No new package dependency is introduced.

**`signInWithOAuth` is called from the client component without a server action:** The OAuth redirect is inherently a browser-side operation (Supabase redirects the browser to Google). A server action adds latency and complexity with no benefit — the Supabase JS client already handles PKCE code verifier generation on the client side. The existing `signInWithPassword` and `signInWithOtp` calls in `AuthForm.tsx` follow the same client-side pattern.

## Acceptance criteria

- [ ] **1.** The "Continue with Google" button is visible on `/login` in the default sign-in mode.
- [ ] **2.** The "Continue with Google" button is visible after switching to the "Sign Up" tab.
- [ ] **3.** The "Continue with Google" button is visible after switching to the "Magic Link" tab.
- [ ] **4.** The "Continue with Google" button is NOT visible after clicking "Forgot password?" (reset mode).
- [ ] **5.** Clicking "Continue with Google" calls `supabase.auth.signInWithOAuth` with `{ provider: 'google', options: { redirectTo: expect.stringContaining('/auth/callback') } }`.

## Human verification steps

- Sign in to Google at the live app (https://applytrackr.app) using a real Google account and confirm you are redirected to `/dashboard` after OAuth consent.
- Sign up for a new account via Google OAuth and confirm the account is created (appears in Supabase Auth dashboard).
- Confirm the Google OAuth provider is enabled in the Supabase project dashboard (Authentication → Providers → Google).
- Confirm the authorized redirect URI `https://applytrackr.app/auth/callback` (and the Supabase callback URL shown in the dashboard) is registered in the Google Cloud Console OAuth credentials.

## Open questions

None.
