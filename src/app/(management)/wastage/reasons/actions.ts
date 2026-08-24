'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/session'
import { actionFailure, type ActionResult } from '@/lib/actions/result'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const schema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(2, 'Give the reason a code')
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'Use capitals, numbers and underscores only'),
  name: z.string().trim().min(2, 'Give the reason a name').max(80),
  description: z.string().trim().max(400).optional(),
  sort_order: z.coerce.number().int().min(0).max(999),
  is_active: z.boolean(),
})

/**
 * Reasons are referenced by entries with ON DELETE SET NULL, so a retired
 * reason is deactivated rather than deleted and last month's report keeps
 * saying what it said.
 */
export async function saveWastageReason(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    const user = await assertPermission('wastage.manage')
    const value = schema.parse({
      id: String(form.get('id') ?? '') || undefined,
      code: String(form.get('code') ?? '').toUpperCase(),
      name: String(form.get('name') ?? ''),
      description: String(form.get('description') ?? ''),
      sort_order: String(form.get('sort_order') ?? '0'),
      is_active: form.get('is_active') === 'on',
    })

    const supabase = await createSupabaseServerClient()
    const payload = {
      code: value.code,
      name: value.name,
      description: value.description || null,
      sort_order: value.sort_order,
      is_active: value.is_active,
      updated_by: user.id,
    }

    const { error } = value.id
      ? await supabase.from('wastage_reasons').update(payload).eq('id', value.id)
      : await supabase.from('wastage_reasons').insert({ ...payload, created_by: user.id })

    if (error) throw new Error(error.message)

    revalidatePath('/wastage/reasons')
    revalidatePath('/wastage')
    return { ok: true, message: 'Reason saved.' }
  } catch (error) {
    return actionFailure(error)
  }
}
