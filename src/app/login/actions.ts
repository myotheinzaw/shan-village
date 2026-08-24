'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/supabase/env'

export interface AuthFormState {
  error?: string
  message?: string
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '')

  if (!email || !password) return { error: 'Enter your email address and password.' }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Deliberately generic: distinguishing "no such user" from "wrong password"
    // tells an attacker which addresses are real.
    return { error: 'That email address and password did not match. Please try again.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (profile && !profile.is_active) {
      await supabase.auth.signOut()
      return { error: 'This account has been deactivated. Please contact the restaurant office.' }
    }
    await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)
  }

  revalidatePath('/', 'layout')
  redirect(next && next.startsWith('/') ? next : '/')
}

export async function signOut() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { error: 'Enter your email address.' }

  const supabase = await createSupabaseServerClient()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  })

  // Always the same response, whether or not the address exists.
  return {
    message:
      'If that email address has an account, a password reset link is on its way. Check your inbox.',
  }
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (password.length < 10) return { error: 'Choose a password of at least 10 characters.' }
  if (password !== confirm) return { error: 'The two passwords do not match.' }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  redirect('/?passwordUpdated=1')
}
