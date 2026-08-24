import { ReportPage } from '@/components/reports/report-page'

export const metadata = { title: 'Employee Hours' }
export const dynamic = 'force-dynamic'

export default async function HoursReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  return (
    <ReportPage
      reportKey="hours"
      title="Employee Hours"
      description="Scheduled hours, working days, OFF days and leave per employee. Hours come from the roster, including split and overnight shifts."
      filters={['employee', 'position']}
      searchParams={searchParams}
    />
  )
}
