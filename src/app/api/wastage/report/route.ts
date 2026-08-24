import { NextResponse, type NextRequest } from 'next/server'
import { formatInTimeZone } from 'date-fns-tz'
import { getCurrentUser } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildReportData, loadWastageDay } from '@/lib/wastage/report'
import { buildWastageWorkbook, reportFileName } from '@/lib/wastage/workbook'

/**
 * Download the day's workbook directly, without going through Google Drive.
 *
 * Read through the caller's own client, so the file can only ever contain rows
 * they could already see, and the estimated values are present only for a
 * caller who holds wastage.cost_view.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  if (!user.enabledModules.has('wastage')) return new NextResponse('Not found', { status: 404 })
  if (!user.permissions.has('wastage.view')) return new NextResponse('Forbidden', { status: 403 })

  const settings = await getSettings()
  const requested = request.nextUrl.searchParams.get('date')
  const date =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
      ? requested
      : formatInTimeZone(new Date(), settings.timezone, 'yyyy-MM-dd')

  const outletId = request.nextUrl.searchParams.get('outlet')
  const supabase = await createSupabaseServerClient()
  const day = await loadWastageDay(supabase, date, { outletId })

  const report = buildReportData(day, {
    restaurantName: settings.restaurant_name,
    currency: settings.currency,
    includeValues: user.permissions.has('wastage.cost_view'),
    generatedAt: formatInTimeZone(new Date(), settings.timezone, "yyyy-MM-dd HH:mm 'local time'"),
  })

  const workbook = buildWastageWorkbook(report)
  const fileName = reportFileName(settings.restaurant_name, date)

  return new NextResponse(workbook as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
