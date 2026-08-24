import { PageHeader } from '@/components/layout/app-shell'
import { SimpleMaster } from '@/components/masters/simple-master'
import { Alert } from '@/components/ui/alert'
import { requirePermission } from '@/lib/auth/session'
import { getDepartments, getOutlets, getPositions, getStaffingRequirements } from '@/lib/data/roster'
import { DAY_NAMES } from '@/lib/roster/dates'
import { saveStaffingRule } from '../actions'

export const metadata = { title: 'Staffing Rules' }
export const dynamic = 'force-dynamic'

export default async function StaffingPage() {
  await requirePermission('admin.settings')
  const [rules, outlets, positions, departments] = await Promise.all([
    getStaffingRequirements(),
    getOutlets(),
    getPositions(true),
    getDepartments(),
  ])

  const outletById = new Map(outlets.map((o) => [o.id, o.name]))
  const positionById = new Map(positions.map((p) => [p.id, p.name]))
  const departmentById = new Map(departments.map((d) => [d.id, d.name]))

  return (
    <>
      <PageHeader
        title="Staffing Rules"
        description="Minimum cover the roster is checked against. Nothing here is hard-coded — these numbers are yours to set."
      />
      <Alert tone="info" className="mb-4">
        A rule targets a position or a department, optionally at one outlet and optionally on one
        day of the week. The weekly roster shows “Coverage OK” or the gap for every rule, every day.
      </Alert>

      <SimpleMaster
        entityLabel="Staffing rule"
        canManage
        emptyDescription="Add a rule such as “Mall — at least one Team Leader on duty”."
        rows={rules.map((r) => ({
          id: r.id,
          label: r.label,
          outlet: outletById.get(r.outlet_id ?? '') ?? 'All outlets',
          target:
            positionById.get(r.position_id ?? '') ??
            departmentById.get(r.department_id ?? '') ??
            '—',
          day: r.day_of_week === null ? 'Every day' : (DAY_NAMES[r.day_of_week] ?? '—'),
          min_staff: r.min_staff,
          is_active: r.is_active,
          outlet_id: r.outlet_id,
          position_id: r.position_id,
          department_id: r.department_id,
          day_of_week: r.day_of_week,
        }))}
        columns={[
          { key: 'label', label: 'Rule' },
          { key: 'outlet', label: 'Outlet' },
          { key: 'target', label: 'Position / department' },
          { key: 'day', label: 'Applies' },
          { key: 'min_staff', label: 'Minimum', align: 'right' },
          { key: 'is_active', label: 'Status', type: 'boolean' },
        ]}
        fields={[
          { name: 'label', label: 'Rule name', type: 'text', full: true, hint: 'Shown on the roster, e.g. “Mall — Team Leader on duty”.' },
          {
            name: 'outlet_id',
            label: 'Outlet',
            type: 'select',
            options: outlets.map((o) => ({ value: o.id, label: o.name })),
            hint: 'Leave blank to apply everywhere.',
          },
          {
            name: 'position_id',
            label: 'Position',
            type: 'select',
            options: positions.map((p) => ({ value: p.id, label: p.name })),
          },
          {
            name: 'department_id',
            label: 'Or department',
            type: 'select',
            options: departments.map((d) => ({ value: d.id, label: d.name })),
          },
          {
            name: 'day_of_week',
            label: 'Day of week',
            type: 'select',
            options: DAY_NAMES.map((day, index) => ({ value: String(index), label: day })),
            hint: 'Leave blank for every day.',
          },
          { name: 'min_staff', label: 'Minimum staff', type: 'number', defaultValue: 1, required: true },
          { name: 'is_active', label: 'Active', type: 'checkbox' },
        ]}
        action={saveStaffingRule}
      />
    </>
  )
}
