import { ReportPage } from '@/components/reports/report-page'

export const metadata = { title: 'Request Report' }
export const dynamic = 'force-dynamic'

export default async function RequestReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  return (
    <ReportPage
      reportKey="requests"
      title="Request Report"
      description="Shift changes, swaps, leave, encashment and cash advances. Financial rows appear only for users with the finance permission."
      searchParams={searchParams}
    />
  )
}
