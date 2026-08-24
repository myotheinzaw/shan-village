import { PageHeader } from '@/components/layout/app-shell'
import { SimpleMaster } from '@/components/masters/simple-master'
import { can, requirePermission } from '@/lib/auth/session'
import { getOutlets } from '@/lib/data/roster'
import { saveOutlet } from '../positions/actions'

export const metadata = { title: 'Outlets' }
export const dynamic = 'force-dynamic'

export default async function OutletsPage() {
  const user = await requirePermission('outlets.manage')
  const outlets = await getOutlets()

  return (
    <>
      <PageHeader
        title="Outlets"
        description="Locations the restaurant rosters against. Shared with every future module."
      />
      <SimpleMaster
        entityLabel="Outlet"
        canManage={can(user, 'outlets.manage')}
        rows={outlets.map((o) => ({
          id: o.id,
          name: o.name,
          short_name: o.short_name,
          code: o.code,
          timezone: o.timezone,
          sort_order: o.sort_order,
          is_active: o.is_active,
        }))}
        columns={[
          { key: 'name', label: 'Outlet' },
          { key: 'short_name', label: 'Short name' },
          { key: 'code', label: 'Code', type: 'mono' },
          { key: 'timezone', label: 'Time zone' },
          { key: 'sort_order', label: 'Order', align: 'right' },
          { key: 'is_active', label: 'Status', type: 'boolean' },
        ]}
        fields={[
          { name: 'name', label: 'Outlet name', type: 'text', required: true },
          { name: 'short_name', label: 'Short name', type: 'text', hint: 'e.g. NM' },
          { name: 'code', label: 'Code', type: 'text', required: true },
          { name: 'timezone', label: 'Time zone', type: 'text', defaultValue: 'Asia/Dubai' },
          { name: 'sort_order', label: 'Sort order', type: 'number', defaultValue: 50 },
          { name: 'is_active', label: 'Active', type: 'checkbox' },
        ]}
        action={saveOutlet}
      />
    </>
  )
}
