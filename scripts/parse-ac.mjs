#!/usr/bin/env node
// Parse the "## Acceptance criteria" section of a GitHub issue body.
// Used by .github/actions/verify-ac to (1) extract the AC text for prompt
// generation and (2) tick the AC checkboxes after verification passes.

const AC_SECTION_RE = /(## Acceptance criteria\n)([\s\S]*?)(?=\n## |$)/

export function extractAcceptanceCriteria(body) {
  const m = body.match(AC_SECTION_RE)
  return m ? m[2].trim() : ''
}

export function tickAcceptanceCriteria(body) {
  return body.replace(
    AC_SECTION_RE,
    (_match, header, section) => header + section.replace(/- \[ \]/g, '- [x]'),
  )
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf-8')
}

const invokedFromCli = import.meta.url === `file://${process.argv[1]}`
if (invokedFromCli) {
  const cmd = process.argv[2]
  readStdin().then((body) => {
    if (cmd === 'extract') {
      process.stdout.write(extractAcceptanceCriteria(body))
    } else if (cmd === 'tick') {
      process.stdout.write(tickAcceptanceCriteria(body))
    } else {
      process.stderr.write(`Usage: parse-ac.mjs <extract|tick>\n`)
      process.exit(1)
    }
  })
}
