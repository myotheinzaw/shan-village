'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'
import { createSupabaseAnonClient } from '@/lib/supabase/public'
import type { ActionResult } from '@/lib/actions/result'
import { SHARE_COOKIE_MAX_AGE, shareCookieName, shareCookiePath } from './share-session'

const schema = z.object({
  token: z.string().trim().min(16).max(64),
  code: z.string().trim().min(1).max(64),
})

/**
 * Exchanges an access code for a session.
 *
 * Every failure returns the same sentence. A wrong code, an unknown link, a
 * revoked link and a link that has had too many recent attempts are one
 * outcome as far as the person at the door is concerned — telling them which
 * would be telling a guesser which.
 */
export async function unlockRoster(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse({
    token: String(form.get('token') ?? ''),
    code: String(form.get('code') ?? ''),
  })
  if (!parsed.success) {
    return { ok: false, error: 'Enter the access code.' }
  }

  const supabase = createSupabaseAnonClient()
  const { data, error } = await supabase
    .rpc('roster_unlock', { p_token: parsed.data.token, p_code: parsed.data.code })
    .maybeSingle()

  const session = data as { session_token: string; label: string } | null
  if (error || !session) {
    return { ok: false, error: 'That code was not recognised. Check it and try again.' }
  }

  const store = await cookies()
  store.set(shareCookieName(parsed.data.token), session.session_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: shareCookiePath(parsed.data.token),
    maxAge: SHARE_COOKIE_MAX_AGE,
  })

  return { ok: true, message: `Unlocked as ${session.label}.` }
}

/** Clears the session on this device. The session row itself simply expires. */
export async function lockRoster(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const token = String(form.get('token') ?? '')
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { ok: false, error: 'Unknown link.' }

  const store = await cookies()
  store.set(shareCookieName(token), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: shareCookiePath(token),
    maxAge: 0,
  })
  return { ok: true, message: 'Locked.' }
}
