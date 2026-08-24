'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { actionFailure, type ActionResult } from '@/lib/actions/result'

const nullableUuid = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))

const employeeSchema = z.object({
  id: z.string().uuid().optional(),
  employee_code: z.string().trim().min(1, 'Employee ID is required').max(30),
  full_name: z.string().trim().min(2, 'Enter the full name').max(120),
  preferred_name: z.string().trim().max(60).nullable().optional(),
  position_id: nullableUuid,
  department_id: nullableUuid,
  outlet_id: nullableUuid,
  employment_status: z.enum(['FULL_TIME', 'PART_TIME', 'CASUAL', 'TRIAL', 'CONTRACT']),
  join_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  mobile: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email('Enter a valid email address').nullable().optional().or(z.literal('').transform(() => null)),
  default_shift_id: nullableUuid,
  preferred_off_day: z.coerce.number().int().min(0).max(6).nullable().optional(),
  weekly_hours_target: z.coerce.number().min(0).max(168).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  is_active: z.boolean(),
})

export type EmployeeInput = z.input<typeof employeeSchema>

function normalise(form: FormData): Record<string, unknown> {
  const get = (key: string) => {
    const value = form.get(key)
    if (value === null) return undefined
    const text = String(value).trim()
    return text === '' ? null : text
  }
  return {
    id: get('id') ?? undefined,
    employee_code: get('employee_code') ?? '',
    full_name: get('full_name') ?? '',
    preferred_name: get('preferred_name'),
    position_id: get('position_id'),
    department_id: get('department_id'),
    outlet_id: get('outlet_id'),
    employment_status: get('employment_status') ?? 'FULL_TIME',
    join_date: get('join_date'),
    mobile: get('mobile'),
    email: get('email'),
    default_shift_id: get('default_shift_id'),
    preferred_off_day: get('preferred_off_day'),
    weekly_hours_target: get('weekly_hours_target'),
    notes: get('notes'),
    is_active: form.get('is_active') === 'on' || form.get('is_active') === 'true',
  }
}

export async function saveEmployee(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const raw = normalise(form)
    const isUpdate = Boolean(raw.id)
    await assertPermission(isUpdate ? 'staff.edit' : 'staff.create')

    const value = employeeSchema.parse(raw)
    const supabase = await createSupabaseServerClient()

    const payload = {
      employee_code: value.employee_code,
      full_name: value.full_name,
      preferred_name: value.preferred_name ?? null,
      position_id: value.position_id ?? null,
      department_id: value.department_id ?? null,
      outlet_id: value.outlet_id ?? null,
      employment_status: value.employment_status,
      join_date: value.join_date ?? null,
      mobile: value.mobile ?? null,
      email: value.email ?? null,
      default_shift_id: value.default_shift_id ?? null,
      preferred_off_day: value.preferred_off_day ?? null,
      weekly_hours_target: value.weekly_hours_target ?? null,
      notes: value.notes ?? null,
      is_active: value.is_active,
    }

    if (isUpdate) {
      const { error } = await supabase.from('employees').update(payload).eq('id', value.id!)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('employees').insert(payload)
      if (error) throw new Error(error.message)
    }

    revalidatePath('/employees')
    revalidatePath('/roster')
    return { ok: true, message: isUpdate ? 'Employee updated.' : 'Employee added.' }
  } catch (error) {
    return actionFailure(error)
  }
}

export async function setEmployeeActive(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    await assertPermission('staff.deactivate')
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.from('employees').update({ is_active: isActive }).eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/employees')
    return { ok: true, message: isActive ? 'Employee reactivated.' : 'Employee deactivated.' }
  } catch (error) {
    return actionFailure(error)
  }
}
