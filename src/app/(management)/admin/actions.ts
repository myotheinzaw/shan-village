'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { actionFailure, type ActionResult } from '@/lib/actions/result'

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Saves the whole settings form in one go. Values are coerced to the type the
 * setting declares, so `90` never becomes the string "90" and a checkbox never
 * becomes "on" — the RLS policies and the leave rules read these as JSON.
 */
export async function saveSettings(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    await assertPermission('admin.settings')
    const supabase = await createSupabaseServerClient()

    const { data: existing, error: loadError } = await supabase
      .from('app_settings')
      .select('key, data_type')
    if (loadError) throw new Error(loadError.message)

    const updates: { key: string; value: unknown }[] = []

    for (const setting of (existing ?? []) as { key: string; data_type: string }[]) {
      const field = `setting__${setting.key}`
      if (setting.data_type === 'boolean') {
        updates.push({ key: setting.key, value: form.get(field) === 'on' })
        continue
      }
      if (!form.has(field)) continue
      const raw = String(form.get(field) ?? '').trim()

      if (setting.data_type === 'number') {
        const parsed = Number(raw)
        if (!Number.isFinite(parsed)) {
          return { ok: false, error: `${setting.key} must be a number.` }
        }
        updates.push({ key: setting.key, value: parsed })
      } else if (setting.data_type === 'json') {
        try {
          updates.push({ key: setting.key, value: JSON.parse(raw) })
        } catch {
          return { ok: false, error: `${setting.key} must be valid JSON.` }
        }
      } else {
        updates.push({ key: setting.key, value: raw })
      }
    }

    for (const update of updates) {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: update.value })
        .eq('key', update.key)
      if (error) throw new Error(`${update.key}: ${error.message}`)
    }

    revalidatePath('/admin/settings')
    revalidatePath('/', 'layout')
    return { ok: true, message: `${updates.length} settings saved.` }
  } catch (error) {
    return actionFailure(error)
  }
}

/* -------------------------------------------------------------------------- */
/* Modules                                                                     */
/* -------------------------------------------------------------------------- */

export async function setModuleEnabled(key: string, enabled: boolean): Promise<ActionResult> {
  try {
    await assertPermission('admin.modules')
    const supabase = await createSupabaseServerClient()

    const { data: module } = await supabase
      .from('modules')
      .select('key, name, is_core')
      .eq('key', key)
      .maybeSingle()

    if (!module) return { ok: false, error: 'That module does not exist.' }
    if (module.is_core && !enabled) {
      return { ok: false, error: `${module.name} is part of the platform and cannot be switched off.` }
    }

    const { error } = await supabase.from('modules').update({ is_enabled: enabled }).eq('key', key)
    if (error) throw new Error(error.message)

    revalidatePath('/admin/modules')
    revalidatePath('/', 'layout')
    return {
      ok: true,
      message: enabled
        ? `${module.name} enabled. Its permissions can now be granted.`
        : `${module.name} disabled. Its pages and permissions are unreachable.`,
    }
  } catch (error) {
    return actionFailure(error)
  }
}

/* -------------------------------------------------------------------------- */
/* Staffing requirements                                                       */
/* -------------------------------------------------------------------------- */

const staffingSchema = z
  .object({
    id: z.string().uuid().optional(),
    outlet_id: z.string().uuid().nullable(),
    position_id: z.string().uuid().nullable(),
    department_id: z.string().uuid().nullable(),
    day_of_week: z.coerce.number().int().min(0).max(6).nullable(),
    min_staff: z.coerce.number().int().min(0).max(99),
    label: z.string().trim().max(120).nullable(),
    is_active: z.boolean(),
  })
  .refine((v) => v.position_id || v.department_id, {
    message: 'Choose a position or a department for this rule',
    path: ['position_id'],
  })

function text(form: FormData, key: string): string | null {
  const value = form.get(key)
  if (value === null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

export async function saveStaffingRule(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    await assertPermission('admin.settings')
    const value = staffingSchema.parse({
      id: text(form, 'id') ?? undefined,
      outlet_id: text(form, 'outlet_id'),
      position_id: text(form, 'position_id'),
      department_id: text(form, 'department_id'),
      day_of_week: text(form, 'day_of_week'),
      min_staff: text(form, 'min_staff') ?? 1,
      label: text(form, 'label'),
      is_active: form.get('is_active') === 'on',
    })

    const supabase = await createSupabaseServerClient()
    const { id, ...payload } = value

    const { error } = id
      ? await supabase.from('staffing_requirements').update(payload).eq('id', id)
      : await supabase.from('staffing_requirements').insert(payload)
    if (error) throw new Error(error.message)

    revalidatePath('/admin/staffing')
    revalidatePath('/roster')
    return { ok: true, message: id ? 'Staffing rule updated.' : 'Staffing rule added.' }
  } catch (error) {
    return actionFailure(error)
  }
}
