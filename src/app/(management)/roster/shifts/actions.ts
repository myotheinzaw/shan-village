'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { actionFailure, type ActionResult } from '@/lib/actions/result'

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time as HH:MM')
  .nullable()

const schema = z
  .object({
    id: z.string().uuid().optional(),
    code: z.string().trim().min(1, 'Code is required').max(30).transform((v) => v.toUpperCase().replace(/\s+/g, '')),
    name: z.string().trim().min(1, 'Name is required').max(80),
    kind: z.enum(['WORK', 'OFF', 'PH', 'LEAVE', 'TRIAL', 'OTHER']),
    start_time: time,
    end_time: time,
    break_minutes: z.coerce.number().int().min(0).max(1439),
    crosses_midnight: z.boolean(),
    is_split: z.boolean(),
    segment2_start: time,
    segment2_end: time,
    colour: z.string().trim().max(20).nullable(),
    notes: z.string().trim().max(500).nullable(),
    sort_order: z.coerce.number().int().min(0).max(999),
    is_active: z.boolean(),
  })
  .refine((v) => v.kind !== 'WORK' || (v.start_time && v.end_time), {
    message: 'A working shift needs a start and end time',
    path: ['start_time'],
  })
  .refine((v) => !v.is_split || (v.segment2_start && v.segment2_end), {
    message: 'A split shift needs both segments',
    path: ['segment2_start'],
  })

function text(form: FormData, key: string): string | null {
  const value = form.get(key)
  if (value === null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

export async function saveShiftTemplate(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    await assertPermission('shifts.manage')

    const kind = (text(form, 'kind') ?? 'WORK') as z.infer<typeof schema>['kind']
    const isWork = kind === 'WORK'
    const isSplit = isWork && form.get('is_split') === 'on'

    const value = schema.parse({
      id: text(form, 'id') ?? undefined,
      code: text(form, 'code') ?? '',
      name: text(form, 'name') ?? '',
      kind,
      // A non-working template must carry no times: the database enforces this
      // too, so clearing them here keeps the error out of the user's way.
      start_time: isWork ? text(form, 'start_time') : null,
      end_time: isWork ? text(form, 'end_time') : null,
      break_minutes: text(form, 'break_minutes') ?? 0,
      crosses_midnight: isWork && form.get('crosses_midnight') === 'on',
      is_split: isSplit,
      segment2_start: isSplit ? text(form, 'segment2_start') : null,
      segment2_end: isSplit ? text(form, 'segment2_end') : null,
      colour: text(form, 'colour'),
      notes: text(form, 'notes'),
      sort_order: text(form, 'sort_order') ?? 50,
      is_active: form.get('is_active') === 'on',
    })

    const supabase = await createSupabaseServerClient()
    const { id, ...payload } = value

    const { error } = id
      ? await supabase.from('shift_templates').update(payload).eq('id', id)
      : await supabase.from('shift_templates').insert(payload)
    if (error) throw new Error(error.message)

    revalidatePath('/roster/shifts')
    revalidatePath('/roster')
    return { ok: true, message: id ? 'Shift template updated.' : 'Shift template added.' }
  } catch (error) {
    return actionFailure(error)
  }
}
