import { PageHeader } from '@/components/layout/app-shell'
import { can, requireAnyPermission } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import {
  findPeriod,
  getApprovedLeaveDays,
  getAssignmentsForPeriod,
  getEmployees,
  getLeaveTypes,
  getOutlets,
  getPositions,
  getShiftTemplates,
  getStaffingRequirements,
} from '@/lib/data/roster'
import { startOfWeekISO, todayInTimeZone, weekDates } from '@/lib/roster/dates'
import { RosterBuilder } from './roster-builder'

export const metadata = { title: 'Weekly Roster' }
export const dynamic = 'force-dynamic'

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const user = await requireAnyPermission(['roster.view_all'])
  const settings = await getSettings()
  const { week } = await searchParams

  const requested = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : todayInTimeZone(settings.timezone)
  const weekStart = startOfWeekISO(requested, settings.week_start_day)
  const dates = weekDates(weekStart)

  // The restaurant runs one roster covering every outlet — exactly like the
  // spreadsheet, which lists MALL and NIGHT MARKET as sections of one sheet.
  // The schema supports per-outlet periods for later; the builder uses the
  // company-wide one and filters the view by outlet instead.
  const period = await findPeriod(weekStart, null)

  const [employees, positions, outlets, shiftTemplates, leaveTypes, staffingRules, approvedLeave] =
    await Promise.all([
      getEmployees(true),
      getPositions(true),
      getOutlets(),
      getShiftTemplates(),
      getLeaveTypes(),
      getStaffingRequirements(),
      getApprovedLeaveDays(weekStart, dates[6]!),
    ])

  const assignments = period ? await getAssignmentsForPeriod(period.id) : []

  return (
    <>
      <PageHeader
        title="Weekly Roster"
        description="Build the week, check coverage, then publish it to staff."
      />
      <RosterBuilder
        weekStart={weekStart}
        period={period}
        employees={employees.filter((e) => e.is_active || assignments.some((a) => a.employee_id === e.id))}
        positions={positions}
        outlets={outlets}
        shiftTemplates={shiftTemplates}
        leaveTypes={leaveTypes}
        assignments={assignments}
        staffingRules={staffingRules}
        approvedLeave={approvedLeave}
        thresholds={{
          maxWeeklyHours: settings.max_weekly_hours_warning,
          maxShiftHours: settings.max_shift_hours_warning,
          minOffDays: settings.min_off_days_per_week,
        }}
        permissions={{
          canEdit: can(user, 'roster.edit'),
          canCreate: can(user, 'roster.create'),
          canPublish: can(user, 'roster.publish'),
          canUnlock: can(user, 'roster.unlock'),
          canDelete: can(user, 'roster.delete'),
        }}
      />
    </>
  )
}
