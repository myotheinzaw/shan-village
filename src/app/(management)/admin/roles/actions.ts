'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { actionFailure, type ActionResult } from '@/lib/actions/result'

/**
 * Grants or revokes one permission on one role.
 *
 * The database refuses to let anyone grant a permission they do not themselves
 * hold, and refuses to touch the admin role unless the caller is an admin, so
 * this action stays deliberately thin.
 */
export async function setRolePermission(
  roleId: string,
  permissionId: string,
  granted: boolean,
): Promise<ActionResult> {
  try {
    await assertPermission('admin.permissions')
    const supabase = await createSupabaseServerClient()

    const { data: role } = await supabase.from('roles').select('key, name').eq('id', roleId).maybeSingle()
    if (!role) return { ok: false, error: 'That role no longer exists.' }
    if (role.key === 'admin') {
      return {
        ok: false,
        error: 'The Owner / Admin role always holds every permission and cannot be edited.',
      }
    }

    if (granted) {
      const { error } = await supabase
        .from('role_permissions')
        .insert({ role_id: roleId, permission_id: permissionId })
      if (error && !error.message.includes('duplicate key')) throw new Error(error.message)
    } else {
      const { error } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId)
        .eq('permission_id', permissionId)
      if (error) throw new Error(error.message)
    }

    revalidatePath('/admin/roles')
    revalidatePath('/', 'layout')
    return { ok: true, message: `${role.name}: permission ${granted ? 'granted' : 'removed'}.` }
  } catch (error) {
    return actionFailure(error)
  }
}
