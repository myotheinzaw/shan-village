import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { REPORTS, type ReportKey } from '@/lib/reports'
import { toCsv } from '@/lib/utils'

/**
 * CSV export. Guarded by reports.export, and the report bodies themselves read
 * through the user-scoped client, so an export can never contain a row the user
 * could not already see on screen.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ type: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  if (!user.permissions.has('reports.export')) return new NextResponse('Forbidden', { status: 403 })

  const { type } = await context.params
  if (!(type in REPORTS)) return new NextResponse('Unknown report', { status: 404 })

  const params = request.nextUrl.searchParams
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new NextResponse('A valid from and to date are required', { status: 400 })
  }

  const table = await REPORTS[type as ReportKey]({
    from,
    to,
    employeeId: params.get('employee') ?? undefined,
    positionId: params.get('position') ?? undefined,
    outletId: params.get('outlet') ?? undefined,
    status: params.get('status') ?? undefined,
  })

  const csv = toCsv([
    [table.title],
    [`Exported ${new Date().toISOString().slice(0, 19).replace('T', ' ')} by ${user.email}`],
    [],
    table.headers,
    ...table.rows,
    ...(table.totals ? [table.totals] : []),
  ])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="shan-village-${type}-${from}-to-${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
