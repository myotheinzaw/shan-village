'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/session'
import { actionFailure, type ActionResult } from '@/lib/actions/result'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * A link token is the only credential guarding the public form, so it is
 * generated from a CSPRNG and is long enough that guessing is not a strategy:
 * 24 bytes, base64url, 32 characters.
 */
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
  requireName: z.boolean(),
  showStaffList: z.boolean(),
  hourlyLimit: z.coerce.number().int().min(0).max(1000),
  expiresAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  isActive: z.boolean(),
})

export async function saveWastageLink(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    const user = await assertPermission('wastage.manage')
    const value = schema.parse({
      id: String(form.get('id') ?? '') || undefined,
      label: String(form.get('label') ?? ''),
      outletId: String(form.get('outletId') ?? ''),
      requireName: form.get('requireName') === 'on',
      showStaffList: form.get('showStaffList') === 'on',
      hourlyLimit: String(form.get('hourlyLimit') ?? '60'),
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
      require_name: value.requireName,
      show_staff_list: value.showStaffList,
      hourly_limit: value.hourlyLimit,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      is_active: value.isActive,
      updated_by: user.id,
    }

    if (value.id) {
      const { error } = await supabase.from('wastage_links').update(payload).eq('id', value.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase
        .from('wastage_links')
        .insert({ ...payload, token: newToken(), created_by: user.id })
      if (error) throw new Error(error.message)
    }

    revalidatePath('/wastage/links')
    return { ok: true, message: value.id ? 'Link updated.' : 'Link created.' }
  } catch (error) {
    return actionFailure(error)
  }
}

/**
 * Replaces the token on an existing link.
 *
 * Used when a printed QR code has left the building. The old address stops
 * working immediately; every entry already filed through it keeps its history,
 * because entries reference the link row and not the token.
 */
export async function rotateWastageLink(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    const user = await assertPermission('wastage.manage')
    const id = z.string().uuid().parse(form.get('id'))

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('wastage_links')
      .update({ token: newToken(), updated_by: user.id })
      .eq('id', id)
    if (error) throw new Error(error.message)

    revalidatePath('/wastage/links')
    return { ok: true, message: 'A new address was issued. Reprint the QR code.' }
  } catch (error) {
    return actionFailure(error)
  }
}
