'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission, AuthorizationError } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { addWeeksISO, weekDates } from '@/lib/roster/dates'

export interface ActionResult {
  ok: boolean
  error?: string
  message?: string
  id?: string
}

/** Turns a thrown error into a result the UI can show, without leaking internals. */
function fail(error: unknown): ActionResult {
  if (error instanceof AuthorizationError) return { ok: false, error: error.message }
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? 'That information is not valid.' }
  }
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return { ok: false, error: message }
}

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time as HH:MM')
  .nullable()
  .optional()

const assignmentSchema = z.object({
  periodId: z.string().uuid(),
  employeeIds: z.array(z.string().uuid()).min(1, 'Choose at least one employee'),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1, 'Choose at least one day'),
  status: z.enum(['WORK', 'OFF', 'PH', 'LEAVE', 'TRIAL', 'OTHER']),
  shiftTemplateId: z.string().uuid().nullable().optional(),
  startTime: timeSchema,
  endTime: timeSchema,
  breakMinutes: z.number().int().min(0).max(1439).optional(),
  crossesMidnight: z.boolean().optional(),
  isSplit: z.boolean().optional(),
  segment2Start: timeSchema,
  segment2End: timeSchema,
  outletId: z.string().uuid().nullable().optional(),
  positionId: z.string().uuid().nullable().optional(),
  leaveTypeId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
})

export type AssignmentInput = z.input<typeof assignmentSchema>

/** Creates the DRAFT week if it does not exist yet, and returns its id. */
export async function ensurePeriod(
  weekStart: string,
  outletId: string | null,
): Promise<ActionResult> {
  try {
    await assertPermission('roster.create')
    const supabase = await createSupabaseServerClient()

    let query = supabase
      .from('roster_periods')
      .select('id')
      .eq('start_date', weekStart)
      .eq('period_type', 'WEEK')
    query = outletId ? query.eq('outlet_id', outletId) : query.is('outlet_id', null)
    const { data: existing } = await query.maybeSingle()
    if (existing) return { ok: true, id: existing.id }

    const dates = weekDates(weekStart)
    const { data, error } = await supabase
      .from('roster_periods')
      .insert({
        outlet_id: outletId,
        period_type: 'WEEK',
        start_date: weekStart,
        end_date: dates[6]!,
        status: 'DRAFT',
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    revalidatePath('/roster')
    return { ok: true, id: data.id, message: 'Draft roster created.' }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Creates or replaces assignments. One code path for a single cell edit and for
 * a bulk assignment across several employees and days — they differ only in how
 * many ids arrive.
 */
export async function saveAssignments(input: AssignmentInput): Promise<ActionResult> {
  try {
    await assertPermission('roster.edit')
    const value = assignmentSchema.parse(input)
    const supabase = await createSupabaseServerClient()

    if (value.status === 'WORK' && !value.startTime) {
      return { ok: false, error: 'A working shift needs a start time.' }
    }
    if (value.isSplit && (!value.segment2Start || !value.segment2End)) {
      return { ok: false, error: 'A split shift needs both segments.' }
    }

    const rows = value.employeeIds.flatMap((employeeId) =>
      value.dates.map((workDate) => ({
        period_id: value.periodId,
        employee_id: employeeId,
        work_date: workDate,
        status: value.status,
        shift_template_id: value.shiftTemplateId ?? null,
        start_time: value.status === 'WORK' ? (value.startTime ?? null) : null,
        end_time: value.status === 'WORK' ? (value.endTime ?? null) : null,
        break_minutes: value.breakMinutes ?? 0,
        crosses_midnight: value.status === 'WORK' ? (value.crossesMidnight ?? false) : false,
        is_split: value.status === 'WORK' ? (value.isSplit ?? false) : false,
        segment2_start: value.status === 'WORK' && value.isSplit ? (value.segment2Start ?? null) : null,
        segment2_end: value.status === 'WORK' && value.isSplit ? (value.segment2End ?? null) : null,
        outlet_id: value.outletId ?? null,
        position_id: value.positionId ?? null,
        leave_type_id: value.status === 'LEAVE' ? (value.leaveTypeId ?? null) : null,
        note: value.note ?? null,
      })),
    )

    const { error } = await supabase
      .from('roster_assignments')
      .upsert(rows, { onConflict: 'period_id,employee_id,work_date' })

    if (error) throw new Error(error.message)

    revalidatePath('/roster')
    revalidatePath('/roster/monthly')
    return {
      ok: true,
      message:
        rows.length === 1 ? 'Shift saved.' : `${rows.length} assignments saved.`,
    }
  } catch (error) {
    return fail(error)
  }
}

export async function clearAssignments(
  periodId: string,
  employeeIds: string[],
  dates: string[],
): Promise<ActionResult> {
  try {
    await assertPermission('roster.edit')
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from('roster_assignments')
      .delete()
      .eq('period_id', periodId)
      .in('employee_id', employeeIds)
      .in('work_date', dates)

    if (error) throw new Error(error.message)
    revalidatePath('/roster')
    return { ok: true, message: 'Cleared.' }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Copy previous week. Delegates to the database function so that the "pattern
 * only, never date-specific exceptions" rule lives in exactly one place and the
 * whole copy is one transaction.
 */
export async function copyPreviousWeek(
  periodId: string,
  weekStart: string,
  outletId: string | null,
  overwrite: boolean,
): Promise<ActionResult> {
  try {
    await assertPermission('roster.edit')
    const supabase = await createSupabaseServerClient()

    const previousStart = addWeeksISO(weekStart, -1)
    let query = supabase
      .from('roster_periods')
      .select('id')
      .eq('start_date', previousStart)
      .eq('period_type', 'WEEK')
    query = outletId ? query.eq('outlet_id', outletId) : query.is('outlet_id', null)
    const { data: source } = await query.maybeSingle()

    if (!source) {
      return { ok: false, error: 'There is no roster for the previous week to copy from.' }
    }

    const { data, error } = await supabase.rpc('copy_roster_week', {
      p_target_period_id: periodId,
      p_source_period_id: source.id,
      p_overwrite: overwrite,
    })

    if (error) throw new Error(error.message)
    revalidatePath('/roster')
    return {
      ok: true,
      message:
        data === 0
          ? 'Nothing was copied — the previous week has no working pattern to copy, or this week already has entries.'
          : `Copied ${data} assignments. Date-specific leave and public holidays were not copied.`,
    }
  } catch (error) {
    return fail(error)
  }
}

/** Publish / withdraw / lock / unlock. The database enforces the permissions. */
export async function changeRosterStatus(
  periodId: string,
  action: 'PUBLISH' | 'UNPUBLISH' | 'LOCK' | 'UNLOCK' | 'REPUBLISH',
  reason?: string,
  note?: string,
): Promise<ActionResult> {
  try {
    if (action === 'UNLOCK') await assertPermission('roster.unlock')
    else await assertPermission('roster.publish')

    if (action === 'UNLOCK' && !reason?.trim()) {
      return { ok: false, error: 'A reason is required to unlock a roster.' }
    }

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('set_roster_status', {
      p_period_id: periodId,
      p_action: action,
      p_reason: reason ?? null,
      p_note: note ?? null,
    })

    if (error) throw new Error(error.message)

    revalidatePath('/roster')
    revalidatePath('/staff')
    revalidatePath('/staff/roster')
    const past = {
      PUBLISH: 'published',
      REPUBLISH: 'republished',
      UNPUBLISH: 'withdrawn',
      LOCK: 'locked',
      UNLOCK: 'unlocked',
    }[action]
    return { ok: true, message: `Roster ${past}.` }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteDraftPeriod(periodId: string): Promise<ActionResult> {
  try {
    await assertPermission('roster.delete')
    const supabase = await createSupabaseServerClient()

    const { data: period } = await supabase
      .from('roster_periods')
      .select('status')
      .eq('id', periodId)
      .maybeSingle()

    if (!period) return { ok: false, error: 'That roster no longer exists.' }
    if (period.status !== 'DRAFT') {
      return { ok: false, error: 'Only a draft roster can be deleted.' }
    }

    const { error } = await supabase.from('roster_periods').delete().eq('id', periodId)
    if (error) throw new Error(error.message)

    revalidatePath('/roster')
    return { ok: true, message: 'Draft roster deleted.' }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Records a deliberate override of a validation warning. The roster is not
 * blocked by warnings, but taking one on has to be visible afterwards.
 */
export async function recordOverride(
  periodId: string,
  findings: string[],
  reason: string,
): Promise<ActionResult> {
  try {
    await assertPermission('roster.edit')
    if (!reason.trim()) return { ok: false, error: 'Give a reason for the override.' }

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('log_audit', {
      p_action: 'ROSTER_WARNING_OVERRIDE',
      p_entity_type: 'ROSTER_PERIOD',
      p_entity_id: periodId,
      p_summary: `Published with ${findings.length} outstanding warning(s)`,
      p_old: null,
      p_new: { findings },
      p_reason: reason,
      p_module: 'roster',
      p_employee_id: null,
    })
    if (error) throw new Error(error.message)
    return { ok: true, message: 'Override recorded in the audit trail.' }
  } catch (error) {
    return fail(error)
  }
}
