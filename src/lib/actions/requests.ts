'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission, getCurrentUser, AuthorizationError } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { actionFailure, type ActionResult } from '@/lib/actions/result'
import { daysBetween, inclusiveDays, todayInTimeZone } from '@/lib/roster/dates'
import type { RequestType } from '@/types/db'

/**
 * The five request types. Creation lives here; every status transition goes
 * through the decide_request() database function so the status vocabulary,
 * the approval history and the notification can never drift apart.
 */

function text(form: FormData, key: string): string | null {
  const value = form.get(key)
  if (value === null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

/** The employee record the caller is allowed to raise requests for. */
async function currentEmployee() {
  const user = await getCurrentUser()
  if (!user) throw new AuthorizationError('requests.create')
  if (!user.employee) {
    throw new Error(
      'Your login is not linked to an employee record yet. Ask the office to link it before raising requests.',
    )
  }
  return { user, employee: user.employee }
}

const REVALIDATE = ['/staff/requests', '/my-requests', '/approvals']
function revalidateRequests() {
  for (const path of REVALIDATE) revalidatePath(path)
}

/* -------------------------------------------------------------------------- */
/* Shift change                                                               */
/* -------------------------------------------------------------------------- */

const shiftChangeSchema = z.object({
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  requested_status: z.enum(['WORK', 'OFF', 'PH', 'LEAVE', 'TRIAL', 'OTHER']),
  requested_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  requested_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  requested_crosses: z.boolean(),
  reason: z.string().trim().min(3, 'Give a short reason').max(1000),
})

export async function createShiftChangeRequest(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    await assertPermission('requests.create')
    const { employee } = await currentEmployee()

    const isWork = (text(form, 'requested_status') ?? 'WORK') === 'WORK'
    const value = shiftChangeSchema.parse({
      work_date: text(form, 'work_date') ?? '',
      requested_status: text(form, 'requested_status') ?? 'WORK',
      requested_start: isWork ? text(form, 'requested_start') : null,
      requested_end: isWork ? text(form, 'requested_end') : null,
      requested_crosses: form.get('requested_crosses') === 'on',
      reason: text(form, 'reason') ?? '',
    })

    if (value.requested_status === 'WORK' && !value.requested_start) {
      return { ok: false, error: 'A working shift needs a start time.' }
    }

    const supabase = await createSupabaseServerClient()

    // Snapshot what the roster says now, so the reviewer sees the before/after
    // even if the roster changes in the meantime.
    const { data: current } = await supabase
      .from('roster_assignments')
      .select('id, status, start_time, end_time, crosses_midnight')
      .eq('employee_id', employee.id)
      .eq('work_date', value.work_date)
      .maybeSingle()

    const currentSummary = current
      ? current.status === 'WORK'
        ? `${current.start_time?.slice(0, 5) ?? '?'}–${current.end_time?.slice(0, 5) ?? '?'}`
        : current.status
      : 'No assignment'

    const { data, error } = await supabase
      .from('shift_change_requests')
      .insert({
        employee_id: employee.id,
        work_date: value.work_date,
        current_assignment_id: current?.id ?? null,
        current_summary: currentSummary,
        requested_status: value.requested_status,
        requested_start: value.requested_start,
        requested_end: value.requested_end,
        requested_crosses: value.requested_crosses,
        reason: value.reason,
        status: 'DRAFT',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const submitted = await supabase.rpc('decide_request', {
      p_request_type: 'SHIFT_CHANGE',
      p_request_id: data.id,
      p_action: 'SUBMIT',
      p_comment: null,
    })
    if (submitted.error) throw new Error(submitted.error.message)

    revalidateRequests()
    return { ok: true, message: 'Shift change request submitted.', id: data.id }
  } catch (error) {
    return actionFailure(error)
  }
}

/* -------------------------------------------------------------------------- */
/* Shift swap                                                                  */
/* -------------------------------------------------------------------------- */

export async function createShiftSwapRequest(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    await assertPermission('requests.create')
    const { employee } = await currentEmployee()

    const myAssignmentId = text(form, 'requester_assignment_id')
    const counterpartyEmployeeId = text(form, 'counterparty_employee_id')
    const counterpartyAssignmentId = text(form, 'counterparty_assignment_id')
    const reason = text(form, 'reason')

    if (!myAssignmentId) return { ok: false, error: 'Choose which of your shifts you want to swap.' }
    if (!counterpartyEmployeeId) return { ok: false, error: 'Choose the colleague to swap with.' }
    if (!counterpartyAssignmentId) return { ok: false, error: 'Choose the colleague’s shift.' }
    if (counterpartyEmployeeId === employee.id) {
      return { ok: false, error: 'You cannot swap a shift with yourself.' }
    }

    const supabase = await createSupabaseServerClient()
    const { data: assignments, error: loadError } = await supabase
      .from('roster_assignments')
      .select('id, employee_id, work_date, status, start_time, end_time')
      .in('id', [myAssignmentId, counterpartyAssignmentId])
    if (loadError) throw new Error(loadError.message)

    const mine = assignments?.find((a) => a.id === myAssignmentId)
    const theirs = assignments?.find((a) => a.id === counterpartyAssignmentId)
    if (!mine || !theirs) return { ok: false, error: 'One of those shifts no longer exists.' }
    if (mine.employee_id !== employee.id) {
      return { ok: false, error: 'You can only offer your own shift.' }
    }

    const summarise = (a: typeof mine) =>
      a.status === 'WORK' ? `${a.start_time?.slice(0, 5)}–${a.end_time?.slice(0, 5)}` : a.status

    const { data, error } = await supabase
      .from('shift_swap_requests')
      .insert({
        requester_employee_id: employee.id,
        requester_assignment_id: mine.id,
        requester_date: mine.work_date,
        requester_summary: summarise(mine),
        counterparty_employee_id: counterpartyEmployeeId,
        counterparty_assignment_id: theirs.id,
        counterparty_date: theirs.work_date,
        counterparty_summary: summarise(theirs),
        reason,
        status: 'DRAFT',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const submitted = await supabase.rpc('decide_request', {
      p_request_type: 'SHIFT_SWAP',
      p_request_id: data.id,
      p_action: 'SUBMIT',
      p_comment: null,
    })
    if (submitted.error) throw new Error(submitted.error.message)

    // Ask the colleague first. Management only sees it once they accept.
    const { data: colleague } = await supabase
      .from('employees')
      .select('profile_id')
      .eq('id', counterpartyEmployeeId)
      .maybeSingle()

    if (colleague?.profile_id) {
      await supabase.rpc('notify', {
        p_profile_ids: [colleague.profile_id],
        p_type: 'SHIFT_SWAP_REQUESTED',
        p_title: 'A colleague has asked to swap shifts',
        p_body: `${employee.full_name} would like to swap their ${mine.work_date} shift for yours on ${theirs.work_date}.`,
        p_link: '/staff/requests',
        p_priority: 'HIGH',
      })
    }

    revalidateRequests()
    return { ok: true, message: 'Swap request sent to your colleague.', id: data.id }
  } catch (error) {
    return actionFailure(error)
  }
}

/** The colleague's answer. Only they can give it — enforced by RLS. */
export async function respondToSwap(
  requestId: string,
  response: 'ACCEPTED' | 'DECLINED',
  comment?: string,
): Promise<ActionResult> {
  try {
    const { employee } = await currentEmployee()
    const supabase = await createSupabaseServerClient()

    const { data: request } = await supabase
      .from('shift_swap_requests')
      .select('id, counterparty_employee_id, requester_employee_id, status')
      .eq('id', requestId)
      .maybeSingle()

    if (!request) return { ok: false, error: 'That swap request no longer exists.' }
    if (request.counterparty_employee_id !== employee.id) {
      return { ok: false, error: 'Only the colleague asked can answer this swap.' }
    }

    const { error } = await supabase
      .from('shift_swap_requests')
      .update({
        counterparty_response: response,
        counterparty_responded_at: new Date().toISOString(),
        counterparty_comment: comment ?? null,
        // A declined swap is finished; an accepted one waits for management.
        status: response === 'DECLINED' ? 'REJECTED' : request.status,
      })
      .eq('id', requestId)
    if (error) throw new Error(error.message)

    await supabase.from('approval_actions').insert({
      request_type: 'SHIFT_SWAP',
      request_id: requestId,
      employee_id: request.requester_employee_id,
      action: response === 'ACCEPTED' ? 'ACCEPT' : 'DECLINE',
      comment: comment ?? null,
    })

    const { data: requester } = await supabase
      .from('employees')
      .select('profile_id')
      .eq('id', request.requester_employee_id)
      .maybeSingle()

    if (requester?.profile_id) {
      await supabase.rpc('notify', {
        p_profile_ids: [requester.profile_id],
        p_type: response === 'ACCEPTED' ? 'SWAP_ACCEPTED' : 'SWAP_DECLINED',
        p_title:
          response === 'ACCEPTED'
            ? 'Your colleague accepted the swap'
            : 'Your colleague declined the swap',
        p_body:
          response === 'ACCEPTED'
            ? 'It now needs a manager’s approval before the roster changes.'
            : comment ?? null,
        p_link: '/staff/requests',
        p_priority: 'NORMAL',
      })
    }

    revalidateRequests()
    return {
      ok: true,
      message:
        response === 'ACCEPTED'
          ? 'Swap accepted. It now goes to a manager for approval.'
          : 'Swap declined.',
    }
  } catch (error) {
    return actionFailure(error)
  }
}

/* -------------------------------------------------------------------------- */
/* Leave                                                                       */
/* -------------------------------------------------------------------------- */

export async function createLeaveRequest(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    await assertPermission('requests.create')
    const { employee } = await currentEmployee()
    const settings = await getSettings()

    const leaveTypeId = text(form, 'leave_type_id')
    const fromDate = text(form, 'from_date')
    const toDate = text(form, 'to_date')
    const reason = text(form, 'reason')
    const attachmentUrl = text(form, 'attachment_url')

    if (!leaveTypeId) return { ok: false, error: 'Choose a leave type.' }
    if (!fromDate || !toDate) return { ok: false, error: 'Choose the first and last day.' }
    if (toDate < fromDate) return { ok: false, error: 'The last day cannot be before the first day.' }

    const totalDays = inclusiveDays(fromDate, toDate)
    const today = todayInTimeZone(settings.timezone)
    const noticeDays = daysBetween(today, fromDate)
    const shortNotice = noticeDays < settings.leave_advance_notice_days

    // Short notice is a warning by default. It only blocks when the Admin has
    // deliberately turned `leave_notice_blocks` on.
    if (shortNotice && settings.leave_notice_blocks) {
      return {
        ok: false,
        error: `Leave must be requested at least ${settings.leave_advance_notice_days} days in advance. This request gives ${noticeDays} days' notice.`,
      }
    }

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('leave_requests')
      .insert({
        employee_id: employee.id,
        leave_type_id: leaveTypeId,
        from_date: fromDate,
        to_date: toDate,
        total_days: totalDays,
        reason,
        attachment_url: attachmentUrl,
        notice_days: noticeDays,
        short_notice: shortNotice,
        status: 'DRAFT',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const submitted = await supabase.rpc('decide_request', {
      p_request_type: 'LEAVE',
      p_request_id: data.id,
      p_action: 'SUBMIT',
      p_comment: null,
    })
    if (submitted.error) throw new Error(submitted.error.message)

    revalidateRequests()
    return {
      ok: true,
      id: data.id,
      message: shortNotice
        ? `Leave request submitted. It gives ${noticeDays} days' notice, inside the standard ${settings.leave_advance_notice_days}-day period, so it may need exception approval.`
        : 'Leave request submitted.',
    }
  } catch (error) {
    return actionFailure(error)
  }
}

/* -------------------------------------------------------------------------- */
/* Leave encashment — financial                                                */
/* -------------------------------------------------------------------------- */

export async function createEncashmentRequest(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    await assertPermission('requests.create')
    const { employee } = await currentEmployee()
    const settings = await getSettings()

    const leaveYear = Number(text(form, 'leave_year') ?? new Date().getFullYear())
    const requestedDays = Number(text(form, 'requested_days') ?? 0)
    const reason = text(form, 'reason')
    const requestedDate = text(form, 'requested_date')
    const acknowledged = form.get('policy_acknowledged') === 'on'

    if (!Number.isFinite(requestedDays) || requestedDays <= 0) {
      return { ok: false, error: 'Enter how many days you would like to encash.' }
    }
    if (settings.encashment_max_days > 0 && requestedDays > settings.encashment_max_days) {
      return {
        ok: false,
        error: `The configured maximum is ${settings.encashment_max_days} days.`,
      }
    }
    if (!acknowledged) {
      return { ok: false, error: 'Please confirm you have read the policy note before submitting.' }
    }

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('leave_encashment_requests')
      .insert({
        employee_id: employee.id,
        leave_year: leaveYear,
        requested_days: requestedDays,
        reason,
        requested_date: requestedDate,
        policy_acknowledged: true,
        // Stored with the request so the record shows exactly what was agreed to.
        policy_text: settings.encashment_policy_text,
        status: 'DRAFT',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const submitted = await supabase.rpc('decide_request', {
      p_request_type: 'LEAVE_ENCASHMENT',
      p_request_id: data.id,
      p_action: 'SUBMIT',
      p_comment: null,
    })
    if (submitted.error) throw new Error(submitted.error.message)

    revalidateRequests()
    return {
      ok: true,
      id: data.id,
      message: 'Request submitted. ' + settings.encashment_policy_text,
    }
  } catch (error) {
    return actionFailure(error)
  }
}

/* -------------------------------------------------------------------------- */
/* Cash / salary advance — financial                                           */
/* -------------------------------------------------------------------------- */

export async function createCashAdvanceRequest(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    await assertPermission('requests.create')
    const { employee } = await currentEmployee()
    const settings = await getSettings()

    const amount = Number(text(form, 'amount') ?? 0)
    const requestedPaymentDate = text(form, 'requested_payment_date')
    const reason = text(form, 'reason')
    const repayment = text(form, 'repayment_arrangement')
    const attachmentUrl = text(form, 'attachment_url')
    const acknowledged = form.get('employee_acknowledged') === 'on'

    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: 'Enter the amount you are requesting.' }
    }
    if (settings.cash_advance_max > 0 && amount > settings.cash_advance_max) {
      return { ok: false, error: `The configured ceiling is ${settings.cash_advance_max} ${settings.currency}.` }
    }
    if (!repayment) return { ok: false, error: 'Describe how the advance would be repaid.' }
    if (!acknowledged) return { ok: false, error: 'Please confirm the acknowledgement before submitting.' }

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('cash_advance_requests')
      .insert({
        employee_id: employee.id,
        amount,
        currency: settings.currency,
        requested_payment_date: requestedPaymentDate,
        reason,
        repayment_arrangement: repayment,
        attachment_url: attachmentUrl,
        employee_acknowledged: true,
        acknowledgement_text: settings.cash_advance_policy_text,
        status: 'DRAFT',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const submitted = await supabase.rpc('decide_request', {
      p_request_type: 'CASH_ADVANCE',
      p_request_id: data.id,
      p_action: 'SUBMIT',
      p_comment: null,
    })
    if (submitted.error) throw new Error(submitted.error.message)

    revalidateRequests()
    return { ok: true, id: data.id, message: 'Request submitted for management review.' }
  } catch (error) {
    return actionFailure(error)
  }
}

/* -------------------------------------------------------------------------- */
/* Decisions and cancellation                                                  */
/* -------------------------------------------------------------------------- */

export type DecisionAction =
  | 'SUBMIT' | 'CANCEL' | 'REVIEW' | 'RECOMMEND'
  | 'APPROVE' | 'REJECT' | 'RETURN' | 'PAY' | 'CLOSE'

export async function decideRequest(
  requestType: RequestType,
  requestId: string,
  action: DecisionAction,
  comment?: string,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()

    // The database re-checks the caller's permission for this exact action and
    // request type, including the finance.approve rule for money requests.
    const { data, error } = await supabase.rpc('decide_request', {
      p_request_type: requestType,
      p_request_id: requestId,
      p_action: action,
      p_comment: comment ?? null,
    })
    if (error) throw new Error(error.message)

    // Approving leave or a shift change should be reflected on the roster.
    if (action === 'APPROVE') {
      if (requestType === 'LEAVE') {
        const applied = await supabase.rpc('apply_leave_to_roster', { p_request_id: requestId })
        if (applied.error) {
          return {
            ok: true,
            message: `Leave approved, but the roster was not updated: ${applied.error.message}`,
          }
        }
      }
      if (requestType === 'SHIFT_CHANGE') {
        const applied = await supabase.rpc('apply_shift_change', { p_request_id: requestId })
        if (applied.error) {
          return {
            ok: true,
            message: `Approved, but the roster was not updated: ${applied.error.message}`,
          }
        }
      }
      if (requestType === 'SHIFT_SWAP') {
        const applied = await supabase.rpc('apply_shift_swap', { p_request_id: requestId })
        if (applied.error) {
          return {
            ok: true,
            message: `Approved, but the roster was not updated: ${applied.error.message}`,
          }
        }
      }
    }

    revalidateRequests()
    revalidatePath('/roster')
    return { ok: true, message: `Request ${String(data).toLowerCase().replace('_', ' ')}.` }
  } catch (error) {
    return actionFailure(error)
  }
}
