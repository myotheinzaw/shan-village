'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/session'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/supabase/env'
import { actionFailure, type ActionResult } from '@/lib/actions/result'

/**
 * User administration.
 *
 * These are the only actions in the application that use the service-role key,
 * because creating and deleting Supabase Auth users is not possible with a
 * user-scoped client. Every one of them checks admin.users first, and none of
 * them touches operational data — roster and request writes always go through
 * the user's own client so RLS applies.
 */

export interface UserActionResult extends ActionResult {
  /** Shown once, immediately after creating an account. Never stored. */
  temporaryPassword?: string
}

/** A readable but strong one-time password: 4 groups of 4 URL-safe characters. */
function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = randomBytes(16)
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length])
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12), chars.slice(12, 16)]
    .map((group) => group.join(''))
    .join('-')
}

const createSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  full_name: z.string().trim().min(2, 'Enter the person’s name').max(120),
  role_key: z.enum(['admin', 'roster_manager', 'staff']),
  employee_id: z.string().uuid().nullable(),
})

export async function createUserAccount(
  _prev: UserActionResult,
  form: FormData,
): Promise<UserActionResult> {
  let createdUserId: string | null = null
  try {
    await assertPermission('admin.users')

    const value = createSchema.parse({
      email: String(form.get('email') ?? '').trim(),
      full_name: String(form.get('full_name') ?? '').trim(),
      role_key: String(form.get('role_key') ?? 'staff'),
      employee_id: String(form.get('employee_id') ?? '').trim() || null,
    })

    const admin = createSupabaseAdminClient()
    const supabase = await createSupabaseServerClient()

    const temporaryPassword = generateTemporaryPassword()

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: value.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: value.full_name },
    })
    if (createError) throw new Error(createError.message)
    if (!created.user) throw new Error('The account could not be created.')
    createdUserId = created.user.id

    // The profile and role assignment go through the caller's own client, so
    // the RLS policies and the "cannot grant what you do not hold" trigger both
    // apply to this write exactly as they would to any other.
    const { error: profileError } = await supabase.from('profiles').insert({
      id: created.user.id,
      email: value.email,
      full_name: value.full_name,
      employee_id: value.employee_id,
      is_active: true,
    })
    if (profileError) throw new Error(profileError.message)

    const { data: role } = await supabase.from('roles').select('id').eq('key', value.role_key).maybeSingle()
    if (!role) throw new Error('That role no longer exists.')

    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({ profile_id: created.user.id, role_id: role.id })
    if (roleError) throw new Error(roleError.message)

    if (value.employee_id) {
      const { error: linkError } = await supabase
        .from('employees')
        .update({ profile_id: created.user.id })
        .eq('id', value.employee_id)
      if (linkError) throw new Error(linkError.message)
    }

    revalidatePath('/admin/users')
    return {
      ok: true,
      message: `Account created for ${value.email}.`,
      temporaryPassword,
    }
  } catch (error) {
    // Roll the auth user back, or an email address is left claimed by a
    // half-created account that the Admin cannot see or fix from the UI.
    if (createdUserId) {
      try {
        await createSupabaseAdminClient().auth.admin.deleteUser(createdUserId)
      } catch {
        // Nothing more to do; the message below still tells the Admin what failed.
      }
    }
    return actionFailure(error)
  }
}

export async function setUserActive(profileId: string, isActive: boolean): Promise<ActionResult> {
  try {
    await assertPermission('admin.users')
    const supabase = await createSupabaseServerClient()

    // The database refuses to deactivate the last remaining administrator.
    const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', profileId)
    if (error) throw new Error(error.message)

    revalidatePath('/admin/users')
    return { ok: true, message: isActive ? 'Account reactivated.' : 'Account deactivated.' }
  } catch (error) {
    return actionFailure(error)
  }
}

export async function setUserRole(profileId: string, roleKey: string): Promise<ActionResult> {
  try {
    await assertPermission('admin.users')
    const supabase = await createSupabaseServerClient()

    const { data: role } = await supabase.from('roles').select('id').eq('key', roleKey).maybeSingle()
    if (!role) return { ok: false, error: 'That role does not exist.' }

    // Replace rather than accumulate: one primary role per person keeps the
    // model comprehensible for a restaurant. Per-user permission overrides are
    // the mechanism for anything finer-grained.
    const { error: clearError } = await supabase.from('user_roles').delete().eq('profile_id', profileId)
    if (clearError) throw new Error(clearError.message)

    const { error } = await supabase.from('user_roles').insert({ profile_id: profileId, role_id: role.id })
    if (error) throw new Error(error.message)

    revalidatePath('/admin/users')
    return { ok: true, message: 'Role updated.' }
  } catch (error) {
    return actionFailure(error)
  }
}

export async function linkUserToEmployee(
  profileId: string,
  employeeId: string | null,
): Promise<ActionResult> {
  try {
    await assertPermission('admin.users')
    const supabase = await createSupabaseServerClient()

    // Clear any previous link first so an employee never has two logins.
    const { error: clearError } = await supabase
      .from('employees')
      .update({ profile_id: null })
      .eq('profile_id', profileId)
    if (clearError) throw new Error(clearError.message)

    if (employeeId) {
      const { error: linkError } = await supabase
        .from('employees')
        .update({ profile_id: profileId })
        .eq('id', employeeId)
      if (linkError) throw new Error(linkError.message)
    }

    const { error } = await supabase
      .from('profiles')
      .update({ employee_id: employeeId })
      .eq('id', profileId)
    if (error) throw new Error(error.message)

    revalidatePath('/admin/users')
    return { ok: true, message: employeeId ? 'Login linked to employee.' : 'Link removed.' }
  } catch (error) {
    return actionFailure(error)
  }
}

/** Sends the standard Supabase reset email. Requires SMTP on the project. */
export async function sendPasswordReset(email: string): Promise<ActionResult> {
  try {
    await assertPermission('admin.users')
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
    })
    if (error) throw new Error(error.message)
    return { ok: true, message: `A reset link has been sent to ${email}.` }
  } catch (error) {
    return actionFailure(error)
  }
}

/** Issues a new one-time password when email delivery is not available. */
export async function resetPasswordDirectly(profileId: string): Promise<UserActionResult> {
  try {
    await assertPermission('admin.users')
    const admin = createSupabaseAdminClient()
    const temporaryPassword = generateTemporaryPassword()

    const { error } = await admin.auth.admin.updateUserById(profileId, {
      password: temporaryPassword,
    })
    if (error) throw new Error(error.message)

    // Recorded so a password reset by an administrator is never invisible.
    const supabase = await createSupabaseServerClient()
    await supabase.rpc('log_audit', {
      p_action: 'PASSWORD_RESET',
      p_entity_type: 'PROFILE',
      p_entity_id: profileId,
      p_summary: 'Administrator issued a new temporary password',
      p_old: null,
      p_new: null,
      p_reason: null,
      p_module: 'core',
      p_employee_id: null,
    })

    return {
      ok: true,
      message: 'A new temporary password has been set.',
      temporaryPassword,
    }
  } catch (error) {
    return actionFailure(error)
  }
}
