import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { requireUser } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import {
  getAssignmentsInRange,
  getEmployeeDirectory,
  getPeriodsInRange,
  getPositions,
} from '@/lib/data/roster'
import {
  addWeeksISO,
  formatDayLabel,
  formatHours,
  formatWeekLabel,
  startOfWeekISO,
  todayInTimeZone,
  weekDates,
} from '@/lib/roster/dates'
import { formatShift } from '@/lib/roster/shift'
import { ASSIGNMENT_STYLES } from '@/components/ui/status'
import { cn } from '@/lib/utils'

export const metadata = { title: 'My Roster' }
export const dynamic = 'force-dynamic'

export default async function StaffRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const user = await requireUser()
  const settings = await getSettings()
  const { week } = await searchParams

  if (!user.employee) {
    return (
      <Alert tone="warning" title="Your login is not linked to an employee record yet">
        Ask the restaurant office to link your account.
      </Alert>
    )
  }

  const today = todayInTimeZone(settings.timezone)
  const requested = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today
  const weekStart = startOfWeekISO(requested, settings.week_start_day)
  const dates = weekDates(weekStart)

  // RLS decides what comes back here: only published periods, and only the
  // team's rows if the Admin has left the team roster switched on.
  const [assignments, directory, positions, periods] = await Promise.all([
    getAssignmentsInRange(dates[0]!, dates[6]!),
    getEmployeeDirectory(),
    getPositions(true),
    getPeriodsInRange(dates[0]!, dates[6]!),
  ])

  const mine = assignments.filter((a) => a.employee_id === user.employee!.id)
  const team = assignments.filter((a) => a.employee_id !== user.employee!.id)
  const nameById = new Map(directory.map((e) => [e.id, e.preferred_name || e.full_name]))
  const positionById = new Map(positions.map((p) => [p.id, p]))
  const published = periods.some((p) => p.status !== 'DRAFT')

  const weekHours = mine.reduce((sum, a) => sum + Number(a.scheduled_hours ?? 0), 0)

  const teamByDate = new Map<string, typeof team>()
  for (const a of team) {
    const list = teamByDate.get(a.work_date)
    if (list) list.push(a)
    else teamByDate.set(a.work_date, [a])
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" asChild aria-label="Previous week">
          <Link href={`/staff/roster?week=${addWeeksISO(weekStart, -1)}`}>
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <div className="text-center">
          <p className="text-sm font-semibold text-ink-900">{formatWeekLabel(weekStart)}</p>
          {!published ? <p className="text-xs text-ink-500">Not published yet</p> : null}
        </div>
        <Button variant="outline" size="icon" asChild aria-label="Next week">
          <Link href={`/staff/roster?week=${addWeeksISO(weekStart, 1)}`}>
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>

      {!published ? (
        <Alert tone="info">
          The roster for this week has not been published yet. It will appear here as soon as your
          manager publishes it.
        </Alert>
      ) : null}

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My shifts</TabsTrigger>
          <TabsTrigger value="team">The team</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-3 flex flex-col gap-2">
          {dates.map((date) => {
            const assignment = mine.find((a) => a.work_date === date)
            return (
              <Card key={date} className={cn(date === today && 'ring-2 ring-spice-400')}>
                <CardContent className="flex items-center justify-between gap-3 p-3.5">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{formatDayLabel(date)}</p>
                    {assignment?.note ? (
                      <p className="text-xs text-ink-500">{assignment.note}</p>
                    ) : null}
                  </div>
                  {assignment ? (
                    <span
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-sm font-medium tabular-nums',
                        ASSIGNMENT_STYLES[assignment.status],
                      )}
                    >
                      {formatShift({
                        status: assignment.status,
                        startTime: assignment.start_time,
                        endTime: assignment.end_time,
                        crossesMidnight: assignment.crosses_midnight,
                        isSplit: assignment.is_split,
                        segment2Start: assignment.segment2_start,
                        segment2End: assignment.segment2_end,
                      })}
                    </span>
                  ) : (
                    <span className="text-sm text-ink-500">—</span>
                  )}
                </CardContent>
              </Card>
            )
          })}
          <p className="mt-1 text-center text-sm text-ink-500">
            Scheduled this week: <strong className="text-ink-900">{formatHours(weekHours)}</strong>
          </p>
        </TabsContent>

        <TabsContent value="team" className="mt-3 flex flex-col gap-3">
          {team.length === 0 ? (
            <Alert tone="info">
              The team roster is not available to you. Your own shifts are on the other tab.
            </Alert>
          ) : (
            dates.map((date) => {
              const onDate = (teamByDate.get(date) ?? []).filter((a) => a.status === 'WORK')
              return (
                <Card key={date}>
                  <CardContent className="p-3.5">
                    <p className="mb-2 text-sm font-medium text-ink-900">{formatDayLabel(date)}</p>
                    {onDate.length === 0 ? (
                      <p className="text-sm text-ink-500">Nobody else is rostered.</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {onDate
                          .slice()
                          .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
                          .map((a) => (
                            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate text-ink-900">
                                {nameById.get(a.employee_id) ?? 'Colleague'}
                                <Badge variant="muted" className="ml-2">
                                  {positionById.get(a.position_id ?? '')?.short_name ?? ''}
                                </Badge>
                              </span>
                              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-700">
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
                          ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
