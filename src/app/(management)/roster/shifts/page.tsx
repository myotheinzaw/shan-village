import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/alert'
import { can, requireAnyPermission } from '@/lib/auth/session'
import { getShiftTemplates } from '@/lib/data/roster'
import { ShiftManager } from './shift-manager'

export const metadata = { title: 'Shift Templates' }
export const dynamic = 'force-dynamic'

export default async function ShiftTemplatesPage() {
  const user = await requireAnyPermission(['shifts.view', 'shifts.manage'])
  const templates = await getShiftTemplates(true)

  return (
    <>
      <PageHeader
        title="Shift Templates"
        description="Reusable shifts, including split shifts and shifts that run past midnight."
      />
      <Alert tone="info" className="mb-4">
        Seeded templates come from the existing duty roster. Breaks are set to zero because the
        spreadsheet never recorded them — set the real break length on each shift before the
        Employee Hours report is used for anything to do with pay.
      </Alert>
      <ShiftManager templates={templates} canManage={can(user, 'shifts.manage')} />
    </>
  )
}
