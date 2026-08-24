import { PageHeader } from '@/components/layout/app-shell'
import { RequestCentre } from '@/components/requests/request-centre'
import { requireUser } from '@/lib/auth/session'
import { buildRequestCentreProps } from '@/lib/data/request-page'

export const metadata = { title: 'My Requests' }
export const dynamic = 'force-dynamic'

export default async function MyRequestsPage() {
  await requireUser()
  const props = await buildRequestCentreProps()

  return (
    <>
      <PageHeader
        title="My Requests"
        description="Your own shift, leave and financial requests. Decisions on other people's requests are in the Approval Centre."
      />
      <RequestCentre {...props} />
    </>
  )
}
