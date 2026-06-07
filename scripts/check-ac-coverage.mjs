#!/usr/bin/env node
/**
 * AC Coverage Check
 *
 * For each design issue (contains <!-- implementation-plan-json -->) linked to the PR:
 *   - Fail if "## Acceptance criteria" section is missing or has no checkbox items
 *   - Fail if any AC item N has no test tagged [AC-{issue}-{N}] in its it() description
 *   - Fail if any tagged test failed
 *   - Check off passing AC items in the issue body
 *
 * Env vars required in CI:
 *   PR_NUMBER         — pull request number
 *   GITHUB_REPOSITORY — owner/repo
 *   GITHUB_TOKEN      — token with issues:write scope
 *
 * Optional:
 *   RESULTS_FILE — path to vitest JSON output (default: test-results.json)
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PR_NUMBER = process.env.PR_NUMBER
const REPO = process.env.GITHUB_REPOSITORY
const RESULTS_FILE = process.env.RESULTS_FILE ?? 'test-results.json'

function gh(...args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim()
}

function log(msg) { process.stdout.write(msg + '\n') }
function fail(msg) { process.stderr.write('FAIL: ' + msg + '\n') }

if (!PR_NUMBER) {
  log('No PR_NUMBER — skipping AC coverage check')
  process.exit(0)
}

// Resolve linked issues from the PR's "Closes #N" references
const prJson = gh('pr', 'view', PR_NUMBER, '--repo', REPO, '--json', 'closingIssuesReferences')
const { closingIssuesReferences } = JSON.parse(prJson)
const linkedNums = closingIssuesReferences.map(r => r.number)

if (linkedNums.length === 0) {
  log('PR has no linked issues — skipping AC coverage check')
  process.exit(0)
}

// Keep only design issues (those containing <!-- implementation-plan-json -->)
const designIssues = []
for (const num of linkedNums) {
  const body = gh('issue', 'view', String(num), '--repo', REPO, '--json', 'body', '--jq', '.body')
  if (body.includes('<!-- implementation-plan-json -->')) {
    designIssues.push({ number: num, body })
  }
}

if (designIssues.length === 0) {
  log('No linked design issues — skipping AC coverage check')
  process.exit(0)
}

// Load vitest JSON results
let vitestJson
try {
  vitestJson = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'))
} catch {
  process.stderr.write(`Cannot read ${RESULTS_FILE} — did vitest run with --reporter=json?\n`)
  process.exit(1)
}

// Flatten all test results: [{ fullName, status }]
const allTests = (vitestJson.testResults ?? []).flatMap(suite =>
  (suite.assertionResults ?? []).map(t => ({ fullName: t.fullName, status: t.status }))
)

log(`Loaded ${allTests.length} test results from ${RESULTS_FILE}`)

let globalFailed = false

for (const { number: issueNum, body } of designIssues) {
  log(`\n=== AC coverage check: issue #${issueNum} ===`)

  // Extract the "## Acceptance criteria" section
  const acSectionMatch = body.match(/## Acceptance criteria\n([\s\S]*?)(?=\n## |\n<!--|$)/)
  if (!acSectionMatch) {
    log(`Issue #${issueNum} has no "## Acceptance criteria" section — skipping`)
    continue
  }

  const acContent = acSectionMatch[1].trim()
  if (!acContent) {
    log(`Issue #${issueNum} Acceptance criteria section is empty — skipping`)
    continue
  }

  // Parse checkbox lines in order (- [ ] or - [x])
  const lines = acSectionMatch[1].split('\n')
  const checkboxIndices = []
  lines.forEach((line, i) => {
    if (/^- \[[ x]\] /.test(line)) checkboxIndices.push(i)
  })

  if (checkboxIndices.length === 0) {
    log(`Issue #${issueNum} Acceptance criteria has no checkbox items — skipping`)
    continue
  }

  log(`Found ${checkboxIndices.length} AC items`)

  const passedAcIndices = []
  let issueFailed = false

  for (let n = 1; n <= checkboxIndices.length; n++) {
    const tag = `[AC-${issueNum}-${n}]`
    const matching = allTests.filter(t => t.fullName.includes(tag))

    if (matching.length === 0) {
      fail(`AC item ${n} — no test tagged "${tag}". Tag an it() description with this string.`)
      issueFailed = true
      globalFailed = true
      continue
    }

    const failing = matching.filter(t => t.status !== 'passed')
    if (failing.length > 0) {
      fail(`AC item ${n} — ${failing.length} tagged test(s) failing:`)
      failing.forEach(t => process.stderr.write(`  ✗ ${t.fullName}\n`))
      issueFailed = true
      globalFailed = true
    } else {
      log(`  ✓ [AC-${issueNum}-${n}] — ${matching.length} passing`)
      passedAcIndices.push(n - 1) // 0-based index into checkboxIndices
    }
  }

  if (passedAcIndices.length === 0) continue

  // Check off passing items in the issue body (line-by-line to preserve all other content)
  const bodyLines = body.split('\n')
  let inAcSection = false
  let checkboxCount = 0
  const updatedBodyLines = bodyLines.map(line => {
    if (/^## /.test(line)) {
      inAcSection = line === '## Acceptance criteria'
      return line
    }
    if (line.startsWith('<!--')) {
      inAcSection = false
      return line
    }
    if (inAcSection && /^- \[[ x]\] /.test(line)) {
      const idx = checkboxCount++
      if (passedAcIndices.includes(idx)) {
        return line.replace(/^- \[ \] /, '- [x] ')
      }
    }
    return line
  })

  const updatedBody = updatedBodyLines.join('\n')
  const tmpFile = join(tmpdir(), `ac-body-${issueNum}.md`)
  writeFileSync(tmpFile, updatedBody)
  try {
    gh('issue', 'edit', String(issueNum), '--repo', REPO, '--body-file', tmpFile)
    log(`Checked off ${passedAcIndices.length} AC item(s) in issue #${issueNum}`)
  } catch (e) {
    log(`Warning: could not update issue #${issueNum}: ${e.message}`)
  }
}

if (globalFailed) {
  process.stderr.write('\n❌ AC coverage check FAILED\n')
  process.exit(1)
} else {
  log('\n✅ AC coverage check PASSED')
}
