import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

/**
 * Roster dates are plain calendar dates — a shift on the 24th is on the 24th
 * whatever the server's clock is set to. The only place a timezone matters is
 * deciding what "today" is for the restaurant, which is why every function that
 * needs it takes the configured timezone explicitly.
 */

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export type ISODate = string

export function toISODate(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd')
}

export function fromISODate(date: ISODate): Date {
  return parseISO(date)
}

/** Today's calendar date in the restaurant's timezone. */
export function todayInTimeZone(timezone: string): ISODate {
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd')
}

export function nowInTimeZone(timezone: string): Date {
  return toZonedTime(new Date(), timezone)
}

/**
 * The first day of the week containing `date`, honouring the configured week
 * start (the existing roster runs Monday to Sunday, so the default is 1).
 */
export function startOfWeekFor(date: Date, weekStartDay = 1): Date {
  const diff = (date.getDay() - weekStartDay + 7) % 7
  return addDays(date, -diff)
}

export function startOfWeekISO(date: ISODate, weekStartDay = 1): ISODate {
  return toISODate(startOfWeekFor(fromISODate(date), weekStartDay))
}

/** The seven dates of a week, starting at `start`. */
export function weekDates(start: ISODate): ISODate[] {
  const base = fromISODate(start)
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(base, i)))
}

export function addWeeksISO(date: ISODate, weeks: number): ISODate {
  return toISODate(addDays(fromISODate(date), weeks * 7))
}

export function addDaysISO(date: ISODate, days: number): ISODate {
  return toISODate(addDays(fromISODate(date), days))
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(fromISODate(to), fromISODate(from))
}

/** Inclusive day count, which is how leave is counted on a request form. */
export function inclusiveDays(from: ISODate, to: ISODate): number {
  return daysBetween(from, to) + 1
}

export function formatDayLabel(date: ISODate): string {
  return format(fromISODate(date), 'EEE d MMM')
}

export function formatLongDate(date: ISODate): string {
  return format(fromISODate(date), 'EEEE d MMMM yyyy')
}

export function formatWeekLabel(start: ISODate): string {
  const from = fromISODate(start)
  const to = addDays(from, 6)
  const sameMonth = from.getMonth() === to.getMonth()
  return sameMonth
    ? `${format(from, 'd')}–${format(to, 'd MMM yyyy')}`
    : `${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}`
}

export function dayOfWeek(date: ISODate): number {
  return fromISODate(date).getDay()
}

/** All dates in a month, plus the leading/trailing days that fill the grid. */
export function monthGrid(year: number, month: number, weekStartDay = 1) {
  const first = new Date(year, month, 1)
  const gridStart = startOfWeekFor(first, weekStartDay)
  const last = endOfMonth(first)
  const weeks: ISODate[][] = []
  let cursor = gridStart
  while (cursor <= last || weeks.length === 0 || weeks[weeks.length - 1]!.length < 7) {
    const week: ISODate[] = []
    for (let i = 0; i < 7; i += 1) {
      week.push(toISODate(cursor))
      cursor = addDays(cursor, 1)
    }
    weeks.push(week)
    if (cursor > last) break
  }
  return {
    weeks,
    monthStart: toISODate(startOfMonth(first)),
    monthEnd: toISODate(last),
  }
}

export function isInMonth(date: ISODate, year: number, month: number): boolean {
  const d = fromISODate(date)
  return d.getFullYear() === year && d.getMonth() === month
}

/** Formats hours the way a roster reads them: 9.5 -> "9.5 h", 10 -> "10 h". */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, '')} h`
}
