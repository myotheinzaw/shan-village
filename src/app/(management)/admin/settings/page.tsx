import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/alert'
import { requirePermission } from '@/lib/auth/session'
import { getAllSettings } from '@/lib/settings'
import { SettingsForm } from './settings-form'

export const metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requirePermission('admin.settings')
  const settings = await getAllSettings()

  return (
    <>
      <PageHeader
        title="Settings"
        description="Every policy the application applies is configured here, not written into the code."
      />
      <Alert tone="info" className="mb-4">
        Switching on <strong>Roster Manager may publish</strong> grants the roster.publish permission
        to the Roster Manager role immediately; switching it off removes it again.
      </Alert>
      <SettingsForm settings={settings} />
    </>
  )
}
