import Link from 'next/link'
import { formatInTimeZone } from 'date-fns-tz'
import { Download, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/stat'
import { can, requireModule, requirePermission } from '@/lib/auth/session'
import { getWastageDay } from '@/lib/data/wastage'
import { getSettings } from '@/lib/settings'
import { WastageLog } from './wastage-log'
import { DayFilter } from './day-filter'

export const metadata = { title: 'Daily Wastage' }
export const dynamic = 'force-dynamic'

export default async function WastagePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; outlet?: string }>
}) {
  await requireModule('wastage')
  const user = await requirePermission('wastage.view')
  const settings = await getSettings()
  const params = await searchParams

  const today = formatInTimeZone(new Date(), settings.timezone, 'yyyy-MM-dd')
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today
  const outletId = params.outlet || null

  const canSeeValues = can(user, 'wastage.cost_view')
  const { entries, outlets, reasons, lastExport } = await getWastageDay(date, {
    outletId,
    canSeeValues,
  })

  const counted = entries.filter((entry) => entry.status !== 'REJECTED')
  const pending = entries.filter((entry) => entry.status === 'SUBMITTED').length
  const withPhoto = entries.filter((entry) => entry.photo_path).length
  const unpriced = counted.filter((entry) => entry.estimated_value === null).length
  const total = counted.reduce((sum, entry) => sum + (entry.estimated_value ?? 0), 0)

  const query = new URLSearchParams({ date, ...(outletId ? { outlet: outletId } : {}) })

  return (
    <>
      <PageHeader
        title="Daily Wastage"
        description="Everything staff reported from the floor, with the photo they took."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/wastage/report?${query}`}>
              <Download aria-hidden />
              Download Excel
            </a>
          </Button>
        }
      />

      <DayFilter date={date} today={today} outletId={outletId} outlets={outlets} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Entries" value={entries.length} hint={`${withPhoto} with a photo`} />
        <Stat
          label="Awaiting review"
          value={pending}
          tone={pending > 0 ? 'warn' : 'good'}
          hint={pending === 0 ? 'All reviewed' : 'Confirm or reject each one'}
        />
        {canSeeValues ? (
          <Stat
            label={`Estimated value (${settings.currency})`}
            value={total.toFixed(2)}
            tone={total > 0 ? 'bad' : 'neutral'}
            hint={unpriced > 0 ? `${unpriced} without a price` : 'Every entry priced'}
          />
        ) : (
          <Stat label="Estimated value" value="Hidden" hint="Requires wastage.cost_view" />
        )}
        <Stat
          label="Google Drive"
          value={
            lastExport?.status === 'SUCCESS' ? 'Published'
            : lastExport?.status === 'FAILED' ? 'Failed'
            : lastExport?.status === 'SKIPPED' ? 'Skipped'
            : 'Not yet'
          }
          tone={
            lastExport?.status === 'SUCCESS' ? 'good'
            : lastExport?.status === 'FAILED' ? 'bad'
            : 'neutral'
          }
          hint={
            lastExport
              ? formatInTimeZone(new Date(lastExport.created_at), settings.timezone, 'HH:mm')
              : 'Publishes after the first entry'
          }
        />
      </div>

      {lastExport && lastExport.status !== 'SUCCESS' && lastExport.error ? (
        <Alert tone={lastExport.status === 'FAILED' ? 'danger' : 'info'} className="mt-4">
          {lastExport.error}
        </Alert>
      ) : null}

      {lastExport?.status === 'SUCCESS' && lastExport.drive_url ? (
        <p className="mt-4 text-sm text-ink-500">
          This day is in Google Drive as{' '}
          <Link
            href={lastExport.drive_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-spice-700 underline-offset-4 hover:underline"
          >
            {lastExport.file_name}
            <ExternalLink className="size-3" aria-hidden />
          </Link>
          .
        </p>
      ) : null}

      <WastageLog
        date={date}
        entries={entries}
        outlets={outlets.map((outlet) => ({ id: outlet.id, name: outlet.name }))}
        reasons={reasons.map((reason) => ({ id: reason.id, name: reason.name }))}
        currency={settings.currency}
        canReview={can(user, 'wastage.approve')}
        canExport={can(user, 'wastage.export')}
        canSeeValues={canSeeValues}
      />
    </>
  )
}
