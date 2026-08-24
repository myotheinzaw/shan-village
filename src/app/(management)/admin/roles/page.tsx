import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/alert'
import { can, requireAnyPermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Module, Permission, Role } from '@/types/db'
import { RolesMatrix, type MatrixPermission } from './roles-matrix'

export const metadata = { title: 'Roles & Permissions' }
export const dynamic = 'force-dynamic'

export default async function RolesPage() {
  const user = await requireAnyPermission(['admin.roles', 'admin.permissions'])
  const supabase = await createSupabaseServerClient()

  const [{ data: roles }, { data: permissions }, { data: rolePermissions }, { data: modules }] =
    await Promise.all([
      supabase.from('roles').select('*').order('sort_order'),
      supabase.from('permissions').select('*').order('sort_order'),
      supabase.from('role_permissions').select('role_id, permission_id'),
      supabase.from('modules').select('key, is_enabled'),
    ])

  const moduleEnabled = new Map(
    ((modules ?? []) as Pick<Module, 'key' | 'is_enabled'>[]).map((m) => [m.key, m.is_enabled]),
  )

  const grants: Record<string, string[]> = {}
  for (const link of (rolePermissions ?? []) as { role_id: string; permission_id: string }[]) {
    grants[link.role_id] = [...(grants[link.role_id] ?? []), link.permission_id]
  }

  const matrixPermissions: MatrixPermission[] = ((permissions ?? []) as Permission[]).map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description,
    category: p.category,
    moduleKey: p.module_key,
    moduleEnabled: moduleEnabled.get(p.module_key) ?? false,
    isActive: p.is_active,
    isSensitive: p.is_sensitive,
  }))

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="What each role can do. Permissions are what the database checks — this grid is the real access control, not a display."
      />
      <Alert tone="info" className="mb-4" title="Two rules the system enforces for you">
        The Owner / Admin role always holds every available permission, so a new capability can never
        lock the owner out. And nobody can grant a permission they do not themselves hold — the
        database refuses the write, not just the button.
      </Alert>

      <RolesMatrix
        roles={((roles ?? []) as Role[]).map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          isSystem: r.is_system,
        }))}
        permissions={matrixPermissions}
        grants={grants}
        canEdit={can(user, 'admin.permissions')}
      />
    </>
  )
}
