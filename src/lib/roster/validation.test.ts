import { describe, expect, it } from 'vitest'
import { coverage, dailyTotals, validateRoster, type ValidationAssignment } from './validation'

const WEEK = '2026-08-24' // Monday

const employees = [
  { id: 'e1', fullName: 'Win Paing', isActive: true, positionId: 'kh', departmentId: 'kitchen', outletId: 'mall' },
  { id: 'e2', fullName: 'Chan Pyae', isActive: true, positionId: 'cashier', departmentId: 'foh', outletId: 'mall' },
]

const work = (over: Partial<ValidationAssignment> & Pick<ValidationAssignment, 'employeeId' | 'workDate'>): ValidationAssignment => ({
  status: 'WORK',
  startTime: '08:00',
  endTime: '18:00',
  ...over,
})

const off = (employeeId: string, workDate: string): ValidationAssignment => ({
  employeeId, workDate, status: 'OFF', startTime: null, endTime: null,
})

/** A full compliant week for one employee: six shifts and one OFF. */
function fullWeek(employeeId: string, over: Partial<ValidationAssignment> = {}): ValidationAssignment[] {
  const dates = ['2026-08-24','2026-08-25','2026-08-26','2026-08-27','2026-08-28','2026-08-29','2026-08-30']
  return dates.map((d, i) => (i === 6 ? off(employeeId, d) : work({ employeeId, workDate: d, ...over })))
}

const base = {
  weekStart: WEEK,
  employees,
  maxWeeklyHours: 60,
  maxShiftHours: 14,
  minOffDays: 1,
}

const codes = (findings: { code: string }[]) => findings.map((f) => f.code)

describe('validateRoster', () => {
  it('reports nothing for a clean week', () => {
    const findings = validateRoster({
      ...base,
      employees: [employees[0]!],
      assignments: fullWeek('e1'),
    })
    expect(findings).toEqual([])
  })

  it('flags an employee with no OFF day', () => {
    const assignments = fullWeek('e1').map((a) =>
      a.status === 'OFF' ? work({ employeeId: 'e1', workDate: a.workDate }) : a,
    )
    const findings = validateRoster({ ...base, employees: [employees[0]!], assignments })
    expect(codes(findings)).toContain('NO_OFF_DAY')
  })

  it('flags excessive weekly hours', () => {
    const findings = validateRoster({
      ...base,
      employees: [employees[0]!],
      assignments: fullWeek('e1', { startTime: '08:00', endTime: '22:00' }),
      maxWeeklyHours: 60,
    })
    expect(codes(findings)).toContain('EXCESSIVE_HOURS')
  })

  it('flags an unusually long single shift', () => {
    const findings = validateRoster({
      ...base,
      employees: [employees[0]!],
      assignments: [work({ employeeId: 'e1', workDate: WEEK, startTime: '06:00', endTime: '23:00' })],
      maxShiftHours: 14,
    })
    expect(codes(findings)).toContain('LONG_SHIFT')
  })

  it('flags an inactive employee who is still scheduled', () => {
    const findings = validateRoster({
      ...base,
      employees: [{ ...employees[0]!, isActive: false }],
      assignments: [work({ employeeId: 'e1', workDate: WEEK })],
    })
    expect(codes(findings)).toContain('INACTIVE_SCHEDULED')
  })

  it('flags someone scheduled on a day they have approved leave', () => {
    const findings = validateRoster({
      ...base,
      employees: [employees[0]!],
      assignments: [work({ employeeId: 'e1', workDate: WEEK })],
      approvedLeave: [{ employeeId: 'e1', date: WEEK }],
    })
    expect(codes(findings)).toContain('SCHEDULED_ON_LEAVE')
  })

  it('flags an overnight shift that runs into the next day’s shift', () => {
    const findings = validateRoster({
      ...base,
      employees: [employees[0]!],
      assignments: [
        work({ employeeId: 'e1', workDate: '2026-08-24', startTime: '16:00', endTime: '02:00', crossesMidnight: true }),
        work({ employeeId: 'e1', workDate: '2026-08-25', startTime: '01:00', endTime: '10:00' }),
      ],
    })
    expect(codes(findings)).toContain('OVERLAPPING_SHIFTS')
  })

  it('does not flag an overnight shift that finishes before the next one starts', () => {
    const findings = validateRoster({
      ...base,
      employees: [employees[0]!],
      assignments: [
        work({ employeeId: 'e1', workDate: '2026-08-24', startTime: '16:00', endTime: '02:00', crossesMidnight: true }),
        work({ employeeId: 'e1', workDate: '2026-08-25', startTime: '14:00', endTime: '22:00' }),
      ],
    })
    expect(codes(findings)).not.toContain('OVERLAPPING_SHIFTS')
  })

  it('notes an employee who has nothing on the roster', () => {
    const findings = validateRoster({
      ...base,
      assignments: fullWeek('e1'),
    })
    expect(findings.some((f) => f.code === 'UNASSIGNED_EMPLOYEE' && f.employeeId === 'e2')).toBe(true)
  })

  it('notes days an employee has no entry for', () => {
    const findings = validateRoster({
      ...base,
      employees: [employees[0]!],
      assignments: [work({ employeeId: 'e1', workDate: WEEK }), off('e1', '2026-08-25')],
    })
    expect(codes(findings)).toContain('MISSING_DAYS')
  })

  it('flags a duplicate assignment on one date', () => {
    const findings = validateRoster({
      ...base,
      employees: [employees[0]!],
      assignments: [work({ employeeId: 'e1', workDate: WEEK }), work({ employeeId: 'e1', workDate: WEEK })],
    })
    expect(codes(findings)).toContain('DUPLICATE_ASSIGNMENT')
  })
})

describe('coverage', () => {
  const rule = {
    outletId: 'mall', positionId: 'cashier', departmentId: null,
    dayOfWeek: null, minStaff: 1, label: 'Mall — Cashier on duty',
  }

  it('reports a gap when nobody covers the required position', () => {
    const cells = coverage({
      weekStart: WEEK,
      employees,
      assignments: [work({ employeeId: 'e1', workDate: WEEK })],
      staffingRules: [rule],
    })
    expect(cells.find((c) => c.date === WEEK)?.ok).toBe(false)
  })

  it('reports coverage as met when the position is filled', () => {
    const cells = coverage({
      weekStart: WEEK,
      employees,
      assignments: [work({ employeeId: 'e2', workDate: WEEK })],
      staffingRules: [rule],
    })
    expect(cells.find((c) => c.date === WEEK)?.ok).toBe(true)
  })

  it('counts a day-level position override towards coverage', () => {
    const cells = coverage({
      weekStart: WEEK,
      employees,
      // A kitchen helper covering the till that day, exactly as the source
      // roster records with a bare "Cashier" in the cell.
      assignments: [work({ employeeId: 'e1', workDate: WEEK, positionId: 'cashier' })],
      staffingRules: [rule],
    })
    expect(cells.find((c) => c.date === WEEK)?.ok).toBe(true)
  })

  it('does not count someone deployed to another outlet', () => {
    const cells = coverage({
      weekStart: WEEK,
      employees,
      assignments: [work({ employeeId: 'e2', workDate: WEEK, outletId: 'mangoon' })],
      staffingRules: [rule],
    })
    expect(cells.find((c) => c.date === WEEK)?.ok).toBe(false)
  })

  it('applies a rule only on the day it targets', () => {
    const cells = coverage({
      weekStart: WEEK,
      employees,
      assignments: [],
      staffingRules: [{ ...rule, dayOfWeek: 0 }],
    })
    expect(cells).toHaveLength(1)
    expect(cells[0]!.date).toBe('2026-08-30')
  })
})

describe('dailyTotals', () => {
  it('counts working, off and leave, and sums the hours', () => {
    const totals = dailyTotals(
      [
        work({ employeeId: 'e1', workDate: WEEK }),
        off('e2', WEEK),
        { employeeId: 'e1', workDate: '2026-08-25', status: 'LEAVE', startTime: null, endTime: null },
      ],
      WEEK,
    )
    expect(totals[0]).toMatchObject({ date: WEEK, working: 1, off: 1, hours: 10 })
    expect(totals[1]).toMatchObject({ leave: 1, hours: 0 })
    expect(totals).toHaveLength(7)
  })

  it('sums an overnight shift into the day it starts', () => {
    const totals = dailyTotals(
      [work({ employeeId: 'e1', workDate: WEEK, startTime: '16:00', endTime: '02:00', crossesMidnight: true })],
      WEEK,
    )
    expect(totals[0]!.hours).toBe(10)
  })
})
