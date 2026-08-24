import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/alert'
import { requireModule, requirePermission } from '@/lib/auth/session'
import { getWastageLinks } from '@/lib/data/wastage'
import { siteUrl } from '@/lib/supabase/env'
import { LinksManager } from './links-manager'

export const metadata = { title: 'Wastage Links' }
export const dynamic = 'force-dynamic'

export default async function WastageLinksPage() {
  await requireModule('wastage')
  await requirePermission('wastage.manage')

  const { links, outlets } = await getWastageLinks()

  return (
    <>
      <PageHeader
        title="Submission Links"
        description="The addresses staff open to report wastage. No login, no app to install."
      />

      <Alert tone="info" className="mb-4">
        Print a link as a QR code and put it where the wastage happens — by the bin, on the walk-in
        door, next to the pass. Anyone holding the address can file an entry, so give each outlet
        its own link: if one leaks, issue a new address for that outlet alone.
      </Alert>

      <LinksManager
        links={links}
        outlets={outlets.map((outlet) => ({ id: outlet.id, name: outlet.name }))}
        baseUrl={siteUrl()}
      />
    </>
  )
}
