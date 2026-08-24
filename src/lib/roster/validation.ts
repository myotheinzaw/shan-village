import type { AssignmentStatus } from './shift'
import { computeScheduledHours, formatShift, minutesOfDay } from './shift'
import { DAY_SHORT, dayOfWeek, weekDates } from './dates'

/**
 * Roster validation.
 *
 * Every finding is a warning, never a hard block: the brief is explicit that an
 * Admin must be able to override. The roster builder shows these, records an
 * override reason in the audit trail when one is taken, and publishes anyway.
 */

export type Severity = 'error' | 'warning' | 'info'

export interface Finding {
  severity: Severity
  code: string
  message: string
  employeeId?: string
  date?: string
}

export interface ValidationAssignment {
  id?: string
  employeeId: string
  workDate: string
  status: AssignmentStatus
  startTime: string | null
  endTime: string | null
  breakMinutes?: number | null
  crossesMidnight?: boolean | null
  isSplit?: boolean | null
  segment2Start?: string | null
  segment2End?: string | null
  positionId?: string | null
  outletId?: string | null
}

export interface ValidationEmployee {
  id: string
  fullName: string
  isActive: boolean
  positionId: string | null
  departmentId: string | null
  outletId: string | null
}

export interface ApprovedLeaveDay {
  employeeId: string
  date: string
}

export interface StaffingRule {
  outletId: string | null
  positionId: string | null
  departmentId: string | null
  dayOfWeek: number | null
  minStaff: number
  label: string | null
}

export interface ValidationOptions {
  weekStart: string
  assignments: ValidationAssignment[]
  employees: ValidationEmployee[]
  approvedLeave?: ApprovedLeaveDay[]
  staffingRules?: StaffingRule[]
  maxWeeklyHours: number
  maxShiftHours: number
  minOffDays: number
}

/** Absolute start/end minutes for overlap comparison, unrolled across midnight. */
function occupancy(a: ValidationAssignment): [number, number][] {
  if (a.status !== 'WORK' || !a.startTime || !a.endTime) return []
  const spans: [number, number][] = []
  const start = minutesOfDay(a.startTime)

  if (a.isSplit && a.segment2Start && a.segment2End) {
    spans.push([start, minutesOfDay(a.endTime)])
    const s2 = minutesOfDay(a.segment2Start)
    let e2 = minutesOfDay(a.segment2End)
    if (a.crossesMidnight || e2 <= s2) e2 += 1440
    spans.push([s2, e2])
  } else {
    let end = minutesOfDay(a.endTime)
    if (a.crossesMidnight || end <= start) end += 1440
    spans.push([start, end])
  }
  return spans
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1]
}

export function validateRoster(options: ValidationOptions): Finding[] {
  const {
    weekStart,
    assignments,
    employees,
    approvedLeave = [],
    staffingRules = [],
    maxWeeklyHours,
    maxShiftHours,
    minOffDays,
  } = options

  const findings: Finding[] = []
  const dates = weekDates(weekStart)
  const employeeById = new Map(employees.map((e) => [e.id, e]))
  const leaveKeys = new Set(approvedLeave.map((l) => `${l.employeeId}|${l.date}`))

  const byEmployee = new Map<string, ValidationAssignment[]>()
  for (const a of assignments) {
    const list = byEmployee.get(a.employeeId)
    if (list) list.push(a)
    else byEmployee.set(a.employeeId, [a])
  }

  for (const [employeeId, list] of byEmployee) {
    const employee = employeeById.get(employeeId)
    const name = employee?.fullName ?? 'This employee'

    if (employee && !employee.isActive) {
      findings.push({
        severity: 'error',
        code: 'INACTIVE_SCHEDULED',
        employeeId,
        message: `${name} is inactive but is scheduled this week.`,
      })
    }

    // Duplicate assignment on the same date.
    const seen = new Map<string, number>()
    for (const a of list) seen.set(a.workDate, (seen.get(a.workDate) ?? 0) + 1)
    for (const [date, count] of seen) {
      if (count > 1) {
        findings.push({
          severity: 'error',
          code: 'DUPLICATE_ASSIGNMENT',
          employeeId,
          date,
          message: `${name} has ${count} assignments on ${date}.`,
        })
      }
    }

    let weeklyHours = 0
    let offDays = 0

    for (const a of list) {
      const hours = computeScheduledHours({
        status: a.status,
        startTime: a.startTime,
        endTime: a.endTime,
        breakMinutes: a.breakMinutes,
        crossesMidnight: a.crossesMidnight,
        isSplit: a.isSplit,
        segment2Start: a.segment2Start,
        segment2End: a.segment2End,
      })
      weeklyHours += hours
      if (a.status === 'OFF') offDays += 1

      if (hours > maxShiftHours) {
        findings.push({
          severity: 'warning',
          code: 'LONG_SHIFT',
          employeeId,
          date: a.workDate,
          message: `${name} is scheduled ${hours} hours on ${a.workDate} (${formatShift({
            status: a.status,
            startTime: a.startTime,
            endTime: a.endTime,
            crossesMidnight: a.crossesMidnight,
            isSplit: a.isSplit,
            segment2Start: a.segment2Start,
            segment2End: a.segment2End,
          })}), above the ${maxShiftHours} hour warning threshold.`,
        })
      }

      if (a.status === 'WORK' && leaveKeys.has(`${employeeId}|${a.workDate}`)) {
        findings.push({
          severity: 'error',
          code: 'SCHEDULED_ON_LEAVE',
          employeeId,
          date: a.workDate,
          message: `${name} has approved leave on ${a.workDate} but is scheduled to work.`,
        })
      }
    }

    // A shift that runs past midnight must not collide with the next day's.
    const byDate = new Map(list.map((a) => [a.workDate, a]))
    for (const [index, date] of dates.entries()) {
      const today = byDate.get(date)
      const next = index < dates.length - 1 ? byDate.get(dates[index + 1]!) : undefined
      if (!today || !next) continue

      const todaySpans = occupancy(today)
      const nextSpans = occupancy(next).map(
        ([s, e]) => [s + 1440, e + 1440] as [number, number],
      )
      for (const t of todaySpans) {
        for (const n of nextSpans) {
          if (overlaps(t, n)) {
            findings.push({
              severity: 'error',
              code: 'OVERLAPPING_SHIFTS',
              employeeId,
              date,
              message: `${name}'s shift on ${date} runs into their shift on ${dates[index + 1]}.`,
            })
          }
        }
      }
    }

    if (weeklyHours > maxWeeklyHours) {
      findings.push({
        severity: 'warning',
        code: 'EXCESSIVE_HOURS',
        employeeId,
        message: `${name} is scheduled ${Math.round(weeklyHours * 10) / 10} hours this week, above the ${maxWeeklyHours} hour warning threshold.`,
      })
    }

    if (offDays < minOffDays) {
      findings.push({
        severity: 'warning',
        code: 'NO_OFF_DAY',
        employeeId,
        message:
          offDays === 0
            ? `${name} has no OFF day this week.`
            : `${name} has ${offDays} OFF day(s), below the minimum of ${minOffDays}.`,
      })
    }
  }

  // Employees with nothing at all on the roster this week.
  for (const employee of employees) {
    if (!employee.isActive) continue
    if (!byEmployee.has(employee.id)) {
      findings.push({
        severity: 'info',
        code: 'UNASSIGNED_EMPLOYEE',
        employeeId: employee.id,
        message: `${employee.fullName} has no assignments this week.`,
      })
      continue
    }
    const assigned = byEmployee.get(employee.id)!
    const missing = dates.filter((d) => !assigned.some((a) => a.workDate === d))
    if (missing.length > 0) {
      findings.push({
        severity: 'info',
        code: 'MISSING_DAYS',
        employeeId: employee.id,
        message: `${employee.fullName} has no entry for ${missing.length} day(s): ${missing
          .map((d) => DAY_SHORT[dayOfWeek(d)])
          .join(', ')}.`,
      })
    }
  }

  findings.push(...checkStaffing({ weekStart, assignments, employees, staffingRules }))

  return findings
}

export interface CoverageCell {
  date: string
  ruleLabel: string
  required: number
  actual: number
  ok: boolean
}

/** Coverage per configured staffing rule, per day. Used by the roster header. */
export function checkStaffing(options: {
  weekStart: string
  assignments: ValidationAssignment[]
  employees: ValidationEmployee[]
  staffingRules: StaffingRule[]
}): Finding[] {
  return coverage(options)
    .filter((c) => !c.ok)
    .map((c) => ({
      severity: 'warning' as const,
      code: 'STAFFING_GAP',
      date: c.date,
      message: `${c.ruleLabel} on ${c.date}: ${c.actual} of ${c.required} required.`,
    }))
}

export function coverage(options: {
  weekStart: string
  assignments: ValidationAssignment[]
  employees: ValidationEmployee[]
  staffingRules: StaffingRule[]
}): CoverageCell[] {
  const { weekStart, assignments, employees, staffingRules } = options
  const dates = weekDates(weekStart)
  const employeeById = new Map(employees.map((e) => [e.id, e]))
  const cells: CoverageCell[] = []

  for (const rule of staffingRules) {
    for (const date of dates) {
      if (rule.dayOfWeek !== null && rule.dayOfWeek !== dayOfWeek(date)) continue

      const actual = assignments.filter((a) => {
        if (a.workDate !== date || a.status !== 'WORK') return false
        const employee = employeeById.get(a.employeeId)
        if (!employee) return false

        // A day-level override on the assignment wins over the employee's own
        // outlet or position: that is exactly what an override is for.
        const outletId = a.outletId ?? employee.outletId
        const positionId = a.positionId ?? employee.positionId

        if (rule.outletId && outletId !== rule.outletId) return false
        if (rule.positionId && positionId !== rule.positionId) return false
        if (rule.departmentId && employee.departmentId !== rule.departmentId) return false
        return true
      }).length

      cells.push({
        date,
        ruleLabel: rule.label ?? 'Staffing requirement',
        required: rule.minStaff,
        actual,
        ok: actual >= rule.minStaff,
      })
    }
  }

  return cells
}

/** Per-day totals shown under the weekly grid. */
export function dailyTotals(assignments: ValidationAssignment[], weekStart: string) {
  const dates = weekDates(weekStart)
  return dates.map((date) => {
    const onDate = assignments.filter((a) => a.workDate === date)
    return {
      date,
      working: onDate.filter((a) => a.status === 'WORK').length,
      off: onDate.filter((a) => a.status === 'OFF').length,
      leave: onDate.filter((a) => a.status === 'LEAVE').length,
      ph: onDate.filter((a) => a.status === 'PH').length,
      hours:
        Math.round(
          onDate.reduce(
            (sum, a) =>
              sum +
              computeScheduledHours({
                status: a.status,
                startTime: a.startTime,
                endTime: a.endTime,
                breakMinutes: a.breakMinutes,
                crossesMidnight: a.crossesMidnight,
                isSplit: a.isSplit,
                segment2Start: a.segment2Start,
                segment2End: a.segment2End,
              }),
            0,
          ) * 100,
        ) / 100,
    }
  })
}
