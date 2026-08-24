import { describe, expect, it } from 'vitest'
import {
  computeScheduledHours,
  formatShift,
  parseShiftCell,
  segmentMinutes,
} from './shift'

/**
 * Every string in these tests is taken verbatim from
 * "Shan Village - Duty Roster.xlsx", spacing quirks included.
 */
describe('parseShiftCell — statuses', () => {
  it.each([
    ['OFF', 'OFF'],
    ['Off', 'OFF'],
    ['PH', 'PH'],
    ['PH Day', 'PH'],
    ['Ph Leave', 'PH'],
    ['Trial', 'TRIAL'],
    ['VAC', 'LEAVE'],
    ['UL', 'LEAVE'],
    ['Unpaid Leave', 'LEAVE'],
    ['Sick Leave', 'LEAVE'],
    ['SICK LEAVE', 'LEAVE'],
  ])('reads %s as %s', (input, status) => {
    expect(parseShiftCell(input)?.status).toBe(status)
  })

  it('maps VAC to annual leave and UL to unpaid leave', () => {
    expect(parseShiftCell('VAC')?.leaveTypeCode).toBe('ANNUAL')
    expect(parseShiftCell('UL')?.leaveTypeCode).toBe('UNPAID')
    expect(parseShiftCell('SICK LEAVE')?.leaveTypeCode).toBe('SICK')
  })

  it('flags a bare "Leave" because the source did not say which type', () => {
    const parsed = parseShiftCell('Leave ')
    expect(parsed?.status).toBe('LEAVE')
    expect(parsed?.confidence).toBe('review')
    expect(parsed?.leaveTypeCode).toBeNull()
  })

  it('treats ON and ENTRY as worked days with no recorded times', () => {
    expect(parseShiftCell('ON')).toMatchObject({ status: 'WORK', startTime: null })
    expect(parseShiftCell('ENTRY')).toMatchObject({ status: 'WORK', startTime: null })
  })

  it('returns null for an empty cell', () => {
    expect(parseShiftCell(null)).toBeNull()
    expect(parseShiftCell('   ')).toBeNull()
  })
})

describe('parseShiftCell — outlets and positions', () => {
  it('reads MANGOON and Gool Luck as deployment to another outlet', () => {
    expect(parseShiftCell('MANGOON')).toMatchObject({ status: 'WORK', outletCode: 'MANGOON' })
    expect(parseShiftCell('Gool Luck')).toMatchObject({ status: 'WORK', outletCode: 'GOOD_LUCK' })
  })

  it('reads a bare position name as covering that position', () => {
    expect(parseShiftCell('Cashier')).toMatchObject({ status: 'WORK', positionHint: 'CASHIER' })
  })

  it('extracts the (NM) and (Mall) annotations without losing the times', () => {
    expect(parseShiftCell('16:00 - 2:00 (NM)')).toMatchObject({
      status: 'WORK',
      startTime: '16:00',
      endTime: '02:00',
      crossesMidnight: true,
      outletCode: 'NIGHT_MARKET',
    })
    expect(parseShiftCell('13:00 - 23 :00(Mall)')).toMatchObject({
      startTime: '13:00',
      endTime: '23:00',
      outletCode: 'MALL',
    })
    expect(parseShiftCell('15:00 - 2:00 (NM )')?.outletCode).toBe('NIGHT_MARKET')
  })

  it('extracts a position annotation', () => {
    expect(parseShiftCell('9:30 - 22:30( Cashier )')).toMatchObject({
      startTime: '09:30',
      endTime: '22:30',
      positionHint: 'CASHIER',
    })
  })

  it('keeps an unrecognised annotation as a note', () => {
    const parsed = parseShiftCell('13:00 - 23:00 (ST)')
    expect(parsed?.startTime).toBe('13:00')
    expect(parsed?.note).toContain('ST')
  })
})

describe('parseShiftCell — simple ranges, spacing and midnight', () => {
  it('survives every spacing variant of the same 14:00–24:00 shift', () => {
    for (const variant of ['14:00 - 24 :00', '14:00- 24:00', '14:00 - 24:00', '14:00 -24:00']) {
      expect(parseShiftCell(variant)).toMatchObject({
        status: 'WORK',
        startTime: '14:00',
        endTime: '00:00',
        crossesMidnight: true,
      })
    }
  })

  it('reads a plain daytime shift', () => {
    expect(parseShiftCell('8:00 - 18:00')).toMatchObject({
      startTime: '08:00',
      endTime: '18:00',
      crossesMidnight: false,
    })
  })

  it('reads 24:30 as 00:30 the next day', () => {
    expect(parseShiftCell('12:00 -24:30')).toMatchObject({
      startTime: '12:00',
      endTime: '00:30',
      crossesMidnight: true,
    })
  })

  it('infers midnight crossing when the end is earlier than the start', () => {
    expect(parseShiftCell('15:00 - 2:00')).toMatchObject({
      startTime: '15:00',
      endTime: '02:00',
      crossesMidnight: true,
    })
    expect(parseShiftCell('16:00 - 2:00')?.crossesMidnight).toBe(true)
  })

  it('reads half-hour boundaries', () => {
    expect(parseShiftCell('12:00 -23:30')).toMatchObject({ startTime: '12:00', endTime: '23:30' })
    expect(parseShiftCell('14:30 - 22:30')).toMatchObject({ startTime: '14:30', endTime: '22:30' })
  })

  it('reads an early start', () => {
    expect(parseShiftCell('6:00 -24:00')).toMatchObject({
      startTime: '06:00',
      endTime: '00:00',
      crossesMidnight: true,
    })
  })
})

describe('parseShiftCell — split shifts', () => {
  it('reads the dash-separated form', () => {
    expect(parseShiftCell('9-14 - 19-24')).toMatchObject({
      status: 'WORK',
      isSplit: true,
      startTime: '09:00',
      endTime: '14:00',
      segment2Start: '19:00',
      segment2End: '00:00',
      crossesMidnight: true,
    })
  })

  it('reads the space-separated form identically', () => {
    expect(parseShiftCell('9-14  19-24')).toMatchObject({
      isSplit: true,
      startTime: '09:00',
      endTime: '14:00',
      segment2Start: '19:00',
      segment2End: '00:00',
    })
  })

  it('reads a split that does not reach midnight', () => {
    expect(parseShiftCell('8-13 - 18-22')).toMatchObject({
      isSplit: true,
      startTime: '08:00',
      endTime: '13:00',
      segment2Start: '18:00',
      segment2End: '22:00',
      crossesMidnight: false,
    })
  })

  it('lets the evening segment run past midnight', () => {
    expect(parseShiftCell('9-14 - 19-1:30')).toMatchObject({
      isSplit: true,
      segment2Start: '19:00',
      segment2End: '01:30',
      crossesMidnight: true,
    })
  })

  it('reads the ambiguous "10-2" as the afternoon, and flags it for review', () => {
    const parsed = parseShiftCell('10-2 - 19-24')
    expect(parsed).toMatchObject({
      isSplit: true,
      startTime: '10:00',
      endTime: '14:00',
      segment2Start: '19:00',
      segment2End: '00:00',
    })
    expect(parsed?.confidence).toBe('review')
    expect(parsed?.message).toContain('afternoon')
  })

  it('does not silently accept a malformed second segment', () => {
    const parsed = parseShiftCell('10-15 - 19:23')
    expect(parsed?.confidence).toBe('review')
  })
})

describe('parseShiftCell — unknown values', () => {
  it('keeps the original text and asks for review', () => {
    const parsed = parseShiftCell('Visa Extend')
    expect(parsed?.status).toBe('OTHER')
    expect(parsed?.note).toContain('Visa')
  })

  it('never throws away the source value', () => {
    for (const value of ['something odd', '???', 'Nay Lin', '9-14  20-24']) {
      expect(parseShiftCell(value)?.sourceValue).toBe(value)
    }
  })

  it('flags anything it cannot interpret', () => {
    const parsed = parseShiftCell('probably a typo')
    expect(parsed?.confidence).toBe('review')
    expect(parsed?.message).toBeTruthy()
  })
})

describe('computeScheduledHours', () => {
  const work = (over: Partial<Parameters<typeof computeScheduledHours>[0]>) =>
    computeScheduledHours({
      status: 'WORK',
      startTime: null,
      endTime: null,
      ...over,
    })

  it('measures a plain shift', () => {
    expect(work({ startTime: '08:00', endTime: '18:00' })).toBe(10)
  })

  it('measures a shift that crosses midnight', () => {
    expect(work({ startTime: '15:00', endTime: '02:00', crossesMidnight: true })).toBe(11)
    expect(work({ startTime: '14:00', endTime: '00:00', crossesMidnight: true })).toBe(10)
    expect(work({ startTime: '12:00', endTime: '00:30', crossesMidnight: true })).toBe(12.5)
  })

  it('infers the crossing when the flag is missing', () => {
    expect(work({ startTime: '15:00', endTime: '02:00' })).toBe(11)
  })

  it('sums both halves of a split shift', () => {
    expect(
      work({
        startTime: '09:00',
        endTime: '14:00',
        isSplit: true,
        segment2Start: '19:00',
        segment2End: '00:00',
        crossesMidnight: true,
      }),
    ).toBe(10)
  })

  it('handles a split shift whose tail crosses midnight', () => {
    expect(
      work({
        startTime: '09:00',
        endTime: '14:00',
        isSplit: true,
        segment2Start: '19:00',
        segment2End: '01:30',
        crossesMidnight: true,
      }),
    ).toBe(11.5)
  })

  it('deducts the break once, from the total', () => {
    expect(work({ startTime: '08:00', endTime: '18:00', breakMinutes: 60 })).toBe(9)
    expect(
      work({
        startTime: '09:00',
        endTime: '14:00',
        isSplit: true,
        segment2Start: '19:00',
        segment2End: '00:00',
        crossesMidnight: true,
        breakMinutes: 30,
      }),
    ).toBe(9.5)
  })

  it('never returns a negative number', () => {
    expect(work({ startTime: '08:00', endTime: '09:00', breakMinutes: 600 })).toBe(0)
  })

  it('gives non-working statuses zero hours', () => {
    for (const status of ['OFF', 'PH', 'LEAVE', 'TRIAL', 'OTHER'] as const) {
      expect(computeScheduledHours({ status, startTime: '08:00', endTime: '18:00' })).toBe(0)
    }
  })

  it('gives an "ON" day zero hours, because no times were recorded', () => {
    expect(work({ startTime: null, endTime: null })).toBe(0)
  })

  it('agrees with the parser end to end', () => {
    const parsed = parseShiftCell('13:00 - 24 :00')!
    expect(computeScheduledHours(parsed)).toBe(11)
  })
})

describe('segmentMinutes', () => {
  it('measures a same-day span', () => {
    expect(segmentMinutes('09:00', '17:30', false)).toBe(510)
  })
  it('wraps past midnight', () => {
    expect(segmentMinutes('22:00', '02:00', false)).toBe(240)
    expect(segmentMinutes('22:00', '02:00', true)).toBe(240)
  })
  it('treats an equal start and end as a full day when told to cross', () => {
    expect(segmentMinutes('09:00', '09:00', true)).toBe(1440)
  })
})

describe('formatShift', () => {
  it('shows midnight the way the roster writes it', () => {
    expect(
      formatShift({
        status: 'WORK',
        startTime: '14:00',
        endTime: '00:00',
        crossesMidnight: true,
      }),
    ).toBe('14:00–24:00')
  })

  it('shows a genuine after-midnight finish as a real time', () => {
    expect(
      formatShift({
        status: 'WORK',
        startTime: '16:00',
        endTime: '02:00',
        crossesMidnight: true,
      }),
    ).toBe('16:00–02:00')
  })

  it('shows both halves of a split shift', () => {
    expect(
      formatShift({
        status: 'WORK',
        startTime: '09:00',
        endTime: '14:00',
        isSplit: true,
        segment2Start: '19:00',
        segment2End: '00:00',
        crossesMidnight: true,
      }),
    ).toBe('09:00–14:00 / 19:00–24:00')
  })

  it('labels the non-working statuses', () => {
    expect(formatShift({ status: 'OFF', startTime: null, endTime: null })).toBe('OFF')
    expect(formatShift({ status: 'PH', startTime: null, endTime: null })).toBe('PH')
    expect(formatShift({ status: 'LEAVE', startTime: null, endTime: null })).toBe('Leave')
    expect(formatShift({ status: 'WORK', startTime: null, endTime: null })).toBe('ON')
  })
})
