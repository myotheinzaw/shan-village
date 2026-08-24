import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/alert'
import { requirePermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Module, Permission } from '@/types/db'
import { ModulesManager } from './modules-manager'

export const metadata = { title: 'Modules' }
export const dynamic = 'force-dynamic'

export default async function ModulesPage() {
  await requirePermission('admin.modules')
  const supabase = await createSupabaseServerClient()

  const [{ data: modules }, { data: permissions }] = await Promise.all([
    supabase.from('modules').select('*').order('sort_order'),
    supabase.from('permissions').select('id, module_key'),
  ])

  const counts: Record<string, number> = {}
  for (const permission of (permissions ?? []) as Pick<Permission, 'id' | 'module_key'>[]) {
    counts[permission.module_key] = (counts[permission.module_key] ?? 0) + 1
  }

  return (
    <>
      <PageHeader
        title="Modules"
        description="Which parts of the platform are switched on. Phase 1 is the roster; the rest are prepared but not built."
      />
      <Alert tone="warning" className="mb-4" title="What disabling a module actually does">
        A disabled module has no navigation entry, its routes return 404, and every one of its
        permissions evaluates to false in the database — even for the Owner. Enabling a module here
        does not create pages that have not been built yet; the modules below marked
        “Not yet available” are architecture only.
      </Alert>
      <ModulesManager modules={(modules ?? []) as Module[]} permissionCounts={counts} />
    </>
  )
}
