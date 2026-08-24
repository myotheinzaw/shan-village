import { ReportPage } from '@/components/reports/report-page'

export const metadata = { title: 'Roster Report' }
export const dynamic = 'force-dynamic'

export default async function RosterReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  return (
    <ReportPage
      reportKey="roster"
      title="Roster Report"
      description="Every roster line in the range: shift, hours, OFF, public holiday and leave."
      filters={['employee', 'position', 'outlet', 'status']}
      statusOptions={[
        { value: 'WORK', label: 'Working' },
        { value: 'OFF', label: 'OFF' },
        { value: 'PH', label: 'Public holiday' },
        { value: 'LEAVE', label: 'Leave' },
        { value: 'TRIAL', label: 'Trial' },
        { value: 'OTHER', label: 'Other' },
      ]}
      searchParams={searchParams}
    />
  )
}
