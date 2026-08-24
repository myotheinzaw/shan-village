import * as XLSX from 'xlsx'

/**
 * The daily wastage workbook.
 *
 * Kept as pure functions over plain data so the same rows can be rendered on
 * screen, written to Excel and asserted in a unit test — the on-screen total
 * and the total in the Owner's Drive file cannot drift apart if there is only
 * one function that computes it.
 */

export interface WastageReportEntry {
  reference: string
  time: string
  outlet: string
  item: string
  quantity: number | null
  unit: string | null
  reason: string
  reportedBy: string
  estimatedValue: number | null
  status: string
  source: string
  note: string
  photoUrl: string | null
}

export interface WastageReportData {
  restaurantName: string
  reportDate: string
  currency: string
  generatedAt: string
  /** False when the report is produced by someone without wastage.cost_view. */
  includeValues: boolean
  entries: WastageReportEntry[]
}

export interface WastageSummaryRow {
  label: string
  count: number
  value: number
  /** How many entries in this group carried no price at all. */
  unpriced: number
}

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
}

const SOURCE_LABEL: Record<string, string> = {
  PUBLIC_LINK: 'Staff link',
  STAFF_APP: 'Staff app',
  MANAGEMENT: 'Management',
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source
}

/**
 * Rejected entries are excluded from every total. They stay on the sheet —
 * a rejection is part of the day's record — but they are not wastage.
 */
export function countsTowardsTotal(entry: WastageReportEntry): boolean {
  return entry.status !== 'REJECTED'
}

export function totalValue(entries: WastageReportEntry[]): number {
  const total = entries
    .filter(countsTowardsTotal)
    .reduce((sum, e) => sum + (e.estimatedValue ?? 0), 0)
  return Math.round(total * 100) / 100
}

export function countUnpriced(entries: WastageReportEntry[]): number {
  return entries.filter((e) => countsTowardsTotal(e) && e.estimatedValue === null).length
}

function summarise(
  entries: WastageReportEntry[],
  key: (entry: WastageReportEntry) => string,
): WastageSummaryRow[] {
  const groups = new Map<string, WastageSummaryRow>()
  for (const entry of entries) {
    if (!countsTowardsTotal(entry)) continue
    const label = key(entry) || 'Not stated'
    const row = groups.get(label) ?? { label, count: 0, value: 0, unpriced: 0 }
    row.count += 1
    if (entry.estimatedValue === null) row.unpriced += 1
    else row.value = Math.round((row.value + entry.estimatedValue) * 100) / 100
    groups.set(label, row)
  }
  // Biggest first: the point of the summary is what to fix tomorrow.
  return [...groups.values()].sort((a, b) => b.value - a.value || b.count - a.count)
}

export function summariseByReason(entries: WastageReportEntry[]): WastageSummaryRow[] {
  return summarise(entries, (e) => e.reason)
}

export function summariseByOutlet(entries: WastageReportEntry[]): WastageSummaryRow[] {
  return summarise(entries, (e) => e.outlet)
}

export function summariseByReporter(entries: WastageReportEntry[]): WastageSummaryRow[] {
  return summarise(entries, (e) => e.reportedBy)
}

/** The entry table, as it appears on the sheet and on screen. */
export function entryHeaders(includeValues: boolean, currency: string): string[] {
  return [
    '#',
    'Reference',
    'Time',
    'Outlet',
    'Item',
    'Qty',
    'Unit',
    'Reason',
    ...(includeValues ? [`Est. value (${currency})`] : []),
    'Reported by',
    'Submitted via',
    'Status',
    'Note',
    'Photo',
  ]
}

export function entryRow(
  entry: WastageReportEntry,
  index: number,
  includeValues: boolean,
): (string | number | null)[] {
  return [
    index + 1,
    entry.reference,
    entry.time,
    entry.outlet,
    entry.item,
    entry.quantity,
    entry.unit,
    entry.reason,
    ...(includeValues ? [entry.estimatedValue] : []),
    entry.reportedBy,
    sourceLabel(entry.source),
    statusLabel(entry.status),
    entry.note,
    entry.photoUrl ? 'Open photo' : '',
  ]
}

export function reportFileName(restaurantName: string, reportDate: string): string {
  const safe = restaurantName.replace(/[\\/:*?"<>|]/g, '').trim() || 'Restaurant'
  return `${safe} Wastage ${reportDate}.xlsx`
}

/** Builds the .xlsx bytes. */
export function buildWastageWorkbook(report: WastageReportData): Uint8Array {
  const { entries, includeValues, currency } = report
  const headers = entryHeaders(includeValues, currency)
  const photoColumn = headers.length - 1

  const preamble: (string | number | null)[][] = [
    [`${report.restaurantName} — Daily Wastage Report`],
    [`Date: ${report.reportDate}`],
    [`Entries: ${entries.length}`],
    ...(includeValues
      ? [
          [`Estimated value: ${currency} ${totalValue(entries).toFixed(2)}`],
          [
            countUnpriced(entries) > 0
              ? `${countUnpriced(entries)} entr${countUnpriced(entries) === 1 ? 'y has' : 'ies have'} no price, so the total is a floor, not the full cost.`
              : 'Every entry carries an estimated price.',
          ],
        ]
      : [['Estimated values are hidden — they require the wastage.cost_view permission.']]),
    [`Generated: ${report.generatedAt}`],
    [],
  ]

  const rows: (string | number | null)[][] = [
    ...preamble,
    headers,
    ...entries.map((entry, index) => entryRow(entry, index, includeValues)),
  ]

  if (includeValues && entries.length > 0) {
    const totals: (string | number | null)[] = new Array(headers.length).fill(null)
    totals[1] = 'Total'
    totals[8] = totalValue(entries)
    rows.push([], totals)
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows)

  // Photo cells become real hyperlinks, so the Owner opens the picture from the
  // spreadsheet rather than hunting for it in the folder.
  const headerRow = preamble.length
  entries.forEach((entry, index) => {
    if (!entry.photoUrl) return
    const address = XLSX.utils.encode_cell({ r: headerRow + 1 + index, c: photoColumn })
    const cell = sheet[address]
    if (cell) cell.l = { Target: entry.photoUrl, Tooltip: 'Open the photo in Google Drive' }
  })

  sheet['!cols'] = [
    { wch: 4 },  { wch: 14 }, { wch: 8 },  { wch: 14 }, { wch: 30 },
    { wch: 8 },  { wch: 8 },  { wch: 20 },
    ...(includeValues ? [{ wch: 16 }] : []),
    { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 50 }, { wch: 12 },
  ]
  sheet['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Wastage')

  const summarySheet = XLSX.utils.aoa_to_sheet([
    [`${report.restaurantName} — Wastage summary ${report.reportDate}`],
    [],
    ['By reason'],
    ['Reason', 'Entries', ...(includeValues ? [`Value (${currency})`, 'Without a price'] : [])],
    ...summariseByReason(entries).map((row) => [
      row.label,
      row.count,
      ...(includeValues ? [row.value, row.unpriced] : []),
    ]),
    [],
    ['By outlet'],
    ['Outlet', 'Entries', ...(includeValues ? [`Value (${currency})`, 'Without a price'] : [])],
    ...summariseByOutlet(entries).map((row) => [
      row.label,
      row.count,
      ...(includeValues ? [row.value, row.unpriced] : []),
    ]),
    [],
    ['By person'],
    ['Reported by', 'Entries', ...(includeValues ? [`Value (${currency})`, 'Without a price'] : [])],
    ...summariseByReporter(entries).map((row) => [
      row.label,
      row.count,
      ...(includeValues ? [row.value, row.unpriced] : []),
    ]),
  ])
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}
