import { describe, it, expect } from 'vitest'
// @ts-expect-error — .mjs has no type declarations; vitest resolves it natively
import { extractAcceptanceCriteria, tickAcceptanceCriteria } from '../../scripts/parse-ac.mjs'

describe('extractAcceptanceCriteria', () => {
  it('extracts the AC section between H2 headers', () => {
    const body = [
      '## Summary',
      'Feature description.',
      '',
      '## Acceptance criteria',
      '- [ ] First criterion',
      '- [ ] Second criterion',
      '',
      '## Implementation',
      'Details here.',
    ].join('\n')
    expect(extractAcceptanceCriteria(body)).toBe(
      '- [ ] First criterion\n- [ ] Second criterion',
    )
  })

  it('extracts the AC section when it is the final H2 of the body', () => {
    const body = [
      '## Summary',
      'Feature.',
      '',
      '## Acceptance criteria',
      '- [ ] Only one item',
    ].join('\n')
    expect(extractAcceptanceCriteria(body)).toBe('- [ ] Only one item')
  })

  it('returns empty string when no AC section exists', () => {
    expect(extractAcceptanceCriteria('## Summary\nNo AC here')).toBe('')
  })

  it('returns empty string for empty body', () => {
    expect(extractAcceptanceCriteria('')).toBe('')
  })

  it('stops at the next H2 and does not consume later sections', () => {
    const body = [
      '## Acceptance criteria',
      '- [ ] A',
      '',
      '## Notes',
      '- [ ] should not be returned',
    ].join('\n')
    expect(extractAcceptanceCriteria(body)).toBe('- [ ] A')
  })

  it('preserves already-ticked items inside the section', () => {
    const body = '## Acceptance criteria\n- [x] Done\n- [ ] Pending'
    expect(extractAcceptanceCriteria(body)).toBe('- [x] Done\n- [ ] Pending')
  })
})

describe('tickAcceptanceCriteria', () => {
  it('ticks unchecked boxes inside the AC section', () => {
    const body = [
      '## Acceptance criteria',
      '- [ ] First',
      '- [ ] Second',
      '',
      '## Notes',
      '- [ ] should stay unchecked',
    ].join('\n')
    const result = tickAcceptanceCriteria(body)
    expect(result).toContain('- [x] First')
    expect(result).toContain('- [x] Second')
    expect(result).toContain('## Notes\n- [ ] should stay unchecked')
  })

  it('leaves already-ticked items unchanged', () => {
    const body = '## Acceptance criteria\n- [x] Done\n- [ ] Pending'
    const result = tickAcceptanceCriteria(body)
    expect(result).toBe('## Acceptance criteria\n- [x] Done\n- [x] Pending')
  })

  it('returns body unchanged when no AC section exists', () => {
    const body = '## Summary\n- [ ] Not in AC section'
    expect(tickAcceptanceCriteria(body)).toBe(body)
  })

  it('preserves the H2 header verbatim', () => {
    const body = '## Acceptance criteria\n- [ ] First'
    expect(tickAcceptanceCriteria(body)).toBe(
      '## Acceptance criteria\n- [x] First',
    )
  })

  it('handles empty body', () => {
    expect(tickAcceptanceCriteria('')).toBe('')
  })

  it('does not tick checkboxes outside the AC section', () => {
    const body = [
      '## Summary',
      '- [ ] Pre-AC item',
      '',
      '## Acceptance criteria',
      '- [ ] In AC',
      '',
      '## Notes',
      '- [ ] Post-AC item',
    ].join('\n')
    const result = tickAcceptanceCriteria(body)
    expect(result).toContain('- [ ] Pre-AC item')
    expect(result).toContain('- [x] In AC')
    expect(result).toContain('- [ ] Post-AC item')
  })
})
