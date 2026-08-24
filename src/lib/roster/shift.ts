/**
 * Shift parsing and hours calculation.
 *
 * This module is the code-side counterpart of the time model documented in
 * PROJECT_PLAN.md §2.3. It exists because the Excel duty roster records shifts
 * as free text in three different syntactic families, with inconsistent
 * spacing, and with a house convention of writing midnight as 24:00.
 *
 * `computeScheduledHours` here mirrors app.compute_scheduled_hours() in the
 * database exactly, so a preview in the browser and a report from the database
 * can never disagree.
 */

export type AssignmentStatus = 'WORK' | 'OFF' | 'PH' | 'LEAVE' | 'TRIAL' | 'OTHER'

export interface ParsedShift {
  status: AssignmentStatus
  startTime: string | null
  endTime: string | null
  crossesMidnight: boolean
  isSplit: boolean
  segment2Start: string | null
  segment2End: string | null
  /** Leave type code when the cell named one (VAC -> ANNUAL, UL -> UNPAID, …) */
  leaveTypeCode: string | null
  /** Outlet the person was deployed to that day (MANGOON, NIGHT_MARKET, …) */
  outletCode: string | null
  /** Position covered for the day, when different from the employee's own */
  positionHint: string | null
  note: string | null
  sourceValue: string
  /** `review` means a human should confirm before this is committed */
  confidence: 'exact' | 'review'
  message: string | null
}

const MINUTES_PER_DAY = 1440

function blank(sourceValue: string): ParsedShift {
  return {
    status: 'OTHER',
    startTime: null,
    endTime: null,
    crossesMidnight: false,
    isSplit: false,
    segment2Start: null,
    segment2End: null,
    leaveTypeCode: null,
    outletCode: null,
    positionHint: null,
    note: null,
    sourceValue,
    confidence: 'exact',
    message: null,
  }
}

/** Collapses the spacing noise seen throughout the source file: `14:00 - 24 :00`. */
function normalise(raw: string): string {
  return raw
    .replace(/ /g, ' ')
    .replace(/[‐-―−]/g, '-') // en/em dashes and the minus sign
    .replace(/\s*:\s*/g, ':')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Statuses that occupy a whole cell. Keys are normalised to upper case. */
const STATUS_WORDS: Record<
  string,
  Partial<ParsedShift> & { status: AssignmentStatus }
> = {
  OFF: { status: 'OFF' },
  PH: { status: 'PH' },
  'PH DAY': { status: 'PH' },
  'PH LEAVE': { status: 'PH' },
  'PUBLIC HOLIDAY': { status: 'PH' },
  'E.H': { status: 'PH', note: 'Extra holiday' },
  VAC: { status: 'LEAVE', leaveTypeCode: 'ANNUAL' },
  VACATION: { status: 'LEAVE', leaveTypeCode: 'ANNUAL' },
  'ANNUAL LEAVE': { status: 'LEAVE', leaveTypeCode: 'ANNUAL' },
  UL: { status: 'LEAVE', leaveTypeCode: 'UNPAID' },
  'UNPAID LEAVE': { status: 'LEAVE', leaveTypeCode: 'UNPAID' },
  'SICK LEAVE': { status: 'LEAVE', leaveTypeCode: 'SICK' },
  SICK: { status: 'LEAVE', leaveTypeCode: 'SICK' },
  'EMERGENCY LEAVE': { status: 'LEAVE', leaveTypeCode: 'EMERGENCY' },
  TRIAL: { status: 'TRIAL' },
  // "ON" and "ENTRY" mean the person worked but no times were written down.
  ON: { status: 'WORK', note: 'On duty — times not recorded' },
  ENTRY: { status: 'WORK', note: 'Data entry duty' },
  'VISA EXTEND': { status: 'OTHER', note: 'Visa extension' },
}

/** Whole-cell words that mean "deployed to another outlet that day". */
const OUTLET_WORDS: Record<string, string> = {
  MANGOON: 'MANGOON',
  'GOOL LUCK': 'GOOD_LUCK',
  'GOOD LUCK': 'GOOD_LUCK',
  MALL: 'MALL',
  'NIGHT MARKET': 'NIGHT_MARKET',
}

/** Parenthetical annotations: `(NM)`, `(Mall)`, `( Cashier )`, `(ST)`. */
const ANNOTATIONS: Record<string, { outletCode?: string; positionHint?: string; note?: string }> = {
  NM: { outletCode: 'NIGHT_MARKET' },
  'NIGHT MARKET': { outletCode: 'NIGHT_MARKET' },
  MALL: { outletCode: 'MALL' },
  MANGOON: { outletCode: 'MANGOON' },
  CASHIER: { positionHint: 'CASHIER' },
  KH: { positionHint: 'KITCHEN_HELPER' },
  ST: { note: 'ST' },
}

/** Positions a cell can name instead of a shift, e.g. covering the till. */
const POSITION_WORDS: Record<string, string> = {
  CASHIER: 'CASHIER',
  'K.H': 'KITCHEN_HELPER',
  KH: 'KITCHEN_HELPER',
  STEWARDING: 'STEWARDING',
  COMMIS: 'COMMIS',
  'TEAM LEADER': 'TEAM_LEADER',
}

interface Clock {
  time: string
  crosses: boolean
}

/**
 * Turns an hour/minute pair into a stored clock time.
 * 24:00 and 24:30 — the roster's way of writing "midnight and just after" —
 * become 00:00 / 00:30 on the following day.
 */
function toClock(hour: number, minute: number): Clock | null {
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (minute < 0 || minute > 59) return null
  if (hour < 0 || hour > 30) return null
  let crosses = false
  let h = hour
  if (h >= 24) {
    h -= 24
    crosses = true
  }
  return { time: `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, crosses }
}

function parseClock(token: string): Clock | null {
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(token.trim())
  if (!m) return null
  return toClock(Number(m[1]), m[2] === undefined ? 0 : Number(m[2]))
}

const SEGMENT_RE = /(\d{1,2}(?::\d{1,2})?)\s*-\s*(\d{1,2}(?::\d{1,2})?)/g

export function minutesOfDay(time: string): number {
  const [h, m] = time.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

/**
 * Minutes in one segment. A non-positive span, or an explicit cross flag,
 * means the segment finishes on the next day.
 */
export function segmentMinutes(start: string, end: string, crosses: boolean): number {
  let minutes = minutesOfDay(end) - minutesOfDay(start)
  if (crosses || minutes <= 0) minutes += MINUTES_PER_DAY
  return minutes
}

/** Mirrors app.compute_scheduled_hours() in the database, to two decimals. */
export function computeScheduledHours(shift: {
  status: AssignmentStatus
  startTime: string | null
  endTime: string | null
  breakMinutes?: number | null
  crossesMidnight?: boolean | null
  isSplit?: boolean | null
  segment2Start?: string | null
  segment2End?: string | null
}): number {
  if (shift.status !== 'WORK') return 0
  if (!shift.startTime || !shift.endTime) return 0

  let minutes: number
  if (shift.isSplit && shift.segment2Start && shift.segment2End) {
    // Segment 1 of a split shift never crosses midnight; only segment 2 can.
    minutes =
      segmentMinutes(shift.startTime, shift.endTime, false) +
      segmentMinutes(shift.segment2Start, shift.segment2End, Boolean(shift.crossesMidnight))
  } else {
    minutes = segmentMinutes(shift.startTime, shift.endTime, Boolean(shift.crossesMidnight))
  }

  minutes -= shift.breakMinutes ?? 0
  if (minutes < 0) minutes = 0
  return Math.round((minutes / 60) * 100) / 100
}

/**
 * Parses one duty-roster cell.
 *
 * Never guesses silently: anything the rules do not cover comes back with
 * `confidence: 'review'` and a message, so the import screen can put it in
 * front of a human instead of writing it into the roster.
 */
export function parseShiftCell(raw: string | null | undefined): ParsedShift | null {
  if (raw === null || raw === undefined) return null
  const source = String(raw)
  const trimmed = source.trim()
  if (trimmed === '') return null

  const result = blank(source)
  let text = normalise(trimmed)

  // 1. Pull out parenthetical annotations and remember what they meant.
  const annotationNotes: string[] = []
  text = text
    .replace(/\(([^)]*)\)/g, (_full, inner: string) => {
      const key = inner.trim().toUpperCase()
      const known = ANNOTATIONS[key]
      if (known) {
        if (known.outletCode) result.outletCode = known.outletCode
        if (known.positionHint) result.positionHint = known.positionHint
        if (known.note) annotationNotes.push(known.note)
      } else if (key !== '') {
        annotationNotes.push(inner.trim())
      }
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()

  const upper = text.toUpperCase()

  // 2. A whole-cell status word.
  const statusWord = STATUS_WORDS[upper]
  if (statusWord) {
    Object.assign(result, statusWord)
    result.note = [statusWord.note, ...annotationNotes].filter(Boolean).join(' · ') || null
    if (upper === 'LEAVE') {
      result.confidence = 'review'
      result.message = 'Leave type was not specified in the source'
    }
    return result
  }
  if (upper === 'LEAVE') {
    result.status = 'LEAVE'
    result.confidence = 'review'
    result.message = 'Leave type was not specified in the source'
    result.note = annotationNotes.join(' · ') || null
    return result
  }

  // 3. A whole-cell outlet name: worked, but at another location.
  const outletWord = OUTLET_WORDS[upper]
  if (outletWord) {
    result.status = 'WORK'
    result.outletCode = outletWord
    result.note = ['Deployed to another outlet', ...annotationNotes].filter(Boolean).join(' · ')
    return result
  }

  // 4. A whole-cell position name: covered a different role that day.
  const positionWord = POSITION_WORDS[upper]
  if (positionWord) {
    result.status = 'WORK'
    result.positionHint = positionWord
    result.note = ['Covering another position', ...annotationNotes].filter(Boolean).join(' · ')
    return result
  }

  // 5. Time ranges.
  SEGMENT_RE.lastIndex = 0
  const segments = [...text.matchAll(SEGMENT_RE)]

  // Whatever the time patterns did not consume. A cell like "10-15 - 19:23"
  // matches only one range and would otherwise quietly lose its second half,
  // so anything left over downgrades the result to "needs review".
  let residue = text
  for (const segment of segments) residue = residue.replace(segment[0], ' ')
  residue = residue.replace(/[-/,&]/g, ' ').replace(/\s+/g, ' ').trim()

  if (segments.length === 1) {
    const [, a, b] = segments[0]!
    const start = parseClock(a!)
    const end = parseClock(b!)
    if (!start || !end) {
      result.confidence = 'review'
      result.message = `Could not read the times in "${trimmed}"`
      result.note = annotationNotes.join(' · ') || null
      return result
    }
    result.status = 'WORK'
    result.startTime = start.time
    result.endTime = end.time
    // 24:00 written explicitly, or an end that is not after the start.
    result.crossesMidnight =
      end.crosses || minutesOfDay(end.time) <= minutesOfDay(start.time)
    result.note = [residue || null, ...annotationNotes].filter(Boolean).join(' · ') || null
    if (minutesOfDay(end.time) === minutesOfDay(start.time) && !end.crosses) {
      result.confidence = 'review'
      result.message = 'Start and end times are identical'
    } else if (residue) {
      result.confidence = 'review'
      result.message = `"${residue}" in "${trimmed}" was not recognised`
    }
    return result
  }

  if (segments.length === 2) {
    const [, a1, b1] = segments[0]!
    const [, a2, b2] = segments[1]!
    const s1 = parseClock(a1!)
    let e1 = parseClock(b1!)
    const s2 = parseClock(a2!)
    const e2 = parseClock(b2!)
    if (!s1 || !e1 || !s2 || !e2) {
      result.confidence = 'review'
      result.message = `Could not read the split shift "${trimmed}"`
      return result
    }

    result.status = 'WORK'
    result.isSplit = true

    // The compressed form "10-2" means 10:00 to 14:00: every morning segment in
    // the source file ends in the early afternoon, and none crosses midnight.
    // The interpretation is applied but flagged, so a person confirms it.
    if (minutesOfDay(e1.time) <= minutesOfDay(s1.time)) {
      const shifted = toClock(Number(b1!.split(':')[0]) + 12, Number(b1!.split(':')[1] ?? 0))
      if (shifted && minutesOfDay(shifted.time) > minutesOfDay(s1.time) && !shifted.crosses) {
        e1 = shifted
        result.confidence = 'review'
        result.message = `Read "${b1}" in "${trimmed}" as the afternoon (${shifted.time})`
      } else {
        result.confidence = 'review'
        result.message = `The first segment of "${trimmed}" does not read as a morning shift`
      }
    }

    result.startTime = s1.time
    result.endTime = e1.time
    result.segment2Start = s2.time
    result.segment2End = e2.time
    result.crossesMidnight =
      e2.crosses || minutesOfDay(e2.time) <= minutesOfDay(s2.time)
    result.note = [residue || null, ...annotationNotes].filter(Boolean).join(' · ') || null
    if (residue && result.confidence === 'exact') {
      result.confidence = 'review'
      result.message = `"${residue}" in "${trimmed}" was not recognised`
    }
    return result
  }

  if (segments.length > 2) {
    result.confidence = 'review'
    result.message = `"${trimmed}" contains ${segments.length} time ranges`
    result.note = annotationNotes.join(' · ') || null
    return result
  }

  // 6. Anything else is kept verbatim as a note and sent for review.
  result.status = 'OTHER'
  result.note = [trimmed, ...annotationNotes].filter(Boolean).join(' · ')
  result.confidence = 'review'
  result.message = `"${trimmed}" was not recognised as a shift or a status`
  return result
}

/** Short label for a roster cell, e.g. `13:00–23:00`, `09:00–14:00 / 19:00–24:00`. */
export function formatShift(shift: {
  status: AssignmentStatus
  startTime: string | null
  endTime: string | null
  crossesMidnight?: boolean | null
  isSplit?: boolean | null
  segment2Start?: string | null
  segment2End?: string | null
}): string {
  if (shift.status === 'OFF') return 'OFF'
  if (shift.status === 'PH') return 'PH'
  if (shift.status === 'LEAVE') return 'Leave'
  if (shift.status === 'TRIAL') return 'Trial'
  if (shift.status !== 'WORK') return '—'
  if (!shift.startTime || !shift.endTime) return 'ON'

  // Show the roster's own 24:00 convention back to the user, because that is
  // how the team reads a shift that finishes at midnight.
  const end = (time: string, crosses: boolean) =>
    crosses && time === '00:00' ? '24:00' : time

  if (shift.isSplit && shift.segment2Start && shift.segment2End) {
    return `${shift.startTime}–${shift.endTime} / ${shift.segment2Start}–${end(
      shift.segment2End,
      Boolean(shift.crossesMidnight),
    )}`
  }
  return `${shift.startTime}–${end(shift.endTime, Boolean(shift.crossesMidnight))}`
}
