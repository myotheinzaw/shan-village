import Link from 'next/link'
import { ArrowRight, CalendarCheck, Megaphone } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAssignmentsInRange } from '@/lib/data/roster'
import {
  addDaysISO,
  formatDayLabel,
  formatHours,
  formatLongDate,
  startOfWeekISO,
  todayInTimeZone,
  weekDates,
} from '@/lib/roster/dates'
import { formatShift } from '@/lib/roster/shift'
import { cn } from '@/lib/utils'
import type { AssignmentStatus, RosterAssignment } from '@/types/db'

export const metadata = { title: 'Home' }
export const dynamic = 'force-dynamic'

const TONE: Record<AssignmentStatus, string> = {
  WORK: 'bg-spice-600 text-white',
  OFF: 'bg-teal-600 text-white',
  PH: 'bg-teal-700 text-white',
  LEAVE: 'bg-sky-600 text-white',
  TRIAL: 'bg-purple-600 text-white',
  OTHER: 'bg-amber-600 text-white',
}

function DutyCard({
  heading,
  date,
  assignment,
}: {
  heading: string
  date: string
  assignment: RosterAssignment | undefined
}) {
  const label = assignment
    ? formatShift({
        status: assignment.status,
        startTime: assignment.start_time,
        endTime: assignment.end_time,
        crossesMidnight: assignment.crosses_midnight,
        isSplit: assignment.is_split,
        segment2Start: assignment.segment2_start,
        segment2End: assignment.segment2_end,
      })
    : 'Not published yet'

  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] p-4 shadow-sm',
        assignment ? TONE[assignment.status] : 'border border-dashed border-sand-300 bg-white text-ink-500',
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{heading}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{label}</p>
      <p className="mt-0.5 text-xs opacity-80">{formatDayLabel(date)}</p>
      {assignment?.note ? <p className="mt-1 text-xs opacity-90">{assignment.note}</p> : null}
    </div>
  )
}

export default async function StaffHome({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>
}) {
  const user = await requireUser()
  const settings = await getSettings()
  const { denied } = await searchParams
  const supabase = await createSupabaseServerClient()

  const today = todayInTimeZone(settings.timezone)
  const tomorrow = addDaysISO(today, 1)
  const weekStart = startOfWeekISO(today, settings.week_start_day)
  const dates = weekDates(weekStart)

  if (!user.employee) {
    return (
      <Alert tone="warning" title="Your login is not linked to an employee record yet">
        Ask the restaurant office to link your account so your roster and requests appear here.
      </Alert>
    )
  }

  const employeeId = user.employee.id

  // Look 30 days ahead so "next OFF" can be found beyond this week.
  const horizon = addDaysISO(today, 30)
  const mine = await getAssignmentsInRange(today, horizon, employeeId)
  const thisWeek = await getAssignmentsInRange(dates[0]!, dates[6]!, employeeId)

  const todayShift = mine.find((a) => a.work_date === today)
  const tomorrowShift = mine.find((a) => a.work_date === tomorrow)
  const nextOff = mine.find((a) => a.work_date >= today && a.status === 'OFF')

  const workingDays = thisWeek.filter((a) => a.status === 'WORK').length
  const offDays = thisWeek.filter((a) => a.status === 'OFF').length
  const weekHours = thisWeek.reduce((sum, a) => sum + Number(a.scheduled_hours ?? 0), 0)

  const [{ data: announcements }, leave, change, swap, encash, advance] = await Promise.all([
    supabase
      .from('announcements')
      .select('id, title, body, priority, publish_at')
      .order('priority', { ascending: false })
      .order('publish_at', { ascending: false })
      .limit(3),
    supabase.from('leave_requests').select('status').eq('employee_id', employeeId),
    supabase.from('shift_change_requests').select('status').eq('employee_id', employeeId),
    supabase.from('shift_swap_requests').select('status').eq('requester_employee_id', employeeId),
    supabase.from('leave_encashment_requests').select('status').eq('employee_id', employeeId),
    supabase.from('cash_advance_requests').select('status').eq('employee_id', employeeId),
  ])

  const allStatuses = [
    ...(leave.data ?? []),
    ...(change.data ?? []),
    ...(swap.data ?? []),
    ...(encash.data ?? []),
    ...(advance.data ?? []),
  ].map((r) => (r as { status: string }).status)

  const pending = allStatuses.filter((s) => s === 'SUBMITTED' || s === 'MANAGER_REVIEWED').length
  const approved = allStatuses.filter((s) => s === 'APPROVED' || s === 'PAID').length
  const rejected = allStatuses.filter((s) => s === 'REJECTED').length

  return (
    <div className="flex flex-col gap-4">
      {denied ? (
        <Alert tone="warning" title="That page is not available to you">
          Your account does not have access to that part of the system.
        </Alert>
      ) : null}

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">
          Hello, {(user.employee.preferred_name || user.employee.full_name).split(' ')[0]}
        </h1>
        <p className="text-sm text-ink-500">{formatLongDate(today)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DutyCard heading="Today" date={today} assignment={todayShift} />
        <DutyCard heading="Tomorrow" date={tomorrow} assignment={tomorrowShift} />
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Next OFF day</p>
            <p className="mt-0.5 text-lg font-semibold text-ink-900">
              {nextOff ? formatDayLabel(nextOff.work_date) : 'None scheduled yet'}
            </p>
          </div>
          <CalendarCheck className="size-8 text-teal-600" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-ink-900">{workingDays}</p>
              <p className="text-xs text-ink-500">Working days</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-ink-900">{offDays}</p>
              <p className="text-xs text-ink-500">OFF days</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-ink-900">{formatHours(weekHours)}</p>
              <p className="text-xs text-ink-500">Scheduled</p>
            </div>
          </div>
          <Button asChild size="lg" className="mt-4 w-full">
            <Link href="/staff/roster">
              View full roster
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>My requests</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/staff/requests">Open</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-amber-700">{pending}</p>
              <p className="text-xs text-ink-500">Pending</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-teal-700">{approved}</p>
              <p className="text-xs text-ink-500">Approved</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-red-700">{rejected}</p>
              <p className="text-xs text-ink-500">Rejected</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Megaphone className="size-4 text-spice-600" />
          <CardTitle>Announcements</CardTitle>
        </CardHeader>
        <CardContent>
          {(announcements ?? []).length === 0 ? (
            <p className="text-sm text-ink-500">Nothing new right now.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(announcements ?? []).map(
                (a: { id: string; title: string; body: string; priority: string }) => (
                  <li key={a.id} className="rounded-lg border border-sand-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-ink-900">{a.title}</p>
                      {a.priority === 'URGENT' || a.priority === 'HIGH' ? (
                        <Badge variant={a.priority === 'URGENT' ? 'danger' : 'warning'}>
                          {a.priority === 'URGENT' ? 'Urgent' : 'Important'}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{a.body}</p>
                  </li>
                ),
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
