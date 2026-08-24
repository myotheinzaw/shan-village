import { describe, expect, it } from 'vitest'
import cellValues from './__fixtures__/excel-cell-values.json'
import { computeScheduledHours, parseShiftCell } from './shift'

/**
 * Every distinct day-cell value in "Shan Village - Duty Roster.xlsx", with how
 * often it occurs. This is a regression guard: if a future change to the parser
 * stops understanding a shift the restaurant actually writes, this fails.
 */
const values = cellValues as { value: string; count: number }[]

describe('the real Excel vocabulary', () => {
  it('covers every distinct cell value in the source file', () => {
    expect(values.length).toBeGreaterThan(100)
  })

  it('never throws, whatever the cell contains', () => {
    for (const { value } of values) {
      expect(() => parseShiftCell(value)).not.toThrow()
    }
  })

  it('always preserves the original text', () => {
    for (const { value } of values) {
      expect(parseShiftCell(value)?.sourceValue).toBe(value)
    }
  })

  it('understands at least 95% of all roster cells without review', () => {
    let confident = 0
    let total = 0
    const needsReview: { value: string; count: number; message: string | null }[] = []

    for (const { value, count } of values) {
      const parsed = parseShiftCell(value)
      if (!parsed) continue
      total += count
      if (parsed.confidence === 'exact') confident += count
      else needsReview.push({ value, count, message: parsed.message })
    }

    const rate = confident / total
    // Printed so the import screen's review list can be sanity-checked by eye.
    if (rate < 1) {
      console.log(
        `Cells needing review (${(100 - rate * 100).toFixed(1)}%):\n` +
          needsReview
            .sort((a, b) => b.count - a.count)
            .map((r) => `  ${String(r.count).padStart(3)}x ${JSON.stringify(r.value)} — ${r.message}`)
            .join('\n'),
      )
    }
    expect(rate).toBeGreaterThan(0.95)
  })

  it('classifies every cell into a valid status', () => {
    const valid = new Set(['WORK', 'OFF', 'PH', 'LEAVE', 'TRIAL', 'OTHER'])
    for (const { value } of values) {
      const parsed = parseShiftCell(value)
      if (parsed) expect(valid.has(parsed.status)).toBe(true)
    }
  })

  it('produces a sane number of hours for every working cell', () => {
    for (const { value } of values) {
      const parsed = parseShiftCell(value)
      if (!parsed || parsed.status !== 'WORK') continue
      const hours = computeScheduledHours(parsed)
      expect(hours).toBeGreaterThanOrEqual(0)
      // A single duty in this restaurant never legitimately exceeds 24 hours.
      expect(hours).toBeLessThanOrEqual(24)
    }
  })

  it('recognises the ten most common cells exactly', () => {
    const top = values.slice(0, 10)
    for (const { value } of top) {
      const parsed = parseShiftCell(value)
      expect(parsed, `"${value}" should parse`).not.toBeNull()
      expect(parsed!.confidence, `"${value}" should not need review`).toBe('exact')
    }
  })
})
