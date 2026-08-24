import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildWastageWorkbook,
  countUnpriced,
  entryHeaders,
  entryRow,
  reportFileName,
  summariseByOutlet,
  summariseByReason,
  totalValue,
  type WastageReportData,
  type WastageReportEntry,
} from './workbook'

function entry(overrides: Partial<WastageReportEntry> = {}): WastageReportEntry {
  return {
    reference: 'WS-2026-00001',
    time: '14:05',
    outlet: 'Mall',
    item: 'Chicken curry',
    quantity: 2,
    unit: 'tray',
    reason: 'Over-production',
    reportedBy: 'Phyu Sin Maung',
    estimatedValue: 40,
    status: 'SUBMITTED',
    source: 'PUBLIC_LINK',
    note: 'Cooked too much for the lunch service',
    photoUrl: null,
    ...overrides,
  }
}

describe('wastage totals', () => {
  it('adds up the estimated values', () => {
    expect(totalValue([entry(), entry({ estimatedValue: 12.5 })])).toBe(52.5)
  })

  it('treats a missing price as nothing rather than guessing', () => {
    expect(totalValue([entry({ estimatedValue: null }), entry({ estimatedValue: 10 })])).toBe(10)
    expect(countUnpriced([entry({ estimatedValue: null }), entry({ estimatedValue: 10 })])).toBe(1)
  })

  it('leaves rejected entries out of every total', () => {
    const entries = [entry({ estimatedValue: 100, status: 'REJECTED' }), entry({ estimatedValue: 5 })]
    expect(totalValue(entries)).toBe(5)
    expect(countUnpriced(entries)).toBe(0)
    expect(summariseByReason(entries).reduce((sum, row) => sum + row.count, 0)).toBe(1)
  })

  it('avoids floating point drift across many small entries', () => {
    const entries = Array.from({ length: 3 }, () => entry({ estimatedValue: 0.1 }))
    expect(totalValue(entries)).toBe(0.3)
  })
})

describe('wastage summaries', () => {
  const entries = [
    entry({ reason: 'Spoiled / expired', outlet: 'Mall', estimatedValue: 30 }),
    entry({ reason: 'Spoiled / expired', outlet: 'Night Market', estimatedValue: 70 }),
    entry({ reason: 'Over-production', outlet: 'Mall', estimatedValue: 5 }),
    entry({ reason: 'Over-production', outlet: 'Mall', estimatedValue: null }),
  ]

  it('groups by reason, biggest value first', () => {
    const rows = summariseByReason(entries)
    expect(rows.map((row) => row.label)).toEqual(['Spoiled / expired', 'Over-production'])
    expect(rows[0]).toMatchObject({ count: 2, value: 100, unpriced: 0 })
    expect(rows[1]).toMatchObject({ count: 2, value: 5, unpriced: 1 })
  })

  it('groups by outlet', () => {
    const rows = summariseByOutlet(entries)
    expect(rows.find((row) => row.label === 'Mall')).toMatchObject({ count: 3, value: 35 })
  })

  it('labels an entry with no outlet rather than dropping it', () => {
    expect(summariseByOutlet([entry({ outlet: '' })])[0]?.label).toBe('Not stated')
  })
})

describe('the entry table', () => {
  it('hides the value column when the reader may not see money', () => {
    expect(entryHeaders(false, 'AED')).not.toContain('Est. value (AED)')
    expect(entryHeaders(true, 'AED')).toContain('Est. value (AED)')
    expect(entryRow(entry(), 0, false)).not.toContain(40)
    expect(entryRow(entry(), 0, true)).toContain(40)
  })

  it('numbers the rows from one', () => {
    expect(entryRow(entry(), 0, true)[0]).toBe(1)
    expect(entryRow(entry(), 4, true)[0]).toBe(5)
  })
})

describe('the workbook', () => {
  const report: WastageReportData = {
    restaurantName: 'Shan Village',
    reportDate: '2026-08-24',
    currency: 'AED',
    generatedAt: '2026-08-24 22:10 local time',
    includeValues: true,
    entries: [
      entry(),
      entry({
        reference: 'WS-2026-00002',
        time: '21:40',
        item: 'Rice',
        estimatedValue: null,
        photoUrl: 'https://drive.google.com/file/d/abc/view',
      }),
    ],
  }

  it('writes both sheets and every entry', () => {
    const workbook = XLSX.read(buildWastageWorkbook(report), { type: 'array' })
    expect(workbook.SheetNames).toEqual(['Wastage', 'Summary'])

    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Wastage!, { header: 1 })
    const flat = rows.map((row) => row.join('|')).join('\n')
    expect(flat).toContain('WS-2026-00001')
    expect(flat).toContain('WS-2026-00002')
    expect(flat).toContain('Shan Village — Daily Wastage Report')
  })

  it('says the total is a floor when an entry has no price', () => {
    const workbook = XLSX.read(buildWastageWorkbook(report), { type: 'array' })
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Wastage!, { header: 1 })
    expect(rows.flat().join(' ')).toContain('no price')
  })

  it('makes the photo cell a hyperlink to Drive', () => {
    const workbook = XLSX.read(buildWastageWorkbook(report), { type: 'array' })
    const sheet = workbook.Sheets.Wastage!
    const linked = Object.values(sheet).find(
      (cell) => typeof cell === 'object' && cell !== null && 'l' in cell,
    ) as { l?: { Target: string } } | undefined
    expect(linked?.l?.Target).toBe('https://drive.google.com/file/d/abc/view')
  })

  it('omits the value column entirely when values are hidden', () => {
    const workbook = XLSX.read(buildWastageWorkbook({ ...report, includeValues: false }), {
      type: 'array',
    })
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Wastage!, { header: 1 })
    expect(rows.flat().join(' ')).not.toContain('Est. value')
  })
})

describe('the file name', () => {
  it('is stable for a day, so republishing replaces one file', () => {
    expect(reportFileName('Shan Village', '2026-08-24')).toBe('Shan Village Wastage 2026-08-24.xlsx')
  })

  it('drops characters Drive and Windows refuse', () => {
    expect(reportFileName('Shan/Village: Mall', '2026-08-24')).toBe(
      'ShanVillage Mall Wastage 2026-08-24.xlsx',
    )
  })
})
