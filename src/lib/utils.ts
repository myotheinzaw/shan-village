import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Initials for an avatar, e.g. "Htet Thu Yein Aung" -> "HA". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/** Escapes a value for CSV, including the leading-character injection guard. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // A cell starting with =, +, - or @ is executed as a formula by spreadsheet
  // software. Prefixing with a quote keeps exports safe to open.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
