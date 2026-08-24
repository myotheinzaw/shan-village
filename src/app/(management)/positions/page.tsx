import { PageHeader } from '@/components/layout/app-shell'
import { SimpleMaster } from '@/components/masters/simple-master'
import { can, requirePermission } from '@/lib/auth/session'
import { getDepartments, getPositions } from '@/lib/data/roster'
import { savePosition } from './actions'

export const metadata = { title: 'Positions' }
export const dynamic = 'force-dynamic'

export default async function PositionsPage() {
  const user = await requirePermission('positions.manage')
  const [positions, departments] = await Promise.all([getPositions(true), getDepartments()])
  const departmentById = new Map(departments.map((d) => [d.id, d.name]))

  return (
    <>
      <PageHeader
        title="Positions"
        description="The position master. Nothing here is hard-coded — add, rename or deactivate as the team changes."
      />
      <SimpleMaster
        entityLabel="Position"
        canManage={can(user, 'positions.manage')}
        rows={positions.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          short_name: p.short_name,
          department: departmentById.get(p.department_id ?? '') ?? null,
          department_id: p.department_id,
          sort_order: p.sort_order,
          is_active: p.is_active,
        }))}
        columns={[
          { key: 'name', label: 'Position' },
          { key: 'short_name', label: 'Short name' },
          { key: 'code', label: 'Code', type: 'mono' },
          { key: 'department', label: 'Department' },
          { key: 'sort_order', label: 'Order', align: 'right' },
          { key: 'is_active', label: 'Status', type: 'boolean' },
        ]}
        fields={[
          { name: 'name', label: 'Position name', type: 'text', required: true },
          { name: 'short_name', label: 'Short name', type: 'text', hint: 'Used in tight roster cells, e.g. K.H' },
          { name: 'code', label: 'Code', type: 'text', required: true, hint: 'Uppercase, no spaces.' },
          {
            name: 'department_id',
            label: 'Department',
            type: 'select',
            options: departments.map((d) => ({ value: d.id, label: d.name })),
          },
          { name: 'sort_order', label: 'Sort order', type: 'number', defaultValue: 50 },
          { name: 'is_active', label: 'Active — can be assigned to employees', type: 'checkbox' },
        ]}
        action={savePosition}
      />
    </>
  )
}
