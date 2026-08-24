'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { actionFailure, type ActionResult } from '@/lib/actions/result'

const schema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1, 'Code is required').max(40).transform((v) => v.toUpperCase().replace(/\s+/g, '_')),
  name: z.string().trim().min(1, 'Name is required').max(80),
  short_name: z.string().trim().max(20).nullable(),
  department_id: z.string().uuid().nullable(),
  sort_order: z.coerce.number().int().min(0).max(999),
  is_active: z.boolean(),
})

function text(form: FormData, key: string): string | null {
  const value = form.get(key)
  if (value === null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

export async function savePosition(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    await assertPermission('positions.manage')
    const value = schema.parse({
      id: text(form, 'id') ?? undefined,
      code: text(form, 'code') ?? '',
      name: text(form, 'name') ?? '',
      short_name: text(form, 'short_name'),
      department_id: text(form, 'department_id'),
      sort_order: text(form, 'sort_order') ?? 0,
      is_active: form.get('is_active') === 'on',
    })

    const supabase = await createSupabaseServerClient()
    const payload = {
      code: value.code,
      name: value.name,
      short_name: value.short_name,
      department_id: value.department_id,
      sort_order: value.sort_order,
      is_active: value.is_active,
    }

    const { error } = value.id
      ? await supabase.from('positions').update(payload).eq('id', value.id)
      : await supabase.from('positions').insert(payload)
    if (error) throw new Error(error.message)

    revalidatePath('/positions')
    revalidatePath('/employees')
    return { ok: true, message: value.id ? 'Position updated.' : 'Position added.' }
  } catch (error) {
    return actionFailure(error)
  }
}

const outletSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1, 'Code is required').max(40).transform((v) => v.toUpperCase().replace(/\s+/g, '_')),
  name: z.string().trim().min(1, 'Name is required').max(80),
  short_name: z.string().trim().max(20).nullable(),
  timezone: z.string().trim().min(1).max(60),
  sort_order: z.coerce.number().int().min(0).max(999),
  is_active: z.boolean(),
})

export async function saveOutlet(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    await assertPermission('outlets.manage')
    const value = outletSchema.parse({
      id: text(form, 'id') ?? undefined,
      code: text(form, 'code') ?? '',
      name: text(form, 'name') ?? '',
      short_name: text(form, 'short_name'),
      timezone: text(form, 'timezone') ?? 'Asia/Dubai',
      sort_order: text(form, 'sort_order') ?? 0,
      is_active: form.get('is_active') === 'on',
    })

    const supabase = await createSupabaseServerClient()
    const payload = {
      code: value.code,
      name: value.name,
      short_name: value.short_name,
      timezone: value.timezone,
      sort_order: value.sort_order,
      is_active: value.is_active,
    }

    const { error } = value.id
      ? await supabase.from('outlets').update(payload).eq('id', value.id)
      : await supabase.from('outlets').insert(payload)
    if (error) throw new Error(error.message)

    revalidatePath('/outlets')
    return { ok: true, message: value.id ? 'Outlet updated.' : 'Outlet added.' }
  } catch (error) {
    return actionFailure(error)
  }
}
