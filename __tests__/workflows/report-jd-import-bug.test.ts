import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '../..')

describe('report-jd-import-bug workflow infrastructure [AC-705]', () => {
  it('feature-design.yml and feature-implement.yml accept workflow_call trigger [AC-705-1]', () => {
    const design = readFileSync(join(root, '.github/workflows/feature-design.yml'), 'utf-8')
    const implement = readFileSync(join(root, '.github/workflows/feature-implement.yml'), 'utf-8')
    expect(design).toContain('workflow_call:')
    expect(implement).toContain('workflow_call:')
  })

  it('report-jd-import-bug.yml investigate job outputs issue_number [AC-705-2]', () => {
    const content = readFileSync(join(root, '.github/workflows/report-jd-import-bug.yml'), 'utf-8')
    expect(content).toContain('outputs:')
    expect(content).toContain('issue_number:')
    expect(content).toContain('/tmp/issue_number.txt')
  })

  it('report-jd-import-bug.yml chains design and implement via workflow_call with secrets: inherit [AC-705-3]', () => {
    const content = readFileSync(join(root, '.github/workflows/report-jd-import-bug.yml'), 'utf-8')
    expect(content).toContain('feature-design.yml')
    expect(content).toContain('feature-implement.yml')
    expect(content).toContain('secrets: inherit')
    expect(content).toContain('needs: [investigate, design]')
  })

  it('skill triggers the workflow and reports the run URL [AC-705-4]', () => {
    const content = readFileSync(join(root, '.claude/commands/report-jd-import-bug.md'), 'utf-8')
    expect(content).toContain('gh workflow run report-jd-import-bug.yml')
    expect(content).toContain('gh run list')
    expect(content).toContain('url')
  })

  it('CLAUDE.md AC tagging covers any issue with Acceptance criteria, not just design issues [AC-705-5]', () => {
    const content = readFileSync(join(root, 'CLAUDE.md'), 'utf-8')
    expect(content).toContain('Any issue with an `## Acceptance criteria` section')
    expect(content).not.toContain('from a design issue (one with `<!-- implementation-plan-json -->`)')
  })
})
