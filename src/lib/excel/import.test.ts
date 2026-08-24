import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dateFromSheetTitle, parseRosterWorkbook } from './import'

/**
 * Runs the importer over the real spreadsheet the restaurant uses today.
 * If a future change stops understanding that file, this fails.
 */
const workbookPath = join(process.cwd(), 'docs/samples/Shan Village - Duty Roster.xlsx')
const bytes = readFileSync(workbookPath)
const parsed = parseRosterWorkbook(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
)

describe('dateFromSheetTitle', () => {
  it('reads a title that carries its own year', () => {
    expect(dateFromSheetTitle('Mar 30 to Apr 5 2026', 2025)).toBe('2026-03-30')
  })
  it('falls back to the supplied year', () => {
    expect(dateFromSheetTitle('June 1 - June 7', 2026)).toBe('2026-06-01')
  })
  it('tolerates a leading space', () => {
    expect(dateFromSheetTitle(' Aug 24 - Aug 30', 2026)).toBe('2026-08-24')
  })
  it('returns null when there is no month at all', () => {
    expect(dateFromSheetTitle('Sheet1', 2026)).toBeNull()
  })
})

describe('parseRosterWorkbook — the real duty roster', () => {
  it('finds every weekly sheet', () => {
    expect(parsed.summary.sheets).toHaveLength(22)
    expect(parsed.summary.sheets.every((s) => s.startDate !== null)).toBe(true)
  })

  it('reads a date for every sheet, from the date row where there is one', () => {
    const fromRow = parsed.summary.sheets.filter((s) => s.dateSource === 'row')
    const fromTitle = parsed.summary.sheets.filter((s) => s.dateSource === 'title')
    expect(fromRow.length).toBe(20)
    // The two earliest sheets have no date row; their dates come from the tab name.
    expect(fromTitle.length).toBe(2)
    expect(fromTitle.map((s) => s.startDate)).toEqual(['2026-03-30', '2026-04-06'])
  })

  it('flags the sheets whose tab name disagrees with the dates inside', () => {
    const mismatched = parsed.summary.sheets.filter((s) => s.titleMismatch)
    expect(mismatched.length).toBeGreaterThan(0)
    expect(mismatched.map((s) => s.sheetName)).toContain('May 11 - May 17 2026')
  })

  it('extracts the section banners as outlets', () => {
    expect(parsed.summary.outlets).toContain('MALL')
    expect(parsed.summary.outlets).toContain('NIGHT MARKET')
  })

  it('never treats a section banner as an employee', () => {
    expect(parsed.summary.names.map((n) => n.name)).not.toContain('MALL')
    expect(parsed.summary.names.map((n) => n.name)).not.toContain('NIGHT MARKET')
  })

  it('spots the same person spelled two different ways', () => {
    const flattened = parsed.summary.possibleDuplicateNames.flat().map((n) => n.trim().toLowerCase())
    expect(flattened).toContain('phyu sin maung')
    expect(parsed.summary.possibleDuplicateNames.length).toBeGreaterThan(0)
  })

  it('refuses to read a shift string as a position', () => {
    expect(parsed.summary.positions.map((p) => p.name)).not.toContain('8:00  - 20:00')
    expect(parsed.summary.warnings.some((w) => w.includes('Position column'))).toBe(true)
  })

  it('recognises the real positions', () => {
    const names = parsed.summary.positions.map((p) => p.name)
    expect(names).toContain('K.H')
    expect(names).toContain('Cashier')
    expect(names).toContain('Team Leader')
    expect(names).toContain('Admin/ Purchasing')
  })

  it('produces a dated cell for every shift it reads', () => {
    expect(parsed.cells.length).toBeGreaterThan(1000)
    expect(parsed.cells.every((c) => c.workDate !== null)).toBe(true)
    expect(parsed.cells.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.workDate!))).toBe(true)
  })

  it('keeps the original cell text on every record', () => {
    expect(parsed.cells.every((c) => c.sourceValue.length > 0)).toBe(true)
  })

  it('understands the overwhelming majority without review', () => {
    const rate = parsed.summary.okCells / parsed.summary.totalCells
    expect(rate).toBeGreaterThan(0.95)
  })

  it('lists exactly the values that need a human decision', () => {
    const values = parsed.summary.unknownValues.map((u) => u.value.trim())
    expect(values).toContain('Leave')
    expect(parsed.summary.unknownValues.length).toBeLessThan(15)
  })

  it('assigns dates in weekly order within a sheet', () => {
    const august = parsed.cells.filter((c) => c.sheetName === ' Aug 24 - Aug 30')
    const dates = [...new Set(august.map((c) => c.workDate))].sort()
    expect(dates[0]).toBe('2026-08-24')
    expect(dates.at(-1)).toBe('2026-08-30')
  })

  it('carries the outlet section down to the rows beneath it', () => {
    const mall = parsed.cells.filter((c) => c.sourceOutlet === 'MALL')
    const nightMarket = parsed.cells.filter((c) => c.sourceOutlet === 'NIGHT MARKET')
    expect(mall.length).toBeGreaterThan(0)
    expect(nightMarket.length).toBeGreaterThan(0)
  })

  it('reads a known overnight shift correctly', () => {
    const overnight = parsed.cells.find((c) => c.sourceValue.trim() === '16:00 - 2:00')
    expect(overnight?.parsed).toMatchObject({
      status: 'WORK',
      startTime: '16:00',
      endTime: '02:00',
      crossesMidnight: true,
    })
  })

  it('reads a known split shift correctly', () => {
    const split = parsed.cells.find((c) => c.sourceValue.trim() === '9-14 - 19-24')
    expect(split?.parsed).toMatchObject({
      status: 'WORK',
      isSplit: true,
      startTime: '09:00',
      endTime: '14:00',
      segment2Start: '19:00',
      segment2End: '00:00',
    })
  })

  it('captures the extra-hours column alongside the shift', () => {
    expect(parsed.cells.some((c) => c.extraHours !== null && c.extraHours > 0)).toBe(true)
  })
})
