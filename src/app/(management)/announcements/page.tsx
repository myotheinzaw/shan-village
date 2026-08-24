import { PageHeader } from '@/components/layout/app-shell'
import { SimpleMaster } from '@/components/masters/simple-master'
import { Alert } from '@/components/ui/alert'
import { can, requireAnyPermission } from '@/lib/auth/session'
import { getOutlets, getPositions } from '@/lib/data/roster'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Announcement } from '@/types/db'
import { saveAnnouncement } from './actions'

export const metadata = { title: 'Announcements' }
export const dynamic = 'force-dynamic'

/** timestamptz -> the "2026-08-24T18:00" shape a datetime-local input wants. */
function toLocalInput(value: string | null): string {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 16)
}

export default async function AnnouncementsPage() {
  const user = await requireAnyPermission(['announcements.view', 'announcements.create'])
  const supabase = await createSupabaseServerClient()

  const [{ data }, outlets, positions] = await Promise.all([
    supabase.from('announcements').select('*').order('publish_at', { ascending: false }),
    getOutlets(),
    getPositions(),
  ])

  const announcements = (data ?? []) as Announcement[]
  const canManage = can(user, 'announcements.create')
  const now = new Date().toISOString()

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Notices shown on the staff home screen — meetings, uniform reminders, holidays, events."
      />
      {!canManage ? (
        <Alert tone="info" className="mb-4">
          You can read announcements here. Posting them requires the announcements permission.
        </Alert>
      ) : null}

      <SimpleMaster
        entityLabel="Announcement"
        canManage={canManage}
        emptyDescription="Post a notice and it appears on every staff member's home screen."
        rows={announcements.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          priority: a.priority,
          audience: a.audience,
          outlet_id: a.outlet_id,
          position_id: a.position_id,
          publish_at: toLocalInput(a.publish_at),
          expires_at: toLocalInput(a.expires_at),
          is_published: a.is_published,
          state:
            !a.is_published
              ? 'Draft'
              : a.publish_at > now
                ? 'Scheduled'
                : a.expires_at && a.expires_at < now
                  ? 'Expired'
                  : 'Live',
        }))}
        columns={[
          { key: 'title', label: 'Title' },
          { key: 'priority', label: 'Priority' },
          { key: 'audience', label: 'Audience' },
          { key: 'publish_at', label: 'Publish' },
          { key: 'expires_at', label: 'Expires' },
          { key: 'state', label: 'State' },
        ]}
        fields={[
          { name: 'title', label: 'Title', type: 'text', required: true, full: true },
          { name: 'body', label: 'Message', type: 'textarea', required: true, full: true },
          {
            name: 'priority',
            label: 'Priority',
            type: 'select',
            defaultValue: 'NORMAL',
            options: [
              { value: 'LOW', label: 'Low' },
              { value: 'NORMAL', label: 'Normal' },
              { value: 'HIGH', label: 'Important' },
              { value: 'URGENT', label: 'Urgent' },
            ],
          },
          {
            name: 'audience',
            label: 'Audience',
            type: 'select',
            defaultValue: 'ALL',
            options: [
              { value: 'ALL', label: 'Everyone' },
              { value: 'MANAGEMENT', label: 'Management only' },
              { value: 'OUTLET', label: 'One outlet' },
              { value: 'POSITION', label: 'One position' },
            ],
          },
          {
            name: 'outlet_id',
            label: 'Outlet (if audience is one outlet)',
            type: 'select',
            options: outlets.map((o) => ({ value: o.id, label: o.name })),
          },
          {
            name: 'position_id',
            label: 'Position (if audience is one position)',
            type: 'select',
            options: positions.map((p) => ({ value: p.id, label: p.name })),
          },
          { name: 'publish_at', label: 'Publish at', type: 'datetime' },
          { name: 'expires_at', label: 'Expires at', type: 'datetime', hint: 'Leave blank to keep showing.' },
          { name: 'is_published', label: 'Published — visible to the audience above', type: 'checkbox' },
        ]}
        action={saveAnnouncement}
      />
    </>
  )
}
