import { describe, expect, it } from 'vitest'
import type { RosterShareRow } from '@/types/db'
import {
  groupByPerson,
  isWeekInWindow,
  matchesSearch,
  resolveWeek,
  shareCellLabel,
  shareWindow,
  workingByDate,
} from './share'

// Monday 24 August 2026.
const TODAY = '2026-08-24'
const MONDAY = 1

function row(overrides: Partial<RosterShareRow> = {}): RosterShareRow {
  return {
    work_date: TODAY,
    employee_id: 'e1',
    employee_name: 'Phyu Sin Maung',
    position_name: 'Commis',
    outlet_name: 'Mall',
    status: 'WORK',
    start_time: '13:00',
    end_time: '23:00',
    crosses_midnight: false,
    is_split: false,
    segment2_start: null,
    segment2_end: null,
    scheduled_hours: 10,
    note: '',
    ...overrides,
  }
}

describe('the window a shared link may be walked through', () => {
  it('spans the configured weeks either side of this week', () => {
    expect(shareWindow(TODAY, MONDAY, 2, 4)).toEqual({
      first: '2026-08-10',
      last: '2026-09-21',
    })
  })

  it('snaps to the start of the week, whatever day it is asked on', () => {
    // Thursday of the same week produces the same window as Monday.
    expect(shareWindow('2026-08-27', MONDAY, 2, 4)).toEqual(shareWindow(TODAY, MONDAY, 2, 4))
  })

  it('honours a Sunday week start', () => {
    expect(shareWindow(TODAY, 0, 1, 1)).toEqual({ first: '2026-08-16', last: '2026-08-30' })
  })

  it('collapses to this week alone when both sides are zero', () => {
    const window = shareWindow(TODAY, MONDAY, 0, 0)
    expect(window).toEqual({ first: TODAY, last: TODAY })
    expect(isWeekInWindow('2026-08-31', window)).toBe(false)
  })

  it('excludes the week just outside either edge', () => {
    const window = shareWindow(TODAY, MONDAY, 2, 4)
    expect(isWeekInWindow('2026-08-10', window)).toBe(true)
    expect(isWeekInWindow('2026-08-03', window)).toBe(false)
    expect(isWeekInWindow('2026-09-21', window)).toBe(true)
    expect(isWeekInWindow('2026-09-28', window)).toBe(false)
  })
})

describe('which week the link opens on', () => {
  const window = shareWindow(TODAY, MONDAY, 2, 4)

  it('opens on this week when nothing is asked for', () => {
    expect(resolveWeek(undefined, TODAY, MONDAY, window)).toBe(TODAY)
  })

  it('snaps a mid-week date to its Monday', () => {
    expect(resolveWeek('2026-09-03', TODAY, MONDAY, window)).toBe('2026-08-31')
  })

  it('falls back to this week rather than showing nothing for a stale link', () => {
    expect(resolveWeek('2026-01-05', TODAY, MONDAY, window)).toBe(TODAY)
    expect(resolveWeek('2027-01-04', TODAY, MONDAY, window)).toBe(TODAY)
  })

  it('ignores a query string that is not a date', () => {
    expect(resolveWeek('next-week', TODAY, MONDAY, window)).toBe(TODAY)
    expect(resolveWeek('', TODAY, MONDAY, window)).toBe(TODAY)
  })
})

describe('grouping the week by person', () => {
  const rows = [
    row({ work_date: '2026-08-24' }),
    row({ work_date: '2026-08-25', status: 'OFF', start_time: null, end_time: null, scheduled_hours: 0 }),
    row({ employee_id: 'e2', employee_name: 'Win Paing', position_name: 'K.H', work_date: '2026-08-24' }),
  ]

  it('gives one row per person, keyed by date', () => {
    const people = groupByPerson(rows)
    expect(people).toHaveLength(2)
    expect(people[0]?.byDate.get('2026-08-25')?.status).toBe('OFF')
    expect(people[1]?.name).toBe('Win Paing')
  })

  it('adds up the week only when the link shows hours', () => {
    expect(groupByPerson(rows)[0]?.hours).toBe(10)
    const hidden = rows.map((r) => ({ ...r, scheduled_hours: null }))
    expect(groupByPerson(hidden)[0]?.hours).toBe(0)
  })

  it('counts who is working each day, ignoring OFF and leave', () => {
    const counts = workingByDate(rows, ['2026-08-24', '2026-08-25', '2026-08-26'])
    expect(counts.get('2026-08-24')).toBe(2)
    expect(counts.get('2026-08-25')).toBe(0)
    expect(counts.get('2026-08-26')).toBe(0)
  })
})

describe('what a cell says', () => {
  it('shows the shift', () => {
    expect(shareCellLabel(row())).toBe('13:00–23:00')
  })

  it('keeps the roster’s own 24:00 convention for a shift ending at midnight', () => {
    expect(shareCellLabel(row({ end_time: '00:00', crosses_midnight: true }))).toBe('13:00–24:00')
  })

  it('shows a split shift as two segments', () => {
    expect(
      shareCellLabel(
        row({
          start_time: '09:00',
          end_time: '14:00',
          is_split: true,
          segment2_start: '19:00',
          segment2_end: '00:00',
          crosses_midnight: true,
        }),
      ),
    ).toBe('09:00–14:00 / 19:00–24:00')
  })

  it('never says why someone is on leave', () => {
    // A roster on a wall may say a person is off. It may not say they are sick.
    expect(shareCellLabel(row({ status: 'LEAVE', start_time: null, end_time: null }))).toBe('Leave')
  })

  it('is blank for a day the person is not on the roster at all', () => {
    expect(shareCellLabel(undefined)).toBe('')
  })
})

describe('finding yourself on the roster', () => {
  const person = groupByPerson([row()])[0]!

  it('matches on part of a name, ignoring case', () => {
    expect(matchesSearch(person, 'phyu')).toBe(true)
    expect(matchesSearch(person, 'MAUNG')).toBe(true)
  })

  it('matches on position too', () => {
    expect(matchesSearch(person, 'commis')).toBe(true)
  })

  it('shows everyone when the box is empty', () => {
    expect(matchesSearch(person, '   ')).toBe(true)
  })

  it('does not match someone else', () => {
    expect(matchesSearch(person, 'win paing')).toBe(false)
  })
})
