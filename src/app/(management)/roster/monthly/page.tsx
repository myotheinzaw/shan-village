import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/layout/app-shell'
import { QuerySelect } from '@/components/layout/query-filters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RosterStatusBadge } from '@/components/ui/status'
import { requireAnyPermission } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import {
  getAssignmentsInRange,
  getEmployees,
  getOutlets,
  getPeriodsInRange,
  getPositions,
} from '@/lib/data/roster'
import { formatHours, todayInTimeZone } from '@/lib/roster/dates'
import { formatShift } from '@/lib/roster/shift'
import { cn } from '@/lib/utils'
import type { AssignmentStatus } from '@/types/db'

export const metadata = { title: 'Monthly Roster' }
export const dynamic = 'force-dynamic'

/** Compact cell labels, the way the paper roster abbreviates them. */
const ABBREVIATION: Record<AssignmentStatus, string> = {
  WORK: '',
  OFF: 'OFF',
  PH: 'PH',
  LEAVE: 'L',
  TRIAL: 'T',
  OTHER: '·',
}

const CELL_TONE: Record<AssignmentStatus, string> = {
  WORK: 'bg-white text-ink-900',
  OFF: 'bg-sand-100 text-ink-500',
  PH: 'bg-teal-50 text-teal-700',
  LEAVE: 'bg-sky-50 text-sky-700',
  TRIAL: 'bg-purple-50 text-purple-700',
  OTHER: 'bg-amber-50 text-amber-700',
}

export default async function MonthlyRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; position?: string; outlet?: string; employee?: string }>
}) {
  await requireAnyPermission(['roster.view_all'])
  const settings = await getSettings()
  const params = await searchParams

  const today = todayInTimeZone(settings.timezone)
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : today.slice(0, 7)
  const year = Number(month.slice(0, 4))
  const monthIndex = Number(month.slice(5, 7)) - 1

  const monthStart = `${month}-01`
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`
  const days = Array.from({ length: lastDay }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)

  const prevMonth = new Date(Date.UTC(year, monthIndex - 1, 1)).toISOString().slice(0, 7)
  const nextMonth = new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString().slice(0, 7)

  const [employees, positions, outlets, assignments, periods] = await Promise.all([
    getEmployees(true),
    getPositions(true),
    getOutlets(),
    getAssignmentsInRange(monthStart, monthEnd),
    getPeriodsInRange(monthStart, monthEnd),
  ])

  const positionById = new Map(positions.map((p) => [p.id, p]))
  const assignmentMap = new Map(assignments.map((a) => [`${a.employee_id}|${a.work_date}`, a]))

  const visible = employees.filter((e) => {
    if (params.position && e.position_id !== params.position) return false
    if (params.outlet && e.outlet_id !== params.outlet) return false
    if (params.employee && e.id !== params.employee) return false
    return e.is_active || assignments.some((a) => a.employee_id === e.id)
  })

  const monthLabel = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <>
      <PageHeader
        title="Monthly Roster"
        description="A month at a glance. Click any week to open it in the builder."
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-sand-200 bg-white p-1">
            <Button variant="ghost" size="icon" asChild aria-label="Previous month">
              <Link href={`/roster/monthly?month=${prevMonth}`}><ChevronLeft className="size-4" /></Link>
            </Button>
            <span className="min-w-36 px-2 text-center text-sm font-semibold">{monthLabel}</span>
            <Button variant="ghost" size="icon" asChild aria-label="Next month">
              <Link href={`/roster/monthly?month=${nextMonth}`}><ChevronRight className="size-4" /></Link>
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <QuerySelect
          name="position"
          label="Filter by position"
          allLabel="All positions"
          value={params.position ?? ''}
          options={positions.map((p) => ({ value: p.id, label: p.name }))}
        />
        <QuerySelect
          name="outlet"
          label="Filter by outlet"
          allLabel="All outlets"
          value={params.outlet ?? ''}
          options={outlets.map((o) => ({ value: o.id, label: o.name }))}
        />
        <QuerySelect
          name="employee"
          label="Filter by employee"
          allLabel="All employees"
          value={params.employee ?? ''}
          options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-500">Weeks in this month:</span>
        {periods.length === 0 ? (
          <Badge variant="muted">No roster created</Badge>
        ) : (
          periods.map((p) => (
            <Link key={p.id} href={`/roster?week=${p.start_date}`} className="inline-flex items-center gap-1.5">
              <span className="text-ink-700 underline-offset-2 hover:underline">{p.start_date}</span>
              <RosterStatusBadge status={p.status} />
            </Link>
          ))
        )}
      </div>

      <div className="roster-scroll rounded-[var(--radius-card)] border border-sand-200 bg-white">
        <table className="w-full min-w-max border-collapse text-xs">
          <thead>
            <tr>
              <th className="roster-sticky-col w-52 border-b border-sand-200 bg-sand-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                Employee
              </th>
              {days.map((date) => {
                const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
                return (
                  <th
                    key={date}
                    className={cn(
                      'border-b border-sand-200 bg-sand-50 px-1 py-2 text-center font-medium text-ink-500',
                      (weekday === 0 || weekday === 6) && 'bg-sand-100',
                      date === today && 'bg-spice-100 text-spice-700',
                    )}
                  >
                    <span className="block">{date.slice(8)}</span>
                    <span className="block text-[10px]">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'][weekday]}
                    </span>
                  </th>
                )
              })}
              <th className="border-b border-sand-200 bg-sand-50 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-500">
                Hours
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((employee) => {
              let hours = 0
              return (
                <tr key={employee.id} className="hover:bg-sand-50/60">
                  <td className="roster-sticky-col border-b border-sand-100 px-3 py-1.5">
                    <p className="truncate text-sm font-medium text-ink-900">{employee.full_name}</p>
                    <p className="truncate text-[11px] text-ink-500">
                      {positionById.get(employee.position_id ?? '')?.name ?? '—'}
                    </p>
                  </td>
                  {days.map((date) => {
                    const assignment = assignmentMap.get(`${employee.id}|${date}`)
                    if (assignment) hours += Number(assignment.scheduled_hours ?? 0)
                    const label = assignment
                      ? assignment.status === 'WORK'
                        ? (assignment.start_time?.slice(0, 2) ?? 'ON')
                        : ABBREVIATION[assignment.status]
                      : ''
                    return (
                      <td
                        key={date}
                        title={
                          assignment
                            ? formatShift({
                                status: assignment.status,
                                startTime: assignment.start_time,
                                endTime: assignment.end_time,
                                crossesMidnight: assignment.crosses_midnight,
                                isSplit: assignment.is_split,
                                segment2Start: assignment.segment2_start,
                                segment2End: assignment.segment2_end,
                              })
                            : 'No entry'
                        }
                        className={cn(
                          'border-b border-l border-sand-100 px-1 py-1.5 text-center tabular-nums',
                          assignment ? CELL_TONE[assignment.status] : 'bg-sand-50/40 text-ink-500',
                        )}
                      >
                        {label || (assignment ? '·' : '')}
                      </td>
                    )
                  })}
                  <td className="border-b border-l border-sand-100 px-2 py-1.5 text-right font-medium tabular-nums">
                    {formatHours(hours)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-ink-500">
        Working days show the shift start hour. OFF, PH (public holiday), L (leave) and T (trial) are
        abbreviated; hover any cell for the full shift.
      </p>
    </>
  )
}
