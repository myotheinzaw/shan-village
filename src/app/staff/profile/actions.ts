'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { actionFailure, type ActionResult } from '@/lib/actions/result'

const nameSchema = z.string().trim().min(2, 'Enter your name').max(120)

/** A user may change their own display name. Not their access, and not their status. */
export async function updateMyProfile(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: 'You are not signed in.' }

    const fullName = nameSchema.parse(form.get('full_name'))
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
    if (error) throw new Error(error.message)

    revalidatePath('/staff/profile')
    return { ok: true, message: 'Your details were saved.' }
  } catch (error) {
    return actionFailure(error)
  }
}

export async function changeMyPassword(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const password = String(form.get('password') ?? '')
    const confirm = String(form.get('confirm') ?? '')
    if (password.length < 10) return { ok: false, error: 'Choose a password of at least 10 characters.' }
    if (password !== confirm) return { ok: false, error: 'The two passwords do not match.' }

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)

    return { ok: true, message: 'Your password has been changed.' }
  } catch (error) {
    return actionFailure(error)
  }
}
