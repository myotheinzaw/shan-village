import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatShift } from '@/lib/roster/shift'
import type { ApprovalAction, RequestStatus, RequestType } from '@/types/db'

/**
 * One shape for all five request types, so the Request Centre and the Approval
 * Centre are each a single list rather than five near-identical ones.
 *
 * `financial` marks the two money requests; the UI uses it to hide amounts from
 * anyone without finance.view. RLS already prevents those rows from arriving at
 * all, so this only controls presentation of rows the user is entitled to see.
 */
export interface UnifiedRequest {
  type: RequestType
  id: string
  reference: string
  employeeId: string
  employeeName: string
  status: RequestStatus
  title: string
  detail: string
  reason: string | null
  createdAt: string
  submittedAt: string | null
  financial: boolean
  amount: number | null
  currency: string | null
  managerComment: string | null
  adminComment: string | null
  shortNotice: boolean
  /** Swap only: whether the colleague has answered yet. */
  counterpartyResponse: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null
  counterpartyEmployeeId: string | null
  appliedAt: string | null
}

/**
 * Supabase's generated row type is `any` without generated types, so each query
 * result is narrowed once, here, to the columns this module actually reads.
 */
function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[]
}

interface CommonRequestRow {
  id: string
  reference: string
  status: RequestStatus
  reason: string | null
  created_at: string
  submitted_at: string | null
  manager_comment: string | null
  admin_comment: string | null
}

interface LeaveRow extends CommonRequestRow {
  employee_id: string
  leave_type_id: string
  from_date: string
  to_date: string
  total_days: number
  short_notice: boolean
}

interface ShiftChangeRow extends CommonRequestRow {
  employee_id: string
  work_date: string
  current_summary: string | null
  requested_status: string
  requested_start: string | null
  requested_end: string | null
  requested_crosses: boolean
  applied_at: string | null
}

interface ShiftSwapRow extends CommonRequestRow {
  requester_employee_id: string
  requester_date: string
  requester_summary: string | null
  counterparty_employee_id: string
  counterparty_date: string
  counterparty_summary: string | null
  counterparty_response: 'PENDING' | 'ACCEPTED' | 'DECLINED'
  applied_at: string | null
}

interface EncashmentRow extends CommonRequestRow {
  employee_id: string
  leave_year: number
  requested_days: number
}

interface CashAdvanceRow extends CommonRequestRow {
  employee_id: string
  amount: number
  currency: string
  requested_payment_date: string | null
}

interface SwapAssignmentRow {
  id: string
  employee_id: string
  work_date: string
  status: 'WORK'
  start_time: string | null
  end_time: string | null
  crosses_midnight: boolean
  is_split: boolean
  segment2_start: string | null
  segment2_end: string | null
}

interface DirectoryRow {
  id: string
  full_name: string
  preferred_name: string | null
  is_active?: boolean
}

const PENDING: RequestStatus[] = ['SUBMITTED', 'MANAGER_REVIEWED']

export function isPending(status: RequestStatus): boolean {
  return PENDING.includes(status)
}

interface LoadOptions {
  /** Restrict to one employee (the "my requests" view). */
  employeeId?: string
  /** Only requests still awaiting a decision. */
  pendingOnly?: boolean
}

export async function loadRequests(options: LoadOptions = {}): Promise<UnifiedRequest[]> {
  const supabase = await createSupabaseServerClient()

  const names = new Map<string, string>()
  const { data: directory } = await supabase.from('employee_directory').select('id, full_name, preferred_name')
  for (const e of rows<DirectoryRow>(directory)) {
    names.set(e.id, e.preferred_name || e.full_name)
  }

  const { data: leaveTypes } = await supabase.from('leave_types').select('id, name')
  const leaveTypeName = new Map(rows<{ id: string; name: string }>(leaveTypes).map((t) => [t.id, t.name]))

  // Each query is written out rather than routed through a generic helper:
  // the Supabase builder's types are recursive, and abstracting over them
  // costs more than it saves here.
  const byEmployee = options.employeeId
  const pending = options.pendingOnly ? PENDING : null

  const leaveQuery = supabase.from('leave_requests').select('*')
  if (byEmployee) leaveQuery.eq('employee_id', byEmployee)
  if (pending) leaveQuery.in('status', pending)

  const changeQuery = supabase.from('shift_change_requests').select('*')
  if (byEmployee) changeQuery.eq('employee_id', byEmployee)
  if (pending) changeQuery.in('status', pending)

  const swapQuery = supabase.from('shift_swap_requests').select('*')
  if (byEmployee) swapQuery.eq('requester_employee_id', byEmployee)
  if (pending) swapQuery.in('status', pending)

  const encashQuery = supabase.from('leave_encashment_requests').select('*')
  if (byEmployee) encashQuery.eq('employee_id', byEmployee)
  if (pending) encashQuery.in('status', pending)

  const advanceQuery = supabase.from('cash_advance_requests').select('*')
  if (byEmployee) advanceQuery.eq('employee_id', byEmployee)
  if (pending) advanceQuery.in('status', pending)

  const [leave, change, swap, encash, advance] = await Promise.all([
    leaveQuery,
    changeQuery,
    swapQuery,
    encashQuery,
    advanceQuery,
  ])

  const requests: UnifiedRequest[] = []

  for (const row of rows<LeaveRow>(leave.data)) {
    requests.push({
      type: 'LEAVE',
      id: row.id,
      reference: row.reference,
      employeeId: row.employee_id,
      employeeName: names.get(row.employee_id) ?? 'Employee',
      status: row.status,
      title: leaveTypeName.get(row.leave_type_id) ?? 'Leave',
      detail: `${row.from_date} → ${row.to_date} · ${row.total_days} day${Number(row.total_days) === 1 ? '' : 's'}`,
      reason: row.reason,
      createdAt: row.created_at,
      submittedAt: row.submitted_at,
      financial: false,
      amount: null,
      currency: null,
      managerComment: row.manager_comment,
      adminComment: row.admin_comment,
      shortNotice: row.short_notice,
      counterpartyResponse: null,
      counterpartyEmployeeId: null,
      appliedAt: null,
    })
  }

  for (const row of rows<ShiftChangeRow>(change.data)) {
    const requested = formatShift({
      status: row.requested_status as 'WORK',
      startTime: row.requested_start,
      endTime: row.requested_end,
      crossesMidnight: row.requested_crosses,
    })
    requests.push({
      type: 'SHIFT_CHANGE',
      id: row.id,
      reference: row.reference,
      employeeId: row.employee_id,
      employeeName: names.get(row.employee_id) ?? 'Employee',
      status: row.status,
      title: 'Shift change',
      detail: `${row.work_date} · ${row.current_summary ?? '—'} → ${requested}`,
      reason: row.reason,
      createdAt: row.created_at,
      submittedAt: row.submitted_at,
      financial: false,
      amount: null,
      currency: null,
      managerComment: row.manager_comment,
      adminComment: row.admin_comment,
      shortNotice: false,
      counterpartyResponse: null,
      counterpartyEmployeeId: null,
      appliedAt: row.applied_at,
    })
  }

  for (const row of rows<ShiftSwapRow>(swap.data)) {
    requests.push({
      type: 'SHIFT_SWAP',
      id: row.id,
      reference: row.reference,
      employeeId: row.requester_employee_id,
      employeeName: names.get(row.requester_employee_id) ?? 'Employee',
      status: row.status,
      title: `Swap with ${names.get(row.counterparty_employee_id) ?? 'a colleague'}`,
      detail: `${row.requester_date} ${row.requester_summary ?? ''} ⇄ ${row.counterparty_date} ${row.counterparty_summary ?? ''}`,
      reason: row.reason,
      createdAt: row.created_at,
      submittedAt: row.submitted_at,
      financial: false,
      amount: null,
      currency: null,
      managerComment: row.manager_comment,
      adminComment: row.admin_comment,
      shortNotice: false,
      counterpartyResponse: row.counterparty_response,
      counterpartyEmployeeId: row.counterparty_employee_id,
      appliedAt: row.applied_at,
    })
  }

  for (const row of rows<EncashmentRow>(encash.data)) {
    requests.push({
      type: 'LEAVE_ENCASHMENT',
      id: row.id,
      reference: row.reference,
      employeeId: row.employee_id,
      employeeName: names.get(row.employee_id) ?? 'Employee',
      status: row.status,
      title: 'Leave encashment / cash alternative',
      detail: `${row.requested_days} day${Number(row.requested_days) === 1 ? '' : 's'} · leave year ${row.leave_year}`,
      reason: row.reason,
      createdAt: row.created_at,
      submittedAt: row.submitted_at,
      financial: true,
      amount: null,
      currency: null,
      managerComment: row.manager_comment,
      adminComment: row.admin_comment,
      shortNotice: false,
      counterpartyResponse: null,
      counterpartyEmployeeId: null,
      appliedAt: null,
    })
  }

  for (const row of rows<CashAdvanceRow>(advance.data)) {
    requests.push({
      type: 'CASH_ADVANCE',
      id: row.id,
      reference: row.reference,
      employeeId: row.employee_id,
      employeeName: names.get(row.employee_id) ?? 'Employee',
      status: row.status,
      title: 'Cash / salary advance',
      detail: row.requested_payment_date ? `Requested for ${row.requested_payment_date}` : 'Payment date not specified',
      reason: row.reason,
      createdAt: row.created_at,
      submittedAt: row.submitted_at,
      financial: true,
      amount: Number(row.amount),
      currency: row.currency,
      managerComment: row.manager_comment,
      adminComment: row.admin_comment,
      shortNotice: false,
      counterpartyResponse: null,
      counterpartyEmployeeId: null,
      appliedAt: null,
    })
  }

  return requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Swaps addressed to this employee that they have not answered yet. */
export async function loadIncomingSwaps(employeeId: string) {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('shift_swap_requests')
    .select('*')
    .eq('counterparty_employee_id', employeeId)
    .eq('counterparty_response', 'PENDING')
    .in('status', ['SUBMITTED', 'MANAGER_REVIEWED'])

  const { data: directory } = await supabase.from('employee_directory').select('id, full_name, preferred_name')
  const names = new Map(
    rows<DirectoryRow>(directory).map((e) => [e.id, e.preferred_name || e.full_name]),
  )

  return rows<ShiftSwapRow>(data).map((row) => {
    return {
      id: row.id,
      reference: row.reference,
      requesterName: names.get(row.requester_employee_id) ?? 'A colleague',
      theirDate: row.requester_date,
      theirShift: row.requester_summary,
      myDate: row.counterparty_date,
      myShift: row.counterparty_summary,
      reason: row.reason,
    }
  })
}

export async function loadApprovalHistory(
  type: RequestType,
  requestId: string,
): Promise<ApprovalAction[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('approval_actions')
    .select('*')
    .eq('request_type', type)
    .eq('request_id', requestId)
    .order('created_at')
  return (data ?? []) as ApprovalAction[]
}

/**
 * Shifts available to swap: the employee's own upcoming published shifts, and
 * colleagues' upcoming published shifts. RLS already limits this to published
 * rows the caller may see, so nothing here can expose a draft roster.
 */
export async function loadSwapCandidates(employeeId: string, from: string, to: string) {
  const supabase = await createSupabaseServerClient()

  const [{ data: assignments }, { data: directory }] = await Promise.all([
    supabase
      .from('roster_assignments')
      .select('id, employee_id, work_date, status, start_time, end_time, crosses_midnight, is_split, segment2_start, segment2_end')
      .gte('work_date', from)
      .lte('work_date', to)
      .eq('status', 'WORK')
      .order('work_date'),
    supabase.from('employee_directory').select('id, full_name, preferred_name, is_active'),
  ])

  const names = new Map(
    rows<DirectoryRow>(directory)
      .filter((e) => e.is_active !== false)
      .map((e) => [e.id, e.preferred_name || e.full_name]),
  )

  const candidates = rows<SwapAssignmentRow>(assignments).map((row) => {
    return {
      assignmentId: row.id,
      employeeId: row.employee_id,
      employeeName: names.get(row.employee_id) ?? 'Colleague',
      date: row.work_date,
      summary: formatShift({
        status: 'WORK',
        startTime: row.start_time,
        endTime: row.end_time,
        crossesMidnight: row.crosses_midnight,
        isSplit: row.is_split,
        segment2Start: row.segment2_start,
        segment2End: row.segment2_end,
      }),
    }
  })

  return {
    mine: candidates.filter((c) => c.employeeId === employeeId),
    colleagues: candidates.filter((c) => c.employeeId !== employeeId && names.has(c.employeeId)),
  }
}
