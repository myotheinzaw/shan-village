import { PageHeader } from '@/components/layout/app-shell'
import { can, requireAnyPermission } from '@/lib/auth/session'
import { loadRequests } from '@/lib/data/requests'
import { ApprovalCentre } from './approval-centre'

export const metadata = { title: 'Approval Centre' }
export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  const user = await requireAnyPermission([
    'requests.review',
    'requests.approve',
    'leave.approve',
    'finance.approve',
    'finance.view',
  ])

  // RLS decides what arrives: a Roster Manager gets the operational requests
  // and nothing financial, whatever this page asks for.
  const requests = await loadRequests({ pendingOnly: false })
  const open = requests.filter(
    (r) => !['APPROVED', 'REJECTED', 'CANCELLED', 'CLOSED', 'PAID'].includes(r.status),
  )
  const paidPending = requests.filter((r) => r.type === 'CASH_ADVANCE' && r.status === 'APPROVED')

  return (
    <>
      <PageHeader
        title="Approval Centre"
        description="Everything waiting for a decision, with the full history recorded against each request."
      />
      <ApprovalCentre
        operational={open.filter((r) => !r.financial)}
        financial={[...open.filter((r) => r.financial), ...paidPending]}
        permissions={{
          canReview: can(user, 'requests.review'),
          canApprove: can(user, 'requests.approve'),
          canApproveLeave: can(user, 'leave.approve'),
          canFinanceView: can(user, 'finance.view'),
          canFinanceApprove: can(user, 'finance.approve'),
        }}
      />
    </>
  )
}
