import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Employee, Module, Profile } from '@/types/db'

export interface CurrentUser {
  id: string
  email: string
  profile: Profile
  employee: Employee | null
  roleKeys: string[]
  permissions: Set<string>
  isAdmin: boolean
  enabledModules: Set<string>
}

/**
 * The signed-in user, their roles, their effective permissions and the enabled
 * modules — resolved once per request.
 *
 * Effective permissions are computed the same way app.has_permission() computes
 * them in the database: role grants, plus per-user grants, minus per-user
 * revokes, restricted to active permissions of enabled modules. The two must
 * agree, or the UI would offer a button the database then refuses. The database
 * remains the authority; this copy exists so the UI can render correctly and so
 * server actions can fail fast with a clear message.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: modules }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('modules').select('*'),
  ])

  if (!profile || !profile.is_active) return null

  const enabledModules = new Set(
    ((modules ?? []) as Module[]).filter((m) => m.is_enabled).map((m) => m.key),
  )

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('role_id, roles(key, name)')
    .eq('profile_id', user.id)

  const roles = (roleRows ?? []) as unknown as {
    role_id: string
    roles: { key: string; name: string } | null
  }[]
  const roleKeys = roles.map((r) => r.roles?.key).filter((k): k is string => Boolean(k))
  const isAdmin = roleKeys.includes('admin')

  const [{ data: allPermissions }, { data: rolePermissions }, { data: userPermissions }] =
    await Promise.all([
      supabase.from('permissions').select('id, key, module_key, is_active'),
      supabase
        .from('role_permissions')
        .select('role_id, permission_id')
        .in('role_id', roles.length ? roles.map((r) => r.role_id) : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('user_permissions').select('permission_id, granted').eq('profile_id', user.id),
    ])

  const permissionById = new Map(
    ((allPermissions ?? []) as { id: string; key: string; module_key: string; is_active: boolean }[]).map(
      (p) => [p.id, p],
    ),
  )

  const usable = (id: string) => {
    const p = permissionById.get(id)
    return Boolean(p && p.is_active && enabledModules.has(p.module_key))
  }

  const revoked = new Set<string>()
  const granted = new Set<string>()

  for (const up of (userPermissions ?? []) as { permission_id: string; granted: boolean }[]) {
    const key = permissionById.get(up.permission_id)?.key
    if (!key) continue
    if (up.granted) granted.add(key)
    else revoked.add(key)
  }

  const permissions = new Set<string>()

  if (isAdmin) {
    // An admin holds every permission that is usable at all. Mirrors the
    // short-circuit in app.has_permission(), so a permission added later is
    // covered without a seed update.
    for (const p of permissionById.values()) {
      if (usable(p.id)) permissions.add(p.key)
    }
  } else {
    for (const rp of (rolePermissions ?? []) as { permission_id: string }[]) {
      if (!usable(rp.permission_id)) continue
      const key = permissionById.get(rp.permission_id)?.key
      if (key) permissions.add(key)
    }
    for (const key of granted) {
      const entry = [...permissionById.values()].find((p) => p.key === key)
      if (entry && usable(entry.id)) permissions.add(key)
    }
    for (const key of revoked) permissions.delete(key)
  }

  let employee: Employee | null = null
  if (profile.employee_id) {
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('id', profile.employee_id)
      .maybeSingle()
    employee = (data as Employee) ?? null
  } else {
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('profile_id', user.id)
      .maybeSingle()
    employee = (data as Employee) ?? null
  }

  return {
    id: user.id,
    email: user.email ?? profile.email,
    profile: profile as Profile,
    employee,
    roleKeys,
    permissions,
    isAdmin,
    enabledModules,
  }
})

/** Any signed-in, active user. Redirects to the login page otherwise. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export function can(user: CurrentUser | null, permission: string): boolean {
  return Boolean(user?.permissions.has(permission))
}

export function canAny(user: CurrentUser | null, permissions: string[]): boolean {
  return permissions.some((p) => can(user, p))
}

/**
 * Page-level guard. A staff member who types a management URL lands here and is
 * sent to their own home page rather than seeing an empty management screen.
 * The database refuses the data regardless; this is about a sensible response.
 */
export async function requirePermission(permission: string): Promise<CurrentUser> {
  const user = await requireUser()
  if (!user.permissions.has(permission)) redirect('/staff?denied=1')
  return user
}

export async function requireAnyPermission(permissions: string[]): Promise<CurrentUser> {
  const user = await requireUser()
  if (!permissions.some((p) => user.permissions.has(p))) redirect('/staff?denied=1')
  return user
}

/** Route guard for a module that is switched off: the page must not exist. */
export async function requireModule(moduleKey: string): Promise<CurrentUser> {
  const user = await requireUser()
  if (!user.enabledModules.has(moduleKey)) {
    const { notFound } = await import('next/navigation')
    notFound()
  }
  return user
}

/**
 * Server-action guard. Unlike the page guards this throws, because an action
 * has no sensible "redirect" outcome and must never continue past a failed
 * permission check.
 */
export class AuthorizationError extends Error {
  constructor(permission: string) {
    super(`You do not have permission to do this (${permission}).`)
    this.name = 'AuthorizationError'
  }
}

export async function assertPermission(permission: string): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new AuthorizationError(permission)
  if (!user.permissions.has(permission)) throw new AuthorizationError(permission)
  return user
}

export async function assertAnyPermission(permissions: string[]): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new AuthorizationError(permissions.join(' or '))
  if (!permissions.some((p) => user.permissions.has(p))) {
    throw new AuthorizationError(permissions.join(' or '))
  }
  return user
}

/** True when the user should land in the staff app rather than management. */
export function isStaffOnly(user: CurrentUser): boolean {
  return !canAny(user, [
    'roster.view_all',
    'staff.view',
    'requests.view_all',
    'reports.view',
    'admin.users',
    'admin.settings',
  ])
}
