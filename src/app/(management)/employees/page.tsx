import { PageHeader } from '@/components/layout/app-shell'
import { can, requirePermission } from '@/lib/auth/session'
import {
  getDepartments,
  getEmployees,
  getOutlets,
  getPositions,
  getShiftTemplates,
} from '@/lib/data/roster'
import { EmployeeManager } from './employee-manager'

export const metadata = { title: 'Employees' }
export const dynamic = 'force-dynamic'

export default async function EmployeesPage() {
  const user = await requirePermission('staff.view')

  const [employees, positions, departments, outlets, shiftTemplates] = await Promise.all([
    getEmployees(true),
    getPositions(true),
    getDepartments(),
    getOutlets(),
    getShiftTemplates(),
  ])

  return (
    <>
      <PageHeader
        title="Employees"
        description="The employee master. Every module — now and later — reads from this list."
      />
      <EmployeeManager
        employees={employees}
        positions={positions}
        departments={departments}
        outlets={outlets}
        shiftTemplates={shiftTemplates}
        canCreate={can(user, 'staff.create')}
        canEdit={can(user, 'staff.edit')}
        canDeactivate={can(user, 'staff.deactivate')}
      />
    </>
  )
}
