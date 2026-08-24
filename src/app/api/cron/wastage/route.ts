import { NextResponse, type NextRequest } from 'next/server'
import { formatInTimeZone } from 'date-fns-tz'
import { createSupabaseSystemClient } from '@/lib/supabase/system'
import { SETTING_DEFAULTS } from '@/lib/settings'
import { publishDailyWastageReport } from '@/lib/wastage/export'
import type { AppSetting } from '@/types/db'

/**
 * Scheduled publish of the wastage workbook to Google Drive.
 *
 * Automatic publishing already runs after each submission, so this exists for
 * the cases that path cannot cover: a submission whose background publish was
 * cut short, a spell where Drive was unreachable, and entries a manager edited
 * later in the day. It republishes today and yesterday — yesterday because a
 * late-evening shift files its wastage after midnight.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; the schedule is in
 * vercel.json. Without CRON_SECRET set, the endpoint refuses to run at all
 * rather than becoming an open trigger.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not configured, so scheduled publishing is disabled.' },
      { status: 503 },
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const client = createSupabaseSystemClient()
  const { data } = await client.from('app_settings').select('key, value').eq('key', 'timezone')
  const timezone =
    ((data ?? []) as Pick<AppSetting, 'key' | 'value'>[])[0]?.value as string | undefined

  const zone = timezone || SETTING_DEFAULTS.timezone
  const requested = request.nextUrl.searchParams.get('date')

  const dates =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
      ? [requested]
      : [
          formatInTimeZone(new Date(Date.now() - 86_400_000), zone, 'yyyy-MM-dd'),
          formatInTimeZone(new Date(), zone, 'yyyy-MM-dd'),
        ]

  const results = []
  for (const date of dates) {
    results.push(await publishDailyWastageReport({ date, trigger: 'CRON' }))
  }

  return NextResponse.json({ ok: true, results })
}
