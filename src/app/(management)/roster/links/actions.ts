'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/session'
import { actionFailure, type ActionResult } from '@/lib/actions/result'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/** 24 bytes of CSPRNG, base64url. Guessing an address is not a strategy. */
function newToken(): string {
  return randomBytes(24).toString('base64url')
}

const schema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(2, 'Give the link a name').max(80),
  outletId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, 'Choose a valid outlet'),
  weeksBack: z.coerce.number().int().min(0).max(26),
  weeksAhead: z.coerce.number().int().min(0).max(26),
  showHours: z.boolean(),
  showNotes: z.boolean(),
  requireCode: z.boolean(),
  expiresAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  isActive: z.boolean(),
})

export async function saveRosterLink(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    const user = await assertPermission('roster.share')
    const value = schema.parse({
      id: String(form.get('id') ?? '') || undefined,
      label: String(form.get('label') ?? ''),
      outletId: String(form.get('outletId') ?? ''),
      weeksBack: String(form.get('weeksBack') ?? '2'),
      weeksAhead: String(form.get('weeksAhead') ?? '4'),
      showHours: form.get('showHours') === 'on',
      showNotes: form.get('showNotes') === 'on',
      requireCode: form.get('requireCode') === 'on',
      expiresAt: String(form.get('expiresAt') ?? ''),
      isActive: form.get('isActive') === 'on',
    })

    const expiresAt = value.expiresAt ? new Date(value.expiresAt) : null
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return { ok: false, error: 'That expiry date is not valid.' }
    }

    const supabase = await createSupabaseServerClient()
    const payload = {
      label: value.label,
      outlet_id: value.outletId,
      weeks_back: value.weeksBack,
      weeks_ahead: value.weeksAhead,
      show_hours: value.showHours,
      show_notes: value.showNotes,
      require_code: value.requireCode,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      is_active: value.isActive,
      updated_by: user.id,
    }

    const { error } = value.id
      ? await supabase.from('roster_links').update(payload).eq('id', value.id)
      : await supabase
          .from('roster_links')
          .insert({ ...payload, token: newToken(), created_by: user.id })

    if (error) throw new Error(error.message)

    revalidatePath('/roster/links')
    return { ok: true, message: value.id ? 'Link updated.' : 'Link created.' }
  } catch (error) {
    return actionFailure(error)
  }
}

/**
 * Issues a new address for an existing link. The old one stops working at once,
 * which is the answer to a printed card that has left the building.
 */
export async function rotateRosterLink(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    const user = await assertPermission('roster.share')
    const id = z.string().uuid().parse(form.get('id'))

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('roster_links')
      .update({ token: newToken(), updated_by: user.id })
      .eq('id', id)
    if (error) throw new Error(error.message)

    revalidatePath('/roster/links')
    return { ok: true, message: 'A new address was issued. Reprint the QR code.' }
  } catch (error) {
    return actionFailure(error)
  }
}
