Trigger the JD import investigation and fix workflow for a failing URL.

Usage: /report-jd-import-bug [URL]

Parse $ARGUMENTS. If a URL is provided, run:

```bash
gh workflow run report-jd-import-bug.yml --ref main --field url="<URL>"
```

Then show the run URL so the user can watch progress:

```bash
gh run list --workflow=report-jd-import-bug.yml --limit 1 --json url --jq '.[0].url'
```

If no URL is provided, ask: "What is the URL that failed to import?"
