'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { actionFailure, type ActionResult } from '@/lib/actions/result'

const schema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(3, 'Give the announcement a title').max(120),
    body: z.string().trim().min(3, 'Write the message').max(4000),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    audience: z.enum(['ALL', 'MANAGEMENT', 'OUTLET', 'POSITION']),
    outlet_id: z.string().uuid().nullable(),
    position_id: z.string().uuid().nullable(),
    publish_at: z.string().min(1),
    expires_at: z.string().nullable(),
    is_published: z.boolean(),
  })
  .refine((v) => v.audience !== 'OUTLET' || v.outlet_id, {
    message: 'Choose the outlet this is for',
    path: ['outlet_id'],
  })
  .refine((v) => v.audience !== 'POSITION' || v.position_id, {
    message: 'Choose the position this is for',
    path: ['position_id'],
  })

function text(form: FormData, key: string): string | null {
  const value = form.get(key)
  if (value === null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

/** datetime-local gives "2026-08-24T18:00"; the column wants a timestamptz. */
function toTimestamp(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export async function saveAnnouncement(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    await assertPermission('announcements.create')

    const value = schema.parse({
      id: text(form, 'id') ?? undefined,
      title: text(form, 'title') ?? '',
      body: text(form, 'body') ?? '',
      priority: text(form, 'priority') ?? 'NORMAL',
      audience: text(form, 'audience') ?? 'ALL',
      outlet_id: text(form, 'outlet_id'),
      position_id: text(form, 'position_id'),
      publish_at: text(form, 'publish_at') ?? new Date().toISOString(),
      expires_at: text(form, 'expires_at'),
      is_published: form.get('is_published') === 'on',
    })

    const publishAt = toTimestamp(value.publish_at) ?? new Date().toISOString()
    const expiresAt = toTimestamp(value.expires_at)

    if (expiresAt && expiresAt <= publishAt) {
      return { ok: false, error: 'The expiry must be after the publish time.' }
    }

    const supabase = await createSupabaseServerClient()
    const payload = {
      title: value.title,
      body: value.body,
      priority: value.priority,
      audience: value.audience,
      outlet_id: value.audience === 'OUTLET' ? value.outlet_id : null,
      position_id: value.audience === 'POSITION' ? value.position_id : null,
      publish_at: publishAt,
      expires_at: expiresAt,
      is_published: value.is_published,
    }

    const { error } = value.id
      ? await supabase.from('announcements').update(payload).eq('id', value.id)
      : await supabase.from('announcements').insert(payload)
    if (error) throw new Error(error.message)

    revalidatePath('/announcements')
    revalidatePath('/staff')
    return { ok: true, message: value.id ? 'Announcement updated.' : 'Announcement posted.' }
  } catch (error) {
    return actionFailure(error)
  }
}
