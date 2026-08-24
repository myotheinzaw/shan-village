import * as XLSX from 'xlsx'
import { parseShiftCell, type ParsedShift } from '@/lib/roster/shift'

/**
 * Parser for "Shan Village - Duty Roster.xlsx".
 *
 * Pure: it takes bytes and returns structured records plus a summary of what a
 * person needs to look at. Nothing here touches the database — matching names
 * to employees and writing rows happens in the import action, after an Admin
 * has reviewed this output.
 *
 * The sheet layout it expects (see PROJECT_PLAN.md §2.1):
 *   B: Name   C: Position   D–J: Mon…Sun   L: PH   M: E.H   N,O: notes
 *   a row with a name but no day cells is a section banner (MALL, NIGHT MARKET)
 */

export interface ImportCell {
  sheetName: string
  rowNumber: number
  columnLabel: string
  sourceName: string
  sourcePosition: string | null
  sourceOutlet: string | null
  sourceValue: string
  workDate: string | null
  parsed: ParsedShift | null
  status: 'OK' | 'REVIEW' | 'ERROR'
  message: string | null
  extraHours: number | null
}

export interface ImportSheetSummary {
  sheetName: string
  startDate: string | null
  dateSource: 'row' | 'title' | 'none'
  titleMismatch: boolean
  rowCount: number
  cellCount: number
  message: string | null
}

export interface ImportSummary {
  sheets: ImportSheetSummary[]
  totalCells: number
  okCells: number
  reviewCells: number
  errorCells: number
  /** Distinct cell values the parser could not read confidently, most common first. */
  unknownValues: { value: string; count: number; message: string | null }[]
  /** Employee names as spelled in the file, with the rows they appear on. */
  names: { name: string; count: number }[]
  /** Names that differ only by case or spacing — likely the same person. */
  possibleDuplicateNames: string[][]
  positions: { name: string; count: number }[]
  outlets: string[]
  warnings: string[]
}

export interface ParsedWorkbook {
  cells: ImportCell[]
  summary: ImportSummary
}

const DAY_COLUMNS = ['D', 'E', 'F', 'G', 'H', 'I', 'J']
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function toISO(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
}

/** Reads a date from a cell: a real Date, an Excel serial, or `13.04.26` text. */
function readDate(value: unknown): string | null {
  if (value instanceof Date) return toISO(new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())))
  if (typeof value === 'number' && value > 20000 && value < 60000) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return toISO(new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)))
  }
  if (typeof value === 'string') {
    const dotted = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/.exec(value.trim())
    if (dotted) {
      const day = Number(dotted[1])
      const month = Number(dotted[2])
      let year = Number(dotted[3])
      if (year < 100) year += 2000
      return toISO(new Date(Date.UTC(year, month - 1, day)))
    }
  }
  return null
}

/**
 * Best-effort start date from a sheet title such as "Mar 30 to Apr 5 2026" or
 * "June 1 - June 7". Used only when the sheet has no date row, and always
 * reported so a person can confirm it.
 */
export function dateFromSheetTitle(title: string, fallbackYear: number): string | null {
  const cleaned = title.trim().replace(/\s+/g, ' ')
  const match = /([A-Za-z]{3,9})\s*(\d{1,2})/.exec(cleaned)
  if (!match) return null

  const monthName = match[1]!.toLowerCase()
  const monthIndex = MONTHS.findIndex((m) => m.startsWith(monthName.slice(0, 3)))
  if (monthIndex < 0) return null

  const day = Number(match[2])
  if (!Number.isFinite(day) || day < 1 || day > 31) return null

  const yearMatch = /(20\d{2})/.exec(cleaned)
  const year = yearMatch ? Number(yearMatch[1]) : fallbackYear

  return toISO(new Date(Date.UTC(year, monthIndex, day)))
}

function cellText(sheet: XLSX.WorkSheet, address: string): string | null {
  const cell = sheet[address] as XLSX.CellObject | undefined
  if (!cell || cell.v === undefined || cell.v === null) return null
  const text = String(cell.v).trim()
  return text === '' ? null : text
}

function cellRaw(sheet: XLSX.WorkSheet, address: string): unknown {
  const cell = sheet[address] as XLSX.CellObject | undefined
  return cell?.v
}

export function parseRosterWorkbook(data: ArrayBuffer | Uint8Array): ParsedWorkbook {
  const workbook = XLSX.read(data, { type: 'array', cellDates: true })

  const cells: ImportCell[] = []
  const sheets: ImportSheetSummary[] = []
  const warnings: string[] = []

  const nameCounts = new Map<string, number>()
  const positionCounts = new Map<string, number>()
  const unknownCounts = new Map<string, { count: number; message: string | null }>()
  const outletNames = new Set<string>()

  // A first pass over the date rows gives the year to fall back on for the two
  // sheets that have no dates at all.
  let fallbackYear = new Date().getUTCFullYear()
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    for (let row = 1; row <= 8; row += 1) {
      const iso = readDate(cellRaw(sheet, `D${row}`))
      if (iso) {
        fallbackYear = Number(iso.slice(0, 4))
        break
      }
    }
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    // Locate the header row by finding "Name" in column B.
    let headerRow: number | null = null
    for (let row = 1; row <= 10; row += 1) {
      if ((cellText(sheet, `B${row}`) ?? '').toLowerCase() === 'name') {
        headerRow = row
        break
      }
    }

    if (headerRow === null) {
      sheets.push({
        sheetName,
        startDate: null,
        dateSource: 'none',
        titleMismatch: false,
        rowCount: 0,
        cellCount: 0,
        message: 'No “Name” header was found — this sheet was skipped.',
      })
      warnings.push(`${sheetName}: no header row found, skipped.`)
      continue
    }

    // Dates live on the row after the header in most sheets.
    const dateRow = headerRow + 1
    const datesFromRow = DAY_COLUMNS.map((column) => readDate(cellRaw(sheet, `${column}${dateRow}`)))
    const hasDateRow = datesFromRow.every((d) => d !== null)

    const titleDate = dateFromSheetTitle(sheetName, fallbackYear)
    let startDate: string | null = null
    let dateSource: ImportSheetSummary['dateSource'] = 'none'
    let message: string | null = null

    if (hasDateRow) {
      startDate = datesFromRow[0]!
      dateSource = 'row'
    } else if (titleDate) {
      startDate = titleDate
      dateSource = 'title'
      message = 'This sheet has no date row; the dates were read from the tab name. Please confirm them.'
      warnings.push(`${sheetName}: dates taken from the tab name (${titleDate}).`)
    } else {
      message = 'Neither a date row nor a readable tab name — this sheet was skipped.'
      warnings.push(`${sheetName}: no usable dates, skipped.`)
    }

    // The source file has sheets whose tab name disagrees with the dates inside.
    const titleMismatch = Boolean(
      hasDateRow && titleDate && titleDate !== startDate,
    )
    if (titleMismatch) {
      message =
        `The tab name suggests ${titleDate} but the dates inside start ${startDate}. ` +
        'The dates inside the sheet were used.'
      warnings.push(`${sheetName}: tab name says ${titleDate}, dates inside say ${startDate}.`)
    }

    if (!startDate) {
      sheets.push({ sheetName, startDate: null, dateSource, titleMismatch, rowCount: 0, cellCount: 0, message })
      continue
    }

    const weekDates = DAY_COLUMNS.map((_, index) => {
      if (dateSource === 'row') return datesFromRow[index]!
      const base = new Date(`${startDate}T00:00:00Z`)
      base.setUTCDate(base.getUTCDate() + index)
      return toISO(base)
    })

    let currentOutlet: string | null = null
    let rowCount = 0
    let cellCount = 0
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:Z1')
    const lastRow = Math.min(range.e.r + 1, headerRow + 200)

    for (let row = dateRow + 1; row <= lastRow; row += 1) {
      const name = cellText(sheet, `B${row}`)
      if (!name) continue

      const dayValues = DAY_COLUMNS.map((column) => cellText(sheet, `${column}${row}`))

      // A row with a label but no day cells is a section banner: MALL, NIGHT MARKET.
      if (dayValues.every((value) => value === null)) {
        currentOutlet = name
        outletNames.add(name)
        continue
      }

      rowCount += 1
      const rawPosition = cellText(sheet, `C${row}`)
      const extraHoursRaw = cellRaw(sheet, `M${row}`)
      const extraHours = typeof extraHoursRaw === 'number' ? extraHoursRaw : null

      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)

      // The Position column sometimes holds a shift string by mistake. Treat
      // anything that parses as a time range as "not a position".
      let position: string | null = rawPosition
      if (rawPosition) {
        const asShift = parseShiftCell(rawPosition)
        if (asShift && asShift.status === 'WORK' && asShift.startTime) {
          position = null
          warnings.push(
            `${sheetName} row ${row}: the Position column for ${name} contains a shift ("${rawPosition}"), so no position was read.`,
          )
        } else {
          positionCounts.set(rawPosition, (positionCounts.get(rawPosition) ?? 0) + 1)
        }
      }

      for (const [index, value] of dayValues.entries()) {
        if (value === null) continue
        cellCount += 1

        const parsed = parseShiftCell(value)
        if (!parsed) continue

        const status: ImportCell['status'] = parsed.confidence === 'exact' ? 'OK' : 'REVIEW'
        if (status === 'REVIEW') {
          const existing = unknownCounts.get(value)
          unknownCounts.set(value, {
            count: (existing?.count ?? 0) + 1,
            message: parsed.message ?? existing?.message ?? null,
          })
        }

        cells.push({
          sheetName,
          rowNumber: row,
          columnLabel: DAY_COLUMNS[index]!,
          sourceName: name,
          sourcePosition: position,
          sourceOutlet: parsed.outletCode ?? currentOutlet,
          sourceValue: value,
          workDate: weekDates[index]!,
          parsed,
          status,
          message: parsed.message,
          extraHours,
        })
      }
    }

    sheets.push({ sheetName, startDate, dateSource, titleMismatch, rowCount, cellCount, message })
  }

  // Names that differ only by case or spacing are almost certainly one person.
  const byNormalised = new Map<string, string[]>()
  for (const name of nameCounts.keys()) {
    const key = normaliseName(name)
    byNormalised.set(key, [...(byNormalised.get(key) ?? []), name])
  }
  const possibleDuplicateNames = [...byNormalised.values()].filter((group) => group.length > 1)
  for (const group of possibleDuplicateNames) {
    warnings.push(`These look like the same person: ${group.map((n) => `"${n}"`).join(', ')}.`)
  }

  const okCells = cells.filter((c) => c.status === 'OK').length
  const reviewCells = cells.filter((c) => c.status === 'REVIEW').length
  const errorCells = cells.filter((c) => c.status === 'ERROR').length

  return {
    cells,
    summary: {
      sheets,
      totalCells: cells.length,
      okCells,
      reviewCells,
      errorCells,
      unknownValues: [...unknownCounts.entries()]
        .map(([value, info]) => ({ value, count: info.count, message: info.message }))
        .sort((a, b) => b.count - a.count),
      names: [...nameCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      possibleDuplicateNames,
      positions: [...positionCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      outlets: [...outletNames],
      warnings,
    },
  }
}

export { normaliseName }
