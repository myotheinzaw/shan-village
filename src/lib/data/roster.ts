import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type {
  Department,
  Employee,
  EmployeeDirectoryEntry,
  LeaveType,
  Outlet,
  Position,
  RosterAssignment,
  RosterPeriod,
  ShiftTemplate,
  StaffingRequirement,
} from '@/types/db'

/**
 * Read helpers shared by the roster screens. Every query here goes through the
 * user-scoped client, so RLS decides what comes back: the same call returns the
 * whole team for a manager and only the caller's own published shifts for a
 * staff member, with no branching in the application.
 */

export async function getOutlets(): Promise<Outlet[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('outlets').select('*').order('sort_order')
  return (data ?? []) as Outlet[]
}

export async function getPositions(includeInactive = false): Promise<Position[]> {
  const supabase = await createSupabaseServerClient()
  let query = supabase.from('positions').select('*').order('sort_order')
  if (!includeInactive) query = query.eq('is_active', true)
  const { data } = await query
  return (data ?? []) as Position[]
}

export async function getDepartments(): Promise<Department[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('departments').select('*').order('sort_order')
  return (data ?? []) as Department[]
}

export async function getShiftTemplates(includeInactive = false): Promise<ShiftTemplate[]> {
  const supabase = await createSupabaseServerClient()
  let query = supabase.from('shift_templates').select('*').order('sort_order')
  if (!includeInactive) query = query.eq('is_active', true)
  const { data } = await query
  return (data ?? []) as ShiftTemplate[]
}

export async function getLeaveTypes(includeInactive = false): Promise<LeaveType[]> {
  const supabase = await createSupabaseServerClient()
  let query = supabase.from('leave_types').select('*').order('sort_order')
  if (!includeInactive) query = query.eq('is_active', true)
  const { data } = await query
  return (data ?? []) as LeaveType[]
}

export async function getEmployees(includeInactive = false): Promise<Employee[]> {
  const supabase = await createSupabaseServerClient()
  let query = supabase.from('employees').select('*').order('full_name')
  if (!includeInactive) query = query.eq('is_active', true)
  const { data } = await query
  return (data ?? []) as Employee[]
}

/** Name/position only. Readable by every signed-in user, unlike `employees`. */
export async function getEmployeeDirectory(): Promise<EmployeeDirectoryEntry[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('employee_directory').select('*').order('full_name')
  return (data ?? []) as EmployeeDirectoryEntry[]
}

export async function getStaffingRequirements(): Promise<StaffingRequirement[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('staffing_requirements').select('*').eq('is_active', true)
  return (data ?? []) as StaffingRequirement[]
}

export async function findPeriod(
  startDate: string,
  outletId: string | null,
  periodType: 'WEEK' | 'MONTH' = 'WEEK',
): Promise<RosterPeriod | null> {
  const supabase = await createSupabaseServerClient()
  let query = supabase
    .from('roster_periods')
    .select('*')
    .eq('start_date', startDate)
    .eq('period_type', periodType)

  query = outletId ? query.eq('outlet_id', outletId) : query.is('outlet_id', null)

  const { data } = await query.maybeSingle()
  return (data as RosterPeriod) ?? null
}

export async function getPeriodsInRange(from: string, to: string): Promise<RosterPeriod[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('roster_periods')
    .select('*')
    .lte('start_date', to)
    .gte('end_date', from)
    .order('start_date')
  return (data ?? []) as RosterPeriod[]
}

export async function getAssignmentsInRange(
  from: string,
  to: string,
  employeeId?: string,
): Promise<RosterAssignment[]> {
  const supabase = await createSupabaseServerClient()
  let query = supabase
    .from('roster_assignments')
    .select('*')
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date')

  if (employeeId) query = query.eq('employee_id', employeeId)

  const { data } = await query
  return (data ?? []) as RosterAssignment[]
}

export async function getAssignmentsForPeriod(periodId: string): Promise<RosterAssignment[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('roster_assignments')
    .select('*')
    .eq('period_id', periodId)
    .order('work_date')
  return (data ?? []) as RosterAssignment[]
}

/** Approved leave days in a range, used to flag conflicts on the roster. */
export async function getApprovedLeaveDays(
  from: string,
  to: string,
): Promise<{ employeeId: string; date: string }[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('leave_requests')
    .select('employee_id, from_date, to_date')
    .eq('status', 'APPROVED')
    .lte('from_date', to)
    .gte('to_date', from)

  const days: { employeeId: string; date: string }[] = []
  for (const row of (data ?? []) as { employee_id: string; from_date: string; to_date: string }[]) {
    const start = new Date(`${row.from_date}T00:00:00Z`)
    const end = new Date(`${row.to_date}T00:00:00Z`)
    for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) {
      const iso = d.toISOString().slice(0, 10)
      if (iso >= from && iso <= to) days.push({ employeeId: row.employee_id, date: iso })
    }
  }
  return days
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createSupabaseServerClient()
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  return count ?? 0
}
