import { RequestCentre } from '@/components/requests/request-centre'
import { requireUser } from '@/lib/auth/session'
import { buildRequestCentreProps } from '@/lib/data/request-page'

export const metadata = { title: 'My Requests' }
export const dynamic = 'force-dynamic'

export default async function StaffRequestsPage() {
  await requireUser()
  const props = await buildRequestCentreProps()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">My Requests</h1>
        <p className="text-sm text-ink-500">Raise a request and follow its progress here.</p>
      </div>
      <RequestCentre {...props} />
    </div>
  )
}
