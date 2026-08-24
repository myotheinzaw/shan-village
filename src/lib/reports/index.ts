import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getEmployeeDirectory, getLeaveTypes, getOutlets, getPositions } from '@/lib/data/roster'
import { formatShift } from '@/lib/roster/shift'
import { loadRequests } from '@/lib/data/requests'
import type { LeaveRequest, RosterAssignment } from '@/types/db'

/**
 * Report builders. Each returns a plain header + rows structure so the same
 * function can render an on-screen table and produce a CSV, with no chance of
 * the two disagreeing.
 */
export interface ReportTable {
  title: string
  headers: string[]
  rows: (string | number | null)[][]
  /** Totals row rendered under the table and appended to the export. */
  totals?: (string | number | null)[]
}

export interface ReportRange {
  from: string
  to: string
  employeeId?: string
  positionId?: string
  outletId?: string
  status?: string
}

const STATUS_LABEL: Record<string, string> = {
  WORK: 'Working',
  OFF: 'OFF',
  PH: 'Public holiday',
  LEAVE: 'Leave',
  TRIAL: 'Trial',
  OTHER: 'Other',
}

export async function rosterReport(range: ReportRange): Promise<ReportTable> {
  const supabase = await createSupabaseServerClient()
  const [directory, positions, outlets, leaveTypes] = await Promise.all([
    getEmployeeDirectory(),
    getPositions(true),
    getOutlets(),
    getLeaveTypes(true),
  ])

  const query = supabase
    .from('roster_assignments')
    .select('*')
    .gte('work_date', range.from)
    .lte('work_date', range.to)
    .order('work_date')
  if (range.employeeId) query.eq('employee_id', range.employeeId)
  if (range.status) query.eq('status', range.status)

  const { data } = await query
  let assignments = (data ?? []) as RosterAssignment[]

  const employeeById = new Map(directory.map((e) => [e.id, e]))
  const positionById = new Map(positions.map((p) => [p.id, p]))
  const outletById = new Map(outlets.map((o) => [o.id, o]))
  const leaveTypeById = new Map(leaveTypes.map((t) => [t.id, t]))

  if (range.positionId) {
    assignments = assignments.filter(
      (a) => (a.position_id ?? employeeById.get(a.employee_id)?.position_id) === range.positionId,
    )
  }
  if (range.outletId) {
    assignments = assignments.filter(
      (a) => (a.outlet_id ?? employeeById.get(a.employee_id)?.outlet_id) === range.outletId,
    )
  }

  const rows = assignments.map((a) => {
    const employee = employeeById.get(a.employee_id)
    const positionId = a.position_id ?? employee?.position_id ?? null
    const outletId = a.outlet_id ?? employee?.outlet_id ?? null
    return [
      a.work_date,
      employee?.full_name ?? 'Unknown',
      positionById.get(positionId ?? '')?.name ?? '',
      outletById.get(outletId ?? '')?.name ?? '',
      STATUS_LABEL[a.status] ?? a.status,
      a.status === 'WORK'
        ? formatShift({
            status: a.status,
            startTime: a.start_time,
            endTime: a.end_time,
            crossesMidnight: a.crosses_midnight,
            isSplit: a.is_split,
            segment2Start: a.segment2_start,
            segment2End: a.segment2_end,
          })
        : '',
      a.break_minutes || '',
      Number(a.scheduled_hours ?? 0),
      a.status === 'LEAVE' ? (leaveTypeById.get(a.leave_type_id ?? '')?.name ?? '') : '',
      a.note ?? '',
      a.source_value ?? '',
    ]
  })

  return {
    title: `Roster ${range.from} to ${range.to}`,
    headers: [
      'Date', 'Employee', 'Position', 'Outlet', 'Status', 'Shift',
      'Break (min)', 'Hours', 'Leave type', 'Note', 'Imported value',
    ],
    rows,
    totals: [
      'Total', '', '', '', '', '', '',
      Math.round(rows.reduce((sum, r) => sum + Number(r[7] ?? 0), 0) * 100) / 100,
      '', '', '',
    ],
  }
}

export async function hoursReport(range: ReportRange): Promise<ReportTable> {
  const supabase = await createSupabaseServerClient()
  const [directory, positions] = await Promise.all([getEmployeeDirectory(), getPositions(true)])

  const query = supabase
    .from('roster_assignments')
    .select('*')
    .gte('work_date', range.from)
    .lte('work_date', range.to)
  if (range.employeeId) query.eq('employee_id', range.employeeId)

  const { data } = await query
  const assignments = (data ?? []) as RosterAssignment[]
  const positionById = new Map(positions.map((p) => [p.id, p]))

  const byEmployee = new Map<string, RosterAssignment[]>()
  for (const a of assignments) {
    const list = byEmployee.get(a.employee_id)
    if (list) list.push(a)
    else byEmployee.set(a.employee_id, [a])
  }

  const rows = [...byEmployee.entries()]
    .map(([employeeId, list]) => {
      const employee = directory.find((e) => e.id === employeeId)
      if (range.positionId && employee?.position_id !== range.positionId) return null
      const hours = list.reduce((sum, a) => sum + Number(a.scheduled_hours ?? 0), 0)
      return [
        employee?.full_name ?? 'Unknown',
        positionById.get(employee?.position_id ?? '')?.name ?? '',
        list.filter((a) => a.status === 'WORK').length,
        list.filter((a) => a.status === 'OFF').length,
        list.filter((a) => a.status === 'PH').length,
        list.filter((a) => a.status === 'LEAVE').length,
        Math.round(hours * 100) / 100,
      ]
    })
    .filter((row): row is (string | number)[] => row !== null)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))

  return {
    title: `Employee hours ${range.from} to ${range.to}`,
    headers: ['Employee', 'Position', 'Working days', 'OFF days', 'Public holiday', 'Leave days', 'Scheduled hours'],
    rows,
    totals: [
      'Total',
      '',
      rows.reduce((sum, r) => sum + Number(r[2] ?? 0), 0),
      rows.reduce((sum, r) => sum + Number(r[3] ?? 0), 0),
      rows.reduce((sum, r) => sum + Number(r[4] ?? 0), 0),
      rows.reduce((sum, r) => sum + Number(r[5] ?? 0), 0),
      Math.round(rows.reduce((sum, r) => sum + Number(r[6] ?? 0), 0) * 100) / 100,
    ],
  }
}

export async function leaveReport(range: ReportRange): Promise<ReportTable> {
  const supabase = await createSupabaseServerClient()
  const [directory, leaveTypes] = await Promise.all([getEmployeeDirectory(), getLeaveTypes(true)])

  const query = supabase
    .from('leave_requests')
    .select('*')
    .lte('from_date', range.to)
    .gte('to_date', range.from)
    .order('from_date')
  if (range.employeeId) query.eq('employee_id', range.employeeId)
  if (range.status) query.eq('status', range.status)

  const { data } = await query
  const requests = (data ?? []) as LeaveRequest[]
  const nameById = new Map(directory.map((e) => [e.id, e.full_name]))
  const typeById = new Map(leaveTypes.map((t) => [t.id, t.name]))

  const rows = requests.map((r) => [
    r.reference,
    nameById.get(r.employee_id) ?? 'Unknown',
    typeById.get(r.leave_type_id) ?? '',
    r.from_date,
    r.to_date,
    Number(r.total_days),
    r.status,
    r.notice_days ?? '',
    r.short_notice ? 'Yes' : 'No',
    r.reason ?? '',
  ])

  return {
    title: `Leave ${range.from} to ${range.to}`,
    headers: [
      'Reference', 'Employee', 'Type', 'From', 'To', 'Days',
      'Status', 'Notice (days)', 'Short notice', 'Reason',
    ],
    rows,
    totals: ['Total', '', '', '', '', Math.round(rows.reduce((s, r) => s + Number(r[5] ?? 0), 0) * 100) / 100, '', '', '', ''],
  }
}

/**
 * The request report deliberately reads through loadRequests(), so the
 * financial rows it contains are exactly the ones RLS lets this user see.
 */
export async function requestReport(range: ReportRange): Promise<ReportTable> {
  const requests = await loadRequests({})
  const inRange = requests.filter((r) => {
    const created = r.createdAt.slice(0, 10)
    return created >= range.from && created <= range.to
  })

  const rows = inRange.map((r) => [
    r.reference,
    r.type.replace('_', ' '),
    r.employeeName,
    r.title,
    r.detail,
    r.status,
    r.createdAt.slice(0, 10),
    r.submittedAt ? r.submittedAt.slice(0, 10) : '',
    r.financial && r.amount !== null ? `${r.currency} ${r.amount.toFixed(2)}` : '',
    r.reason ?? '',
  ])

  return {
    title: `Requests ${range.from} to ${range.to}`,
    headers: [
      'Reference', 'Type', 'Employee', 'Summary', 'Detail',
      'Status', 'Raised', 'Submitted', 'Amount', 'Reason',
    ],
    rows,
  }
}

export const REPORTS = {
  roster: rosterReport,
  hours: hoursReport,
  leave: leaveReport,
  requests: requestReport,
} as const

export type ReportKey = keyof typeof REPORTS
