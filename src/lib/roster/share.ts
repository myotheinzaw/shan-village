import { addDaysISO, startOfWeekISO, type ISODate } from './dates'
import { formatShift } from './shift'
import type { RosterShareRow } from '@/types/db'

/**
 * Pure helpers behind the public roster link.
 *
 * The window arithmetic is duplicated in SQL, inside `roster_share_week`, and
 * that copy is the one that enforces anything — this one exists so the page can
 * grey out an arrow rather than offering a week the database will refuse. Keep
 * the two in step; the unit tests below pin this half, and scripts/test-rls.sql
 * pins the other.
 */

export interface ShareWindow {
  first: ISODate
  last: ISODate
}

export function shareWindow(
  today: ISODate,
  weekStartDay: number,
  weeksBack: number,
  weeksAhead: number,
): ShareWindow {
  const current = startOfWeekISO(today, weekStartDay)
  return {
    first: addDaysISO(current, -7 * weeksBack),
    last: addDaysISO(current, 7 * weeksAhead),
  }
}

export function isWeekInWindow(weekStart: ISODate, window: ShareWindow): boolean {
  return weekStart >= window.first && weekStart <= window.last
}

/**
 * The week the link should open on: the one asked for when it is allowed, and
 * this week otherwise. A stale printed QR code with a week in its query string
 * therefore lands on something useful rather than on an empty page.
 */
export function resolveWeek(
  requested: string | undefined,
  today: ISODate,
  weekStartDay: number,
  window: ShareWindow,
): ISODate {
  const fallback = startOfWeekISO(today, weekStartDay)
  if (!requested || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return fallback
  const snapped = startOfWeekISO(requested, weekStartDay)
  return isWeekInWindow(snapped, window) ? snapped : fallback
}

export interface SharePerson {
  employeeId: string
  name: string
  position: string
  /** Keyed by ISO date. A person with no row on a day is simply not scheduled. */
  byDate: Map<ISODate, RosterShareRow>
  hours: number
}

/**
 * Groups the flat rows into one row per person, in the order the database
 * returned them — position order, then name, which is how the paper roster the
 * restaurant already uses is laid out.
 */
export function groupByPerson(rows: RosterShareRow[]): SharePerson[] {
  const people = new Map<string, SharePerson>()
  for (const row of rows) {
    let person = people.get(row.employee_id)
    if (!person) {
      person = {
        employeeId: row.employee_id,
        name: row.employee_name,
        position: row.position_name,
        byDate: new Map(),
        hours: 0,
      }
      people.set(row.employee_id, person)
    }
    person.byDate.set(row.work_date, row)
    person.hours += Number(row.scheduled_hours ?? 0)
  }
  return [...people.values()]
}

/** How many people are working on each date, for the column footers. */
export function workingByDate(rows: RosterShareRow[], dates: ISODate[]): Map<ISODate, number> {
  const counts = new Map<ISODate, number>(dates.map((date) => [date, 0]))
  for (const row of rows) {
    if (row.status !== 'WORK') continue
    counts.set(row.work_date, (counts.get(row.work_date) ?? 0) + 1)
  }
  return counts
}

/**
 * What the cell says. `formatShift` already collapses every kind of leave to a
 * bare "Leave", which is exactly what a roster pinned to a wall should say:
 * that someone is off is roster information, why they are off is not.
 */
export function shareCellLabel(row: RosterShareRow | undefined): string {
  if (!row) return ''
  return formatShift({
    status: row.status,
    startTime: row.start_time,
    endTime: row.end_time,
    crossesMidnight: row.crosses_midnight,
    isSplit: row.is_split,
    segment2Start: row.segment2_start,
    segment2End: row.segment2_end,
  })
}

/** Case- and space-insensitive name search, for "find me on this roster". */
export function matchesSearch(person: SharePerson, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return (
    person.name.toLowerCase().includes(needle) ||
    person.position.toLowerCase().includes(needle)
  )
}
