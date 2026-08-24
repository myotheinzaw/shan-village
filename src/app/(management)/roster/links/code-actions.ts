'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/session'
import { actionFailure, type ActionResult } from '@/lib/actions/result'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const schema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'CHEF']),
  code: z
    .string()
    .trim()
    .min(8, 'An access code must be at least 8 characters')
    .max(64)
    .regex(/^[\x21-\x7e]+$/, 'Use letters, numbers and punctuation, with no spaces'),
})

/**
 * Sets a new access code.
 *
 * The code is hashed in the database and never stored, logged or returned, so
 * this is a one-way door: write the new code down before saving it. Every
 * session opened with the old code stops working immediately.
 */
export async function setAccessCode(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    await assertPermission('roster.share')
    const value = schema.parse({
      role: String(form.get('role') ?? ''),
      code: String(form.get('code') ?? ''),
    })

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('share_code_set', {
      p_role: value.role,
      p_code: value.code,
    })
    if (error) throw new Error(error.message)

    revalidatePath('/roster/links')
    return {
      ok: true,
      message: `The ${value.role.toLowerCase()} code is changed. Anyone using the old one is now locked out.`,
    }
  } catch (error) {
    return actionFailure(error)
  }
}
