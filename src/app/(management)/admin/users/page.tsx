import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/alert'
import { requirePermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getEmployees } from '@/lib/data/roster'
import { UsersManager, type UserRow } from './users-manager'
import type { Profile, Role } from '@/types/db'

export const metadata = { title: 'Users' }
export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const user = await requirePermission('admin.users')
  const supabase = await createSupabaseServerClient()

  const [{ data: profiles }, { data: roles }, { data: userRoles }, employees] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('roles').select('*').order('sort_order'),
    supabase.from('user_roles').select('profile_id, role_id'),
    getEmployees(true),
  ])

  const roleList = (roles ?? []) as Role[]
  const roleById = new Map(roleList.map((r) => [r.id, r]))
  const roleByProfile = new Map<string, Role>()
  for (const link of (userRoles ?? []) as { profile_id: string; role_id: string }[]) {
    const role = roleById.get(link.role_id)
    if (role) roleByProfile.set(link.profile_id, role)
  }

  const employeeById = new Map(employees.map((e) => [e.id, e]))

  const rows: UserRow[] = ((profiles ?? []) as Profile[]).map((profile) => {
    const role = roleByProfile.get(profile.id)
    const employee = profile.employee_id ? employeeById.get(profile.employee_id) : undefined
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name || profile.email,
      isActive: profile.is_active,
      roleKey: role?.key ?? 'staff',
      roleName: role?.name ?? 'Staff',
      employeeId: profile.employee_id,
      employeeName: employee?.full_name ?? null,
      lastSeenAt: profile.last_seen_at,
    }
  })

  return (
    <>
      <PageHeader
        title="Users"
        description="Logins, roles and the link between a login and an employee record."
      />
      <Alert tone="warning" className="mb-4" title="How access actually works">
        A role is a bundle of permissions, and permissions are what the database checks. Changing
        someone&apos;s role here takes effect immediately, everywhere — including for a request they
        have already opened in another tab. The system will not let you remove the last remaining
        administrator.
      </Alert>

      <UsersManager
        users={rows}
        roles={roleList.map((r) => ({ key: r.key, name: r.name }))}
        employees={employees.map((e) => ({
          id: e.id,
          name: `${e.full_name} (${e.employee_code})`,
          hasLogin: Boolean(e.profile_id),
        }))}
        currentUserId={user.id}
      />
    </>
  )
}
