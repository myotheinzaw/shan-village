import { ReportPage } from '@/components/reports/report-page'

export const metadata = { title: 'Leave Report' }
export const dynamic = 'force-dynamic'

export default async function LeaveReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  return (
    <ReportPage
      reportKey="leave"
      title="Leave Report"
      description="Leave requested, approved, rejected and still pending, with the notice given."
      filters={['employee', 'status']}
      statusOptions={[
        { value: 'SUBMITTED', label: 'Submitted' },
        { value: 'MANAGER_REVIEWED', label: 'Manager reviewed' },
        { value: 'APPROVED', label: 'Approved' },
        { value: 'REJECTED', label: 'Rejected' },
        { value: 'CANCELLED', label: 'Cancelled' },
      ]}
      searchParams={searchParams}
    />
  )
}
