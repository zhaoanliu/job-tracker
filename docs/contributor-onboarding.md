# ApplyTrackr Contributor Onboarding

Nov 20, 2026 · @Zhaoan Liu

## Why you're here

ApplyTrackr is your playground for three things: learning how real software gets built, getting fluent at building with AI, and owning work you can put on your internship resume.

- **Learn the SDLC by doing it.** Every change here goes through the same loop a real team uses: issue, design, code, test, review, deploy, monitor.
- **Get comfortable building with AI.** Here, using AI coding tools well *is* the skill you're practicing. School rules about AI don't apply to this project. What does apply: you understand and can explain everything you merge.
- **Own something real.** By the end you should have one feature you designed, built, measured and can talk about for 20 minutes in an interview.
- **Build the product you'd want.** You're a real ApplyTrackr user now. Your annoyances with it are valid feature requests.

## House rules

Two rules matter most: understand what you merge, and nothing lands on `main` without a PR.

1. **Use AI freely, and stay in charge of it.** Before changing anything, have the AI explain the code. Ask it for a plan before it writes code, and push back on the plan. Read every line of the diff. If you can't explain a line, don't commit it.
2. **Write the PR description yourself.** Cover what changed, why, how you tested it, and anything you're unsure about. Writing it is where most of the learning happens, and it's your interview prep.
3. **Work through issues.** Assign yourself before you start, so we never both work on the same thing. If something new comes up, open an issue for it.
4. **Branch per issue.** Name branches `<issue#>-short-desc` (for example, `57-url-autofill`). Never commit directly to `main`.
5. **Link PRs to issues.** Put `Fixes #N` in the PR description so the issue closes on merge.
6. **Get CI green before review.** If CI fails, read the log before asking for help. Debugging CI is part of the job.
7. **Get stuck for a while before asking.** Spend at least 30 minutes on a problem (with AI help) before pinging a maintainer. When you do ask, say what you tried.
8. **Weekly 30-minute sync with a maintainer.** Go over what you shipped, what's blocking you, and what's next. Everything else happens in issue and PR comments.

## The SDLC, mapped to ApplyTrackr

The software development lifecycle is the loop every change goes around, from a one-line fix to a whole new feature. Here, each stage has a concrete home in the repo.

&#91;embedded content: SDLC loop · 7 stages\]

Small fixes skip the design doc. Everything else goes around the whole loop, and what Sentry and the budget audit show you becomes the next issue.

## Phase 1: starter work (weeks 1–3)

Start with the PRs and feature requests that are already open. They're small, CI tells you right away if you broke something, and they make you read code you didn't write.

- [ ] Get access: accept the collaborator invite, clone the repo, and get the app and its tests running locally
- [ ] Read the README and skim the repo with an AI assistant: "walk me through how a request flows through this codebase"
- [ ] Review one open bot PR: what changed, why CI passes or fails, and whether it's safe to merge. Write your review as a PR comment.
- [ ] Fix one failing bot PR (for example, a dependency bump that breaks a test)
- [ ] Pick one small open feature request, assign it to yourself, and ship it end to end
- [ ] Pair with a maintainer once on a review of one of their PRs, and leave at least one real comment
- [ ] Open one new issue from your own experience using ApplyTrackr

Phase 1 is done when you've merged three PRs and each PR description explains the change in your own words.

## Phase 2: own "add from URL" (months 1–3)

Your feature: paste a job posting URL, and ApplyTrackr fills in company, title, location, salary range, and the posting date for you. You review the fields and save. This comes from your own pain as a user, it touches real AI engineering, and it gives you numbers you can measure.

**Suggested design.** Validate these choices in your design doc:

1. **Fetch the page.** Plenty of job pages render with JavaScript or sit behind a login (LinkedIn especially). Decide what happens when the fetch fails: a clear error and a fallback to manual entry.
2. **Try structured data first.** Many job pages embed schema.org `JobPosting` JSON-LD. Parsing it costs nothing and is deterministic. Check how many of your test URLs actually have it.
3. **Fall back to an LLM.** Send the cleaned page text to Claude and ask for structured output that matches the fields. Route it through `model_router.py`: extraction is a good candidate for the cheapest model. Measure whether that holds up.
4. **Keep a human in the loop.** Never save auto-filled data silently. Show the fields, highlight the ones with low confidence, and let the user correct them.

**Tests and evals.**

- Save 30–50 real posting pages as HTML fixtures. Pick a mix of ATS sites and company career pages.
- Hand-label the correct fields for each fixture. That's your eval set.
- Unit tests run against the fixtures, so there are no network calls in CI.
- Make an eval script that reports field accuracy, cost per extraction, and latency, comparing JSON-LD only against JSON-LD + LLM fallback.

**What "done" looks like.** It's merged behind a feature flag, the eval numbers are in the PR, the budget auditor tracks its spend, and errors show up in Sentry.

**Open questions for your design doc:** What fields does the form actually need? What should happen with a duplicate URL? Is fetching each site allowed by its terms?

## Phase 3: mobile app (after Phase 2 ships)

Build the mobile app *after* add-from-URL, because the app's best feature depends on it: you see a job in LinkedIn or a browser on your phone, tap **Share → ApplyTrackr**, and it's tracked, with the fields already filled in.

**Prerequisite:** the app needs an API it can call (auth, list/add/update applications, the autofill endpoint). If ApplyTrackr doesn't expose one yet, designing and building that API is the first milestone of this phase, and it's a strong resume item on its own.

| Approach | Platforms | Language | Fit for you |
| --- | --- | --- | --- |
| React Native + Expo | iOS + Android, one codebase | TypeScript | Recommended: one codebase, large ecosystem, share-sheet support, easy test builds on a real phone |
| Flutter | iOS + Android, one codebase | Dart | Also good; a new language, but its strong typing will feel familiar coming from Java |
| Native Kotlin (Android) | Android only | Kotlin | Closest to your Java, but iOS would be a second app |
| Installable web app (PWA) | Any browser | Existing web stack | Cheapest first step, but limited share-sheet integration and no app store listing |

**Milestones:**

1. A design doc covering screens, API contract, auth, and offline behavior
2. The API, with tests
3. The app on your own phone through internal testing (Expo Go or a dev build)
4. The share-to-ApplyTrackr flow
5. A beta through TestFlight (iOS) and Play internal testing (Android)
6. Store submission (optional). Both stores need paid developer accounts and go through review, so plan for a rejection or two.

Publishing to the stores is a nice-to-have. A working app in beta with real users (contributors and a few friends who are job hunting) is already strong resume material.

## Design doc template

Write one for every feature bigger than a day's work, before you write code. Keep it to one or two pages, and copy this into `docs/design/<feature>.md` in a PR so a maintainer can review it like code.

```markdown
# <Feature name>

Author: <your name> · Status: Draft / In review / Approved · Issue: #N

## Problem
Who has this problem and what it costs them today (1 paragraph).

## Goals / Non-goals
- Goal: ...
- Non-goal: ... (what you are deliberately NOT doing)

## Proposed design
How it works. A diagram if there's more than one component.
API or data model changes.

## Alternatives considered
At least one other approach, and why you didn't pick it.

## Testing and evaluation
Unit tests, fixtures, eval set, and the metric that says "it works".

## Risks and open questions
What could go wrong; what you still need to decide.

## Rollout
Feature flag? Migration? How you'll know it's healthy (Sentry, budget audit).
```

## Resume and interviews

Claim exactly what you built, with real numbers. That's more convincing than a big claim, and it holds up when an interviewer digs into it.

**How to list it:** "ApplyTrackr (job application tracker) — Contributor", with bullets only about your own components.

**Bullet shapes.** Fill these in with your measured results, never estimates:

- Designed and built URL-based autofill for job applications in Python, combining schema.org parsing with LLM extraction (Claude) through a cost-aware model router. Reached X% field accuracy on a 50-posting eval set at $Y per extraction.
- Built a cross-platform mobile app (React Native/Expo) with a share-sheet integration, cutting time to log an application from \~Z min to under N seconds.
- Worked in a CI/CD workflow with code review, GitHub Actions, and Sentry monitoring. Triaged and merged N dependency and bug-fix PRs.

**Be ready to answer:**

- Why the JSON-LD path first, and why that model for the fallback?
- How do you know the extraction is correct? Walk me through your eval set.
- What broke in production or CI, and how did you find it?
- How did you use AI tools, and when did you *not* trust their output?

That last question is coming in 2027 interviews. "I used AI heavily, and here's how I verified its work" is a strong answer.

- [ ] Mock interview with a maintainer on your Phase 2 feature before your first real interview
