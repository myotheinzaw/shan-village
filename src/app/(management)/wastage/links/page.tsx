import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/alert'
import { requireModule, requirePermission } from '@/lib/auth/session'
import { getWastageLinks } from '@/lib/data/wastage'
import { siteUrl } from '@/lib/supabase/env'
import { ShareLinkManager } from '@/components/links/share-link-manager'
import { rotateWastageLink, saveWastageLink } from './actions'

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

      <ShareLinkManager
        entityLabel="Wastage"
        usageLabel="Entries"
        pathPrefix="w"
        baseUrl={siteUrl()}
        anyOutletLabel="Let the reporter choose"
        outletHint="Fixing the outlet removes a question from the form."
        emptyDescription="Create one per outlet, then print each as a QR code."
        outlets={outlets.map((outlet) => ({ id: outlet.id, name: outlet.name }))}
        rows={links.map((link) => ({
          id: link.id,
          label: link.label,
          token: link.token,
          outletId: link.outlet_id,
          isActive: link.is_active,
          expiresAt: link.expires_at,
          usageCount: link.submission_count,
          lastUsedAt: link.last_used_at,
          detail: [
            link.hourly_limit > 0 ? `${link.hourly_limit}/hour` : 'no hourly limit',
            link.require_name ? 'name required' : 'name optional',
            link.show_staff_list ? 'staff list shown' : 'typed names only',
          ].join(' · '),
          values: {
            hourlyLimit: link.hourly_limit,
            requireName: link.require_name,
            showStaffList: link.show_staff_list,
          },
        }))}
        fields={[
          {
            name: 'hourlyLimit',
            label: 'Entries per hour',
            type: 'number',
            hint: 'A ceiling on this link. 0 removes the limit.',
            defaultValue: 60,
            min: 0,
            max: 1000,
          },
          {
            name: 'requireName',
            label: 'The reporter must give their name',
            type: 'checkbox',
            defaultValue: true,
          },
          {
            name: 'showStaffList',
            label: 'Offer the staff list to pick from',
            type: 'checkbox',
            hint: 'Names and positions of active staff, so the spelling is consistent and entries match the right person. Switch off to accept typed names only.',
            defaultValue: true,
          },
        ]}
        saveAction={saveWastageLink}
        rotateAction={rotateWastageLink}
      />
    </>
  )
}
