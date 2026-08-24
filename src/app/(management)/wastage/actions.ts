'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/session'
import { actionFailure, type ActionResult } from '@/lib/actions/result'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { publishDailyWastageReport } from '@/lib/wastage/export'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const reviewSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(['CONFIRMED', 'REJECTED', 'SUBMITTED']),
  reviewNote: z.string().trim().max(1000).default(''),
})

/**
 * Confirm or reject a submitted entry.
 *
 * Rejecting does not delete anything: the entry stays on the log and in the
 * workbook, marked rejected and excluded from the totals, because "someone
 * filed this and a manager disagreed" is itself part of the day's record.
 */
export async function reviewWastageEntry(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    const user = await assertPermission('wastage.approve')
    const value = reviewSchema.parse({
      id: form.get('id'),
      decision: form.get('decision'),
      reviewNote: String(form.get('reviewNote') ?? ''),
    })

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('wastage_entries')
      .update({
        status: value.decision,
        review_note: value.reviewNote,
        reviewed_by: value.decision === 'SUBMITTED' ? null : user.id,
        reviewed_at: value.decision === 'SUBMITTED' ? null : new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', value.id)

    if (error) throw new Error(error.message)

    revalidatePath('/wastage')
    return {
      ok: true,
      message:
        value.decision === 'CONFIRMED' ? 'Entry confirmed.'
        : value.decision === 'REJECTED' ? 'Entry rejected.'
        : 'Entry reopened.',
    }
  } catch (error) {
    return actionFailure(error)
  }
}

/**
 * Publish a day's workbook to Google Drive now.
 *
 * The permission check is here; the job itself then runs as a system task,
 * because it must read every entry for the day and write to a folder no user
 * account owns.
 */
export async function publishWastageReport(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    const user = await assertPermission('wastage.export')
    const date = String(form.get('date') ?? '')
    if (!ISO_DATE.test(date)) return { ok: false, error: 'Choose a date first.' }

    const outcome = await publishDailyWastageReport({ date, trigger: 'MANUAL', actorId: user.id })
    revalidatePath('/wastage')

    if (outcome.status === 'SUCCESS') return { ok: true, message: outcome.message }
    return { ok: false, error: outcome.message }
  } catch (error) {
    return actionFailure(error)
  }
}
