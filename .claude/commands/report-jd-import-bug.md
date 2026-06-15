Report a JD URL import failure as a GitHub bug issue. The auto-fix bot fetches the URL itself to investigate — only the URL is needed.

Usage: /report-jd-import-bug [URL]

Steps:
1. Parse $ARGUMENTS. If a URL is provided, use it. If not, ask: "What is the URL that failed to import?"
2. Extract the hostname from the URL (e.g. `www.shopify.com`, `stripe.com`, `amazon.jobs`).
3. Build the issue title:
   - Default: `fix: JD import fails for <hostname>`
   - If the URL has a distinctive query param or path pattern (e.g. `?ashby_jid=`, `/jobs/listing/`, `/career-openings/`), include it: `fix: JD import fails for <hostname> (<pattern>)`
4. Create the issue:
   - Title: as built above
   - Labels: `bug`
   - Body: `**URL that fails:** \`<url>\``
   - Command: `gh issue create --title "<title>" --label "bug" --body "**URL that fails:** \`<url>\`"`
   - Capture the issue number from the URL printed to stdout.
5. Report the issue URL and number to the user.
6. Do NOT implement a fix in the current session — the auto-fix bot picks this up automatically.
