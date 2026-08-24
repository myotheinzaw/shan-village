import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/alert'
import { ShareLinkManager } from '@/components/links/share-link-manager'
import { requirePermission } from '@/lib/auth/session'
import { getOutlets } from '@/lib/data/roster'
import { getSettings } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/supabase/env'
import type { RosterLink } from '@/types/db'
import { AccessCodes, type AccessCodeRow } from './access-codes'
import { rotateRosterLink, saveRosterLink } from './actions'

export const metadata = { title: 'Roster Links' }
export const dynamic = 'force-dynamic'

export default async function RosterLinksPage() {
  await requirePermission('roster.share')

  const supabase = await createSupabaseServerClient()
  const [{ data }, { data: codeData }, outlets, settings] = await Promise.all([
    supabase.from('roster_links').select('*').order('created_at', { ascending: false }),
    supabase
      .from('share_access_codes')
      .select('role, label, code_hint, can_view_change_log, use_count, last_used_at')
      .eq('is_active', true),
    getOutlets(),
    getSettings(),
  ])
  const links = (data ?? []) as RosterLink[]

  const ROLE_ORDER = ['OWNER', 'ADMIN', 'CHEF']
  const codes: AccessCodeRow[] = (
    (codeData ?? []) as {
      role: AccessCodeRow['role']
      label: string
      code_hint: string
      can_view_change_log: boolean
      use_count: number
      last_used_at: string | null
    }[]
  )
    .map((code) => ({
      role: code.role,
      label: code.label,
      hint: code.code_hint,
      canViewChangeLog: code.can_view_change_log,
      useCount: code.use_count,
      lastUsedAt: code.last_used_at,
    }))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))

  return (
    <>
      <PageHeader
        title="Roster Links"
        description="A read-only duty roster anyone can open — no login, no app to install."
      />

      <Alert tone="warning" className="mb-4">
        A roster link shows the <strong>published</strong> roster for the weeks you allow below:
        names, positions and shifts. It never shows a draft, never says why someone is on leave, and
        carries nothing else from the employee record. Anyone holding the address can read it, so
        give each outlet its own link and use <em>New address</em> the moment a printed card goes
        missing.
      </Alert>

      {!settings.staff_can_view_team_roster ? (
        <Alert tone="info" className="mb-4">
          <strong>Staff see the team roster</strong> is switched off in Settings, so inside the app
          staff see only their own shifts. A link created here shows the whole team to anyone who
          opens it — which may be exactly what you want for a roster on the wall, but it is worth
          knowing the two disagree.
        </Alert>
      ) : null}

      <ShareLinkManager
        entityLabel="Roster"
        usageLabel="Views"
        pathPrefix="r"
        baseUrl={siteUrl()}
        anyOutletLabel="Every outlet"
        outletHint="Tie the link to one outlet and it shows only that outlet's roster."
        emptyDescription="Create one per outlet, print it as a QR code, and put it where the team already looks for the roster."
        outlets={outlets.map((outlet) => ({ id: outlet.id, name: outlet.name }))}
        rows={links.map((link) => ({
          id: link.id,
          label: link.label,
          token: link.token,
          outletId: link.outlet_id,
          isActive: link.is_active,
          expiresAt: link.expires_at,
          usageCount: link.view_count,
          lastUsedAt: link.last_viewed_at,
          detail: [
            link.require_code ? 'code required' : 'no code',
            `${link.weeks_back} back · ${link.weeks_ahead} ahead`,
            link.show_hours ? 'hours shown' : null,
            link.show_notes ? 'notes shown' : null,
          ]
            .filter(Boolean)
            .join(' · '),
          values: {
            weeksBack: link.weeks_back,
            weeksAhead: link.weeks_ahead,
            showHours: link.show_hours,
            showNotes: link.show_notes,
            requireCode: link.require_code,
          },
        }))}
        fields={[
          {
            name: 'weeksBack',
            label: 'Weeks visible in the past',
            type: 'number',
            hint: 'How far back the arrows go. Keeps a leaked address away from the archive.',
            defaultValue: 2,
            min: 0,
            max: 26,
          },
          {
            name: 'weeksAhead',
            label: 'Weeks visible ahead',
            type: 'number',
            hint: 'Only published weeks appear, however far ahead this is set.',
            defaultValue: 4,
            min: 0,
            max: 26,
          },
          {
            name: 'showHours',
            label: 'Show weekly hours',
            type: 'checkbox',
            hint: 'Off by default — a roster on a wall is read by anyone walking past.',
            defaultValue: false,
          },
          {
            name: 'showNotes',
            label: 'Show shift notes',
            type: 'checkbox',
            hint: 'Off by default, for the same reason.',
            defaultValue: false,
          },
          {
            name: 'requireCode',
            label: 'Ask for an access code',
            type: 'checkbox',
            hint: 'On by default. Switch off only for a roster you are content for anyone with the address to read.',
            defaultValue: true,
          },
        ]}
        saveAction={saveRosterLink}
        rotateAction={rotateRosterLink}
      />

      <AccessCodes codes={codes} />
    </>
  )
}
