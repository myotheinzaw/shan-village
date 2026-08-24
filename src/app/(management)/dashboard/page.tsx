import Link from 'next/link'
import { CalendarPlus, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Stat } from '@/components/ui/stat'
import { RosterStatusBadge } from '@/components/ui/status'
import { Badge } from '@/components/ui/badge'
import { can, requireUser } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  getAssignmentsInRange,
  getEmployees,
  getPeriodsInRange,
  getPositions,
  getStaffingRequirements,
} from '@/lib/data/roster'
import {
  addWeeksISO,
  formatLongDate,
  formatWeekLabel,
  startOfWeekISO,
  todayInTimeZone,
  weekDates,
} from '@/lib/roster/dates'
import { coverage } from '@/lib/roster/validation'
import { formatShift } from '@/lib/roster/shift'

export const metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await requireUser()
  const settings = await getSettings()
  const supabase = await createSupabaseServerClient()

  const today = todayInTimeZone(settings.timezone)
  const thisWeek = startOfWeekISO(today, settings.week_start_day)
  const nextWeek = addWeeksISO(thisWeek, 1)

  const [employees, positions, staffingRules, periods, weekAssignments] = await Promise.all([
    getEmployees(),
    getPositions(),
    can(user, 'roster.view_all') ? getStaffingRequirements() : Promise.resolve([]),
    getPeriodsInRange(thisWeek, weekDates(nextWeek)[6]!),
    getAssignmentsInRange(thisWeek, weekDates(nextWeek)[6]!),
  ])

  const positionById = new Map(positions.map((p) => [p.id, p]))
  const employeeById = new Map(employees.map((e) => [e.id, e]))

  const todayAssignments = weekAssignments.filter((a) => a.work_date === today)
  const working = todayAssignments.filter((a) => a.status === 'WORK')
  const offToday = todayAssignments.filter((a) => a.status === 'OFF')
  const leaveToday = todayAssignments.filter((a) => a.status === 'LEAVE')
  const phToday = todayAssignments.filter((a) => a.status === 'PH')
  const missingToday = employees.filter((e) => !todayAssignments.some((a) => a.employee_id === e.id))

  const thisWeekPeriod = periods.find((p) => p.start_date === thisWeek && p.period_type === 'WEEK')
  const nextWeekPeriod = periods.find((p) => p.start_date === nextWeek && p.period_type === 'WEEK')

  const gaps = coverage({
    weekStart: thisWeek,
    assignments: weekAssignments.map((a) => ({
      employeeId: a.employee_id,
      workDate: a.work_date,
      status: a.status,
      startTime: a.start_time,
      endTime: a.end_time,
      positionId: a.position_id,
      outletId: a.outlet_id,
    })),
    employees: employees.map((e) => ({
      id: e.id,
      fullName: e.full_name,
      isActive: e.is_active,
      positionId: e.position_id,
      departmentId: e.department_id,
      outletId: e.outlet_id,
    })),
    staffingRules: staffingRules.map((r) => ({
      outletId: r.outlet_id,
      positionId: r.position_id,
      departmentId: r.department_id,
      dayOfWeek: r.day_of_week,
      minStaff: r.min_staff,
      label: r.label,
    })),
  }).filter((c) => !c.ok)

  const gapsToday = gaps.filter((g) => g.date === today)

  // Pending approvals. The financial counts are only fetched when the user is
  // allowed to see them — and RLS would return nothing even if they were not.
  const canReview = can(user, 'requests.review') || can(user, 'requests.approve') || can(user, 'leave.approve')
  const canFinance = can(user, 'finance.view')
  const pendingStatuses = ['SUBMITTED', 'MANAGER_REVIEWED']

  const countPending = async (table: string) => {
    if (!canReview && !canFinance) return 0
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .in('status', pendingStatuses)
    return count ?? 0
  }

  const [pendingLeave, pendingChange, pendingSwap, pendingEncash, pendingAdvance] = await Promise.all([
    canReview ? countPending('leave_requests') : Promise.resolve(0),
    canReview ? countPending('shift_change_requests') : Promise.resolve(0),
    canReview ? countPending('shift_swap_requests') : Promise.resolve(0),
    canFinance ? countPending('leave_encashment_requests') : Promise.resolve(0),
    canFinance ? countPending('cash_advance_requests') : Promise.resolve(0),
  ])

  const totalPending = pendingLeave + pendingChange + pendingSwap + pendingEncash + pendingAdvance

  const { data: upcomingLeave } = await supabase
    .from('leave_requests')
    .select('id, employee_id, from_date, to_date, status')
    .eq('status', 'APPROVED')
    .gte('to_date', today)
    .order('from_date')
    .limit(6)

  return (
    <>
      <PageHeader
        title={`Good day, ${(user.profile.full_name || user.email).split(' ')[0]}`}
        description={formatLongDate(today)}
        actions={
          can(user, 'roster.create') || can(user, 'roster.edit') ? (
            <Button asChild size="lg">
              <Link href={`/roster?week=${thisWeek}`}>
                <CalendarPlus className="size-4" />
                Create / edit roster
              </Link>
            </Button>
          ) : null
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Working today" value={working.length} href="/roster" />
        <Stat label="OFF today" value={offToday.length} />
        <Stat label="On leave" value={leaveToday.length} tone={leaveToday.length ? 'warn' : 'neutral'} />
        <Stat label="Public holiday" value={phToday.length} />
        <Stat
          label="No entry today"
          value={missingToday.length}
          tone={missingToday.length ? 'warn' : 'good'}
          hint={missingToday.length ? 'Employees with nothing rostered' : 'Everyone accounted for'}
        />
        <Stat label="Active employees" value={employees.length} href="/employees" />
      </section>

      {gapsToday.length > 0 ? (
        <Alert tone="warning" className="mt-4" title="Staffing gap today">
          <ul className="mt-1 list-inside list-disc">
            {gapsToday.map((g) => (
              <li key={`${g.ruleLabel}-${g.date}`}>
                {g.ruleLabel}: {g.actual} of {g.required} required
              </li>
            ))}
          </ul>
        </Alert>
      ) : staffingRules.length > 0 ? (
        <Alert tone="success" className="mt-4">
          Coverage OK for today against all {staffingRules.length} staffing rules.
        </Alert>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>On duty today</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/roster?week=${thisWeek}`}>
                Full roster <ChevronRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {working.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">
                Nobody is rostered to work today.
              </p>
            ) : (
              <ul className="divide-y divide-sand-100">
                {working
                  .slice()
                  .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
                  .map((a) => {
                    const employee = employeeById.get(a.employee_id)
                    const position = positionById.get(a.position_id ?? employee?.position_id ?? '')
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">
                            {employee?.full_name ?? 'Unknown employee'}
                          </p>
                          <p className="text-xs text-ink-500">{position?.name ?? '—'}</p>
                        </div>
                        <span className="shrink-0 font-mono text-sm tabular-nums text-ink-700">
                          {formatShift({
                            status: a.status,
                            startTime: a.start_time,
                            endTime: a.end_time,
                            crossesMidnight: a.crosses_midnight,
                            isSplit: a.is_split,
                            segment2Start: a.segment2_start,
                            segment2End: a.segment2_end,
                          })}
                        </span>
                      </li>
                    )
                  })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Roster status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-ink-900">This week</p>
                  <p className="text-xs text-ink-500">{formatWeekLabel(thisWeek)}</p>
                </div>
                {thisWeekPeriod ? (
                  <RosterStatusBadge status={thisWeekPeriod.status} />
                ) : (
                  <Badge variant="muted">Not started</Badge>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-ink-900">Next week</p>
                  <p className="text-xs text-ink-500">{formatWeekLabel(nextWeek)}</p>
                </div>
                {nextWeekPeriod ? (
                  <RosterStatusBadge status={nextWeekPeriod.status} />
                ) : (
                  <Badge variant="muted">Not started</Badge>
                )}
              </div>
              <Button variant="secondary" asChild className="mt-1">
                <Link href={`/roster?week=${nextWeek}`}>Open next week</Link>
              </Button>
            </CardContent>
          </Card>

          {canReview || canFinance ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Pending approvals</CardTitle>
                {totalPending > 0 ? <Badge variant="primary">{totalPending}</Badge> : null}
              </CardHeader>
              <CardContent>
                {totalPending === 0 ? (
                  <p className="py-2 text-sm text-ink-500">Nothing is waiting for a decision.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {canReview ? (
                      <>
                        <PendingRow label="Leave requests" count={pendingLeave} />
                        <PendingRow label="Shift changes" count={pendingChange} />
                        <PendingRow label="Shift swaps" count={pendingSwap} />
                      </>
                    ) : null}
                    {canFinance ? (
                      <>
                        <PendingRow label="Leave encashment" count={pendingEncash} />
                        <PendingRow label="Cash advances" count={pendingAdvance} />
                      </>
                    ) : null}
                  </ul>
                )}
                <Button variant="secondary" asChild className="mt-3 w-full">
                  <Link href="/approvals">Open Approval Centre</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Upcoming approved leave</CardTitle>
            </CardHeader>
            <CardContent>
              {(upcomingLeave ?? []).length === 0 ? (
                <p className="py-2 text-sm text-ink-500">No approved leave coming up.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {(upcomingLeave ?? []).map(
                    (l: { id: string; employee_id: string; from_date: string; to_date: string }) => (
                      <li key={l.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-ink-900">
                          {employeeById.get(l.employee_id)?.full_name ?? 'Employee'}
                        </span>
                        <span className="shrink-0 text-xs text-ink-500">
                          {l.from_date} → {l.to_date}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function PendingRow({ label, count }: { label: string; count: number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-ink-700">{label}</span>
      <span className={count > 0 ? 'font-semibold text-spice-600' : 'text-ink-500'}>{count}</span>
    </li>
  )
}
