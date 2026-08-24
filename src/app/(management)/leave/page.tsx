import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/layout/app-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RequestStatusBadge } from '@/components/ui/status'
import { EmptyState, Table, TableWrap, Td, Th } from '@/components/ui/table'
import { requireAnyPermission } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import { getEmployeeDirectory, getLeaveTypes } from '@/lib/data/roster'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { todayInTimeZone } from '@/lib/roster/dates'
import { cn } from '@/lib/utils'
import type { LeaveRequest } from '@/types/db'

export const metadata = { title: 'Leave' }
export const dynamic = 'force-dynamic'

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  await requireAnyPermission(['requests.view_all', 'leave.approve'])
  const settings = await getSettings()
  const { month: monthParam } = await searchParams
  const supabase = await createSupabaseServerClient()

  const today = todayInTimeZone(settings.timezone)
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : today.slice(0, 7)
  const year = Number(month.slice(0, 4))
  const monthIndex = Number(month.slice(5, 7)) - 1
  const monthStart = `${month}-01`
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`
  const days = Array.from({ length: lastDay }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)

  const prevMonth = new Date(Date.UTC(year, monthIndex - 1, 1)).toISOString().slice(0, 7)
  const nextMonth = new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString().slice(0, 7)

  const [{ data: inMonth }, { data: upcoming }, directory, leaveTypes] = await Promise.all([
    supabase
      .from('leave_requests')
      .select('*')
      .lte('from_date', monthEnd)
      .gte('to_date', monthStart)
      .in('status', ['SUBMITTED', 'MANAGER_REVIEWED', 'APPROVED']),
    supabase
      .from('leave_requests')
      .select('*')
      .gte('to_date', today)
      .order('from_date')
      .limit(50),
    getEmployeeDirectory(),
    getLeaveTypes(true),
  ])

  const monthLeave = (inMonth ?? []) as LeaveRequest[]
  const upcomingLeave = (upcoming ?? []) as LeaveRequest[]
  const nameById = new Map(directory.map((e) => [e.id, e.preferred_name || e.full_name]))
  const typeById = new Map(leaveTypes.map((t) => [t.id, t]))

  const employeesWithLeave = [...new Set(monthLeave.map((l) => l.employee_id))]

  const monthLabel = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <>
      <PageHeader
        title="Leave"
        description="Who is away and when, alongside every request still to be decided."
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-sand-200 bg-white p-1">
            <Button variant="ghost" size="icon" asChild aria-label="Previous month">
              <Link href={`/leave?month=${prevMonth}`}><ChevronLeft className="size-4" /></Link>
            </Button>
            <span className="min-w-36 px-2 text-center text-sm font-semibold">{monthLabel}</span>
            <Button variant="ghost" size="icon" asChild aria-label="Next month">
              <Link href={`/leave?month=${nextMonth}`}><ChevronRight className="size-4" /></Link>
            </Button>
          </div>
        }
      />

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Leave calendar</CardTitle>
        </CardHeader>
        <CardContent>
          {employeesWithLeave.length === 0 ? (
            <p className="text-sm text-ink-500">No leave falls in this month.</p>
          ) : (
            <div className="roster-scroll">
              <table className="w-full min-w-max border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="roster-sticky-col w-44 border-b border-sand-200 bg-sand-50 px-3 py-2 text-left font-semibold uppercase tracking-wide text-ink-500">
                      Employee
                    </th>
                    {days.map((date) => (
                      <th
                        key={date}
                        className={cn(
                          'border-b border-sand-200 bg-sand-50 px-1 py-2 text-center font-medium text-ink-500',
                          date === today && 'bg-spice-100 text-spice-700',
                        )}
                      >
                        {date.slice(8)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employeesWithLeave.map((employeeId) => (
                    <tr key={employeeId}>
                      <td className="roster-sticky-col border-b border-sand-100 px-3 py-1.5 text-sm font-medium text-ink-900">
                        {nameById.get(employeeId) ?? 'Employee'}
                      </td>
                      {days.map((date) => {
                        const leave = monthLeave.find(
                          (l) => l.employee_id === employeeId && date >= l.from_date && date <= l.to_date,
                        )
                        const type = leave ? typeById.get(leave.leave_type_id) : undefined
                        return (
                          <td
                            key={date}
                            title={leave ? `${type?.name ?? 'Leave'} — ${leave.status}` : undefined}
                            className="border-b border-l border-sand-100 p-0"
                          >
                            <div
                              className={cn(
                                'h-6 w-full',
                                leave
                                  ? leave.status === 'APPROVED'
                                    ? 'bg-sky-400'
                                    : 'bg-amber-300'
                                  : 'bg-transparent',
                              )}
                              style={leave?.status === 'APPROVED' && type?.colour ? { background: type.colour } : undefined}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-ink-500">
            Solid colour = approved leave. Amber = still awaiting a decision.
          </p>
        </CardContent>
      </Card>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
        Upcoming and current leave
      </h2>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Employee</Th>
              <Th>Type</Th>
              <Th>From</Th>
              <Th>To</Th>
              <Th className="text-right">Days</Th>
              <Th>Notice</Th>
              <Th>Status</Th>
              <Th>Reference</Th>
            </tr>
          </thead>
          <tbody>
            {upcomingLeave.map((leave) => (
              <tr key={leave.id} className="hover:bg-sand-50">
                <Td className="font-medium text-ink-900">{nameById.get(leave.employee_id) ?? '—'}</Td>
                <Td>{typeById.get(leave.leave_type_id)?.name ?? '—'}</Td>
                <Td>{leave.from_date}</Td>
                <Td>{leave.to_date}</Td>
                <Td className="text-right tabular-nums">{leave.total_days}</Td>
                <Td>
                  {leave.short_notice ? (
                    <Badge variant="warning">{leave.notice_days ?? 0} days</Badge>
                  ) : (
                    <span className="text-ink-500">{leave.notice_days ?? '—'} days</span>
                  )}
                </Td>
                <Td><RequestStatusBadge status={leave.status} /></Td>
                <Td className="font-mono text-xs text-ink-500">{leave.reference}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {upcomingLeave.length === 0 ? <EmptyState title="No upcoming leave" /> : null}
      </TableWrap>
    </>
  )
}
