'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eraser,
  Lock,
  LockOpen,
  Send,
  Trash2,
  TriangleAlert,
  Undo2,
  Users,
} from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Label, Select, Textarea } from '@/components/ui/field'
import { ASSIGNMENT_LABELS, ASSIGNMENT_STYLES, RosterStatusBadge } from '@/components/ui/status'
import { cn } from '@/lib/utils'
import { computeScheduledHours, formatShift } from '@/lib/roster/shift'
import { DAY_SHORT, addWeeksISO, formatHours, formatWeekLabel, weekDates } from '@/lib/roster/dates'
import { coverage, dailyTotals, validateRoster, type Finding } from '@/lib/roster/validation'
import type {
  AssignmentStatus,
  Employee,
  LeaveType,
  Outlet,
  Position,
  RosterAssignment,
  RosterPeriod,
  ShiftTemplate,
  StaffingRequirement,
} from '@/types/db'
import {
  changeRosterStatus,
  clearAssignments,
  copyPreviousWeek,
  deleteDraftPeriod,
  ensurePeriod,
  recordOverride,
  saveAssignments,
  type ActionResult,
} from './actions'

export interface RosterBuilderProps {
  weekStart: string
  period: RosterPeriod | null
  employees: Employee[]
  positions: Position[]
  outlets: Outlet[]
  shiftTemplates: ShiftTemplate[]
  leaveTypes: LeaveType[]
  assignments: RosterAssignment[]
  staffingRules: StaffingRequirement[]
  approvedLeave: { employeeId: string; date: string }[]
  thresholds: { maxWeeklyHours: number; maxShiftHours: number; minOffDays: number }
  permissions: {
    canEdit: boolean
    canCreate: boolean
    canPublish: boolean
    canUnlock: boolean
    canDelete: boolean
  }
}

interface CellDraft {
  employeeIds: string[]
  dates: string[]
  existing: RosterAssignment | null
}

const STATUS_OPTIONS: AssignmentStatus[] = ['WORK', 'OFF', 'PH', 'LEAVE', 'TRIAL', 'OTHER']

export function RosterBuilder(props: RosterBuilderProps) {
  const {
    weekStart,
    period,
    employees,
    positions,
    outlets,
    shiftTemplates,
    leaveTypes,
    assignments,
    staffingRules,
    approvedLeave,
    thresholds,
    permissions,
  } = props

  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<ActionResult | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<CellDraft | null>(null)
  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [outletFilter, setOutletFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showOverride, setShowOverride] = useState(false)

  const dates = useMemo(() => weekDates(weekStart), [weekStart])
  const positionById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions])
  const outletById = useMemo(() => new Map(outlets.map((o) => [o.id, o])), [outlets])
  const editable = permissions.canEdit && period !== null && period.status !== 'LOCKED'

  const assignmentMap = useMemo(() => {
    const map = new Map<string, RosterAssignment>()
    for (const a of assignments) map.set(`${a.employee_id}|${a.work_date}`, a)
    return map
  }, [assignments])

  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLowerCase()
    return employees.filter((e) => {
      if (term && !`${e.full_name} ${e.preferred_name ?? ''} ${e.employee_code}`.toLowerCase().includes(term))
        return false
      if (positionFilter && e.position_id !== positionFilter) return false
      if (outletFilter && e.outlet_id !== outletFilter) return false
      if (statusFilter) {
        const hasStatus = dates.some(
          (d) => assignmentMap.get(`${e.id}|${d}`)?.status === statusFilter,
        )
        if (!hasStatus) return false
      }
      return true
    })
  }, [employees, search, positionFilter, outletFilter, statusFilter, dates, assignmentMap])

  /** Employees grouped by outlet, mirroring the MALL / NIGHT MARKET sections. */
  const groups = useMemo(() => {
    const map = new Map<string, Employee[]>()
    for (const e of visibleEmployees) {
      const key = e.outlet_id ?? 'none'
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    return [...map.entries()]
      .map(([key, list]) => ({
        key,
        label: key === 'none' ? 'Unassigned outlet' : (outletById.get(key)?.name ?? 'Outlet'),
        sort: key === 'none' ? 999 : (outletById.get(key)?.sort_order ?? 0),
        employees: list,
      }))
      .sort((a, b) => a.sort - b.sort)
  }, [visibleEmployees, outletById])

  const validationInput = useMemo(
    () => ({
      weekStart,
      assignments: assignments.map((a) => ({
        id: a.id,
        employeeId: a.employee_id,
        workDate: a.work_date,
        status: a.status,
        startTime: a.start_time,
        endTime: a.end_time,
        breakMinutes: a.break_minutes,
        crossesMidnight: a.crosses_midnight,
        isSplit: a.is_split,
        segment2Start: a.segment2_start,
        segment2End: a.segment2_end,
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
      approvedLeave,
      staffingRules: staffingRules.map((r) => ({
        outletId: r.outlet_id,
        positionId: r.position_id,
        departmentId: r.department_id,
        dayOfWeek: r.day_of_week,
        minStaff: r.min_staff,
        label: r.label,
      })),
      ...thresholds,
    }),
    [weekStart, assignments, employees, approvedLeave, staffingRules, thresholds],
  )

  const findings = useMemo(() => validateRoster(validationInput), [validationInput])
  const coverageCells = useMemo(() => coverage(validationInput), [validationInput])
  const totals = useMemo(() => dailyTotals(validationInput.assignments, weekStart), [validationInput, weekStart])

  const blocking = findings.filter((f) => f.severity === 'error')
  const warnings = findings.filter((f) => f.severity === 'warning')

  const run = (fn: () => Promise<ActionResult>) => {
    setFeedback(null)
    startTransition(async () => {
      const result = await fn()
      setFeedback(result)
      if (result.ok) router.refresh()
    })
  }

  const goToWeek = (target: string) => router.push(`/roster?week=${target}`)

  const toggleEmployee = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allSelected = visibleEmployees.length > 0 && visibleEmployees.every((e) => selected.has(e.id))

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------------------------------------------- */}
      {/* Week navigation and roster lifecycle                              */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-sand-200 bg-white p-1">
          <Button variant="ghost" size="icon" onClick={() => goToWeek(addWeeksISO(weekStart, -1))} aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-40 px-2 text-center text-sm font-semibold text-ink-900">
            {formatWeekLabel(weekStart)}
          </span>
          <Button variant="ghost" size="icon" onClick={() => goToWeek(addWeeksISO(weekStart, 1))} aria-label="Next week">
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={() => goToWeek(new Date().toISOString().slice(0, 10))}>
          This week
        </Button>

        {period ? <RosterStatusBadge status={period.status} /> : <Badge variant="muted">Not started</Badge>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!period && permissions.canCreate ? (
            <Button onClick={() => run(() => ensurePeriod(weekStart, null))} disabled={pending}>
              Start this week&apos;s roster
            </Button>
          ) : null}

          {period && editable ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => run(() => copyPreviousWeek(period.id, weekStart, null, false))}
              disabled={pending}
            >
              <Copy className="size-4" />
              Copy previous week
            </Button>
          ) : null}

          {period && permissions.canPublish && period.status === 'DRAFT' ? (
            <Button
              size="sm"
              onClick={() => {
                if (warnings.length + blocking.length > 0) setShowOverride(true)
                else run(() => changeRosterStatus(period.id, 'PUBLISH'))
              }}
              disabled={pending}
            >
              <Send className="size-4" />
              Publish
            </Button>
          ) : null}

          {period && permissions.canPublish && period.status === 'PUBLISHED' ? (
            <>
              <Button variant="outline" size="sm" onClick={() => run(() => changeRosterStatus(period.id, 'UNPUBLISH'))} disabled={pending}>
                <Undo2 className="size-4" />
                Withdraw
              </Button>
              <Button variant="secondary" size="sm" onClick={() => run(() => changeRosterStatus(period.id, 'LOCK'))} disabled={pending}>
                <Lock className="size-4" />
                Lock
              </Button>
            </>
          ) : null}

          {period && permissions.canUnlock && period.status === 'LOCKED' ? (
            <UnlockButton periodId={period.id} onDone={run} pending={pending} />
          ) : null}

          {period && permissions.canDelete && period.status === 'DRAFT' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('Delete this draft roster and all of its assignments?')) {
                  run(() => deleteDraftPeriod(period.id))
                }
              }}
              disabled={pending}
            >
              <Trash2 className="size-4" />
              Delete draft
            </Button>
          ) : null}
        </div>
      </div>

      {feedback?.error ? <Alert tone="danger">{feedback.error}</Alert> : null}
      {feedback?.ok && feedback.message ? <Alert tone="success">{feedback.message}</Alert> : null}

      {period?.status === 'PUBLISHED' ? (
        <Alert tone="info">
          This roster is published and visible to staff. Any change from now on is recorded in the
          audit trail.
        </Alert>
      ) : null}
      {period?.status === 'LOCKED' ? (
        <Alert tone="warning" title="This roster is locked">
          Locked rosters are protected history. An administrator must unlock it, with a reason,
          before it can be changed.
        </Alert>
      ) : null}
      {!period ? (
        <Alert tone="info">
          No roster exists for this week yet.
          {permissions.canCreate
            ? ' Start it, then copy the previous week to get going quickly.'
            : ' A manager needs to start it.'}
        </Alert>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Filters                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search employee…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search employees"
        />
        <Select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} aria-label="Filter by position">
          <option value="">All positions</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Select value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)} aria-label="Filter by outlet">
          <option value="">All outlets</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">Any status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{ASSIGNMENT_LABELS[s]}</option>
          ))}
        </Select>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Bulk assignment bar                                               */}
      {/* ---------------------------------------------------------------- */}
      {editable && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-spice-200 bg-spice-50 p-2.5">
          <Users className="size-4 text-spice-700" />
          <span className="text-sm font-medium text-spice-700">
            {selected.size} employee{selected.size === 1 ? '' : 's'} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setDraft({ employeeIds: [...selected], dates: [], existing: null })}
            >
              Assign shift or status
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* The grid                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="roster-scroll rounded-[var(--radius-card)] border border-sand-200 bg-white">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="roster-sticky-col w-64 border-b border-sand-200 bg-sand-50 px-3 py-2 text-left">
                <div className="flex items-center gap-2">
                  {editable ? (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        setSelected(allSelected ? new Set() : new Set(visibleEmployees.map((e) => e.id)))
                      }
                      aria-label="Select all employees"
                      className="size-4 rounded border-sand-300"
                    />
                  ) : null}
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Employee
                  </span>
                </div>
              </th>
              {dates.map((date, index) => (
                <th key={date} className="border-b border-sand-200 bg-sand-50 px-2 py-2 text-center">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-ink-500">
                    {DAY_SHORT[(index + 1) % 7]}
                  </span>
                  <span className="block text-xs text-ink-500">{date.slice(8)}/{date.slice(5, 7)}</span>
                </th>
              ))}
              <th className="border-b border-sand-200 bg-sand-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-500">
                Hours
              </th>
            </tr>
          </thead>

          {groups.map((group) => (
            <tbody key={group.key}>
              {groups.length > 1 ? (
                <tr>
                  <td
                    colSpan={dates.length + 2}
                    className="roster-sticky-col border-b border-sand-200 bg-sand-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-700"
                  >
                    {group.label}
                  </td>
                </tr>
              ) : null}

              {group.employees.map((employee) => {
                const rowAssignments = dates.map((d) => assignmentMap.get(`${employee.id}|${d}`) ?? null)
                const rowHours = rowAssignments.reduce(
                  (sum, a) => sum + (a ? Number(a.scheduled_hours ?? 0) : 0),
                  0,
                )

                return (
                  <tr key={employee.id} className="hover:bg-sand-50/60">
                    <td className="roster-sticky-col border-b border-sand-100 px-3 py-2">
                      <div className="flex items-center gap-2">
                        {editable ? (
                          <input
                            type="checkbox"
                            checked={selected.has(employee.id)}
                            onChange={() => toggleEmployee(employee.id)}
                            aria-label={`Select ${employee.full_name}`}
                            className="size-4 shrink-0 rounded border-sand-300"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900">{employee.full_name}</p>
                          <p className="truncate text-xs text-ink-500">
                            {positionById.get(employee.position_id ?? '')?.name ?? 'No position'}
                            {employee.is_active ? '' : ' · inactive'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {dates.map((date, index) => {
                      const assignment = rowAssignments[index] ?? null
                      const onLeave = approvedLeave.some(
                        (l) => l.employeeId === employee.id && l.date === date,
                      )
                      return (
                        <td key={date} className="border-b border-sand-100 p-1 text-center align-middle">
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() =>
                              setDraft({ employeeIds: [employee.id], dates: [date], existing: assignment })
                            }
                            className={cn(
                              'w-full rounded-md border px-1.5 py-1.5 text-xs leading-tight transition-colors',
                              assignment
                                ? ASSIGNMENT_STYLES[assignment.status]
                                : 'border-dashed border-sand-300 bg-sand-50/50 text-ink-500',
                              editable && 'hover:border-spice-400 hover:shadow-sm',
                              !editable && 'cursor-default',
                              onLeave && assignment?.status === 'WORK' && 'ring-2 ring-red-400',
                            )}
                            aria-label={`${employee.full_name} on ${date}`}
                          >
                            {assignment ? (
                              <>
                                <span className="block font-medium tabular-nums">
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
                                {assignment.outlet_id && assignment.outlet_id !== employee.outlet_id ? (
                                  <span className="block text-[10px] uppercase">
                                    {outletById.get(assignment.outlet_id)?.short_name ?? 'Other outlet'}
                                  </span>
                                ) : null}
                                {assignment.position_id && assignment.position_id !== employee.position_id ? (
                                  <span className="block text-[10px]">
                                    {positionById.get(assignment.position_id)?.short_name ?? 'Cover'}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span aria-hidden>+</span>
                            )}
                          </button>
                        </td>
                      )
                    })}

                    <td className="border-b border-sand-100 px-3 py-2 text-right font-medium tabular-nums text-ink-700">
                      {formatHours(rowHours)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          ))}

          <tfoot>
            <tr className="bg-sand-50">
              <td className="roster-sticky-col border-t border-sand-200 bg-sand-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                Working / OFF / Leave
              </td>
              {totals.map((t) => (
                <td key={t.date} className="border-t border-sand-200 px-2 py-2 text-center text-xs">
                  <span className="font-semibold text-ink-900">{t.working}</span>
                  <span className="text-ink-500"> / {t.off} / {t.leave}</span>
                  <span className="block text-[11px] tabular-nums text-ink-500">{formatHours(t.hours)}</span>
                </td>
              ))}
              <td className="border-t border-sand-200 px-3 py-2 text-right text-xs font-semibold tabular-nums text-ink-900">
                {formatHours(totals.reduce((sum, t) => sum + t.hours, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {visibleEmployees.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sand-300 p-6 text-center text-sm text-ink-500">
          No employees match these filters.
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Coverage and validation                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Staffing coverage</CardTitle>
          </CardHeader>
          <CardContent>
            {coverageCells.length === 0 ? (
              <p className="text-sm text-ink-500">
                No staffing rules are configured. An administrator can add them under
                Administration → Staffing Rules.
              </p>
            ) : (
              <div className="roster-scroll">
                <table className="w-full min-w-[420px] text-sm">
                  <tbody>
                    {[...new Set(coverageCells.map((c) => c.ruleLabel))].map((label) => (
                      <tr key={label} className="border-b border-sand-100 last:border-0">
                        <td className="py-2 pr-2 text-ink-700">{label}</td>
                        {dates.map((date) => {
                          const cell = coverageCells.find((c) => c.ruleLabel === label && c.date === date)
                          if (!cell) return <td key={date} className="px-1 py-2 text-center text-ink-500">—</td>
                          return (
                            <td key={date} className="px-1 py-2 text-center">
                              <span
                                className={cn(
                                  'inline-flex min-w-8 justify-center rounded px-1.5 py-0.5 text-xs font-medium',
                                  cell.ok ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700',
                                )}
                                title={`${cell.actual} of ${cell.required} required`}
                              >
                                {cell.actual}/{cell.required}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Checks</CardTitle>
            {findings.length === 0 ? (
              <Badge variant="success">
                <Check className="size-3" /> All clear
              </Badge>
            ) : (
              <Badge variant={blocking.length ? 'danger' : 'warning'}>
                <TriangleAlert className="size-3" />
                {findings.length}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {findings.length === 0 ? (
              <p className="text-sm text-ink-500">
                No conflicts, no staffing gaps, and everyone has an OFF day.
              </p>
            ) : (
              <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto text-sm">
                {findings.map((finding, index) => (
                  <li key={`${finding.code}-${index}`} className="flex gap-2">
                    <span
                      className={cn(
                        'mt-1.5 size-1.5 shrink-0 rounded-full',
                        finding.severity === 'error'
                          ? 'bg-red-500'
                          : finding.severity === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-sky-400',
                      )}
                      aria-hidden
                    />
                    <span className="text-ink-700">{finding.message}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-500">
              Warnings never block publishing. If you publish with warnings outstanding, the reason
              you give is recorded in the audit trail.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Dialogs                                                           */}
      {/* ---------------------------------------------------------------- */}
      {draft && period ? (
        <AssignmentDialog
          draft={draft}
          dates={dates}
          period={period}
          employees={employees}
          positions={positions}
          outlets={outlets}
          shiftTemplates={shiftTemplates}
          leaveTypes={leaveTypes}
          pending={pending}
          onClose={() => setDraft(null)}
          onSave={(input) =>
            run(async () => {
              const result = await saveAssignments(input)
              if (result.ok) {
                setDraft(null)
                setSelected(new Set())
              }
              return result
            })
          }
          onClear={(employeeIds, clearDates) =>
            run(async () => {
              const result = await clearAssignments(period.id, employeeIds, clearDates)
              if (result.ok) setDraft(null)
              return result
            })
          }
        />
      ) : null}

      {showOverride && period ? (
        <OverrideDialog
          findings={findings}
          pending={pending}
          onClose={() => setShowOverride(false)}
          onConfirm={(reason) =>
            run(async () => {
              const logged = await recordOverride(
                period.id,
                findings.map((f) => f.message),
                reason,
              )
              if (!logged.ok) return logged
              const published = await changeRosterStatus(period.id, 'PUBLISH', reason)
              if (published.ok) setShowOverride(false)
              return published
            })
          }
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function UnlockButton({
  periodId,
  onDone,
  pending,
}: {
  periodId: string
  onDone: (fn: () => Promise<ActionResult>) => void
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={pending}>
        <LockOpen className="size-4" />
        Unlock
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <DialogContent
            title="Unlock this roster"
            description="Unlocking protected history is recorded in the audit trail with your reason."
          >
            <Field label="Reason" htmlFor="unlock-reason" required>
              <Textarea
                id="unlock-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Correcting Saturday cover after a swap was approved late"
              />
            </Field>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                disabled={!reason.trim() || pending}
                onClick={() => {
                  onDone(() => changeRosterStatus(periodId, 'UNLOCK', reason))
                  setOpen(false)
                }}
              >
                Unlock roster
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}

function OverrideDialog({
  findings,
  pending,
  onClose,
  onConfirm,
}: {
  findings: Finding[]
  pending: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Publish with outstanding warnings?"
        description="You can publish anyway. The warnings and your reason are recorded in the audit trail."
      >
        <ul className="mb-4 flex max-h-48 flex-col gap-1 overflow-y-auto text-sm text-ink-700">
          {findings.map((f, i) => (
            <li key={i}>• {f.message}</li>
          ))}
        </ul>
        <Field label="Reason for publishing anyway" htmlFor="override-reason" required>
          <Textarea id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Go back and fix</Button>
          <Button disabled={!reason.trim() || pending} onClick={() => onConfirm(reason)}>
            Publish anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------------ */

function AssignmentDialog({
  draft,
  dates,
  period,
  employees,
  positions,
  outlets,
  shiftTemplates,
  leaveTypes,
  pending,
  onClose,
  onSave,
  onClear,
}: {
  draft: CellDraft
  dates: string[]
  period: RosterPeriod
  employees: Employee[]
  positions: Position[]
  outlets: Outlet[]
  shiftTemplates: ShiftTemplate[]
  leaveTypes: LeaveType[]
  pending: boolean
  onClose: () => void
  onSave: (input: Parameters<typeof saveAssignments>[0]) => void
  onClear: (employeeIds: string[], dates: string[]) => void
}) {
  const existing = draft.existing
  const bulk = draft.employeeIds.length > 1 || draft.dates.length === 0

  const [selectedDates, setSelectedDates] = useState<string[]>(draft.dates)
  const [status, setStatus] = useState<AssignmentStatus>(existing?.status ?? 'WORK')
  const [templateId, setTemplateId] = useState<string>(existing?.shift_template_id ?? '')
  const [startTime, setStartTime] = useState(existing?.start_time?.slice(0, 5) ?? '13:00')
  const [endTime, setEndTime] = useState(existing?.end_time?.slice(0, 5) ?? '23:00')
  const [crosses, setCrosses] = useState(existing?.crosses_midnight ?? false)
  const [isSplit, setIsSplit] = useState(existing?.is_split ?? false)
  const [seg2Start, setSeg2Start] = useState(existing?.segment2_start?.slice(0, 5) ?? '19:00')
  const [seg2End, setSeg2End] = useState(existing?.segment2_end?.slice(0, 5) ?? '00:00')
  const [breakMinutes, setBreakMinutes] = useState(existing?.break_minutes ?? 0)
  const [outletId, setOutletId] = useState(existing?.outlet_id ?? '')
  const [positionId, setPositionId] = useState(existing?.position_id ?? '')
  const [leaveTypeId, setLeaveTypeId] = useState(existing?.leave_type_id ?? '')
  const [note, setNote] = useState(existing?.note ?? '')

  const applyTemplate = (id: string) => {
    setTemplateId(id)
    const template = shiftTemplates.find((t) => t.id === id)
    if (!template) return
    setStatus(template.kind)
    if (template.kind === 'WORK') {
      setStartTime(template.start_time?.slice(0, 5) ?? '')
      setEndTime(template.end_time?.slice(0, 5) ?? '')
      setCrosses(template.crosses_midnight)
      setIsSplit(template.is_split)
      setSeg2Start(template.segment2_start?.slice(0, 5) ?? '19:00')
      setSeg2End(template.segment2_end?.slice(0, 5) ?? '00:00')
      setBreakMinutes(template.break_minutes)
    }
  }

  const previewHours = computeScheduledHours({
    status,
    startTime,
    endTime,
    breakMinutes,
    crossesMidnight: crosses,
    isSplit,
    segment2Start: seg2Start,
    segment2End: seg2End,
  })

  const employeeNames = draft.employeeIds
    .map((id) => employees.find((e) => e.id === id)?.full_name)
    .filter(Boolean)

  const title = bulk
    ? `Assign ${draft.employeeIds.length} employee${draft.employeeIds.length === 1 ? '' : 's'}`
    : `${employeeNames[0] ?? 'Employee'} — ${draft.dates[0]}`

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={title}
        description={bulk ? employeeNames.slice(0, 4).join(', ') + (employeeNames.length > 4 ? ` +${employeeNames.length - 4} more` : '') : undefined}
      >
        <div className="flex flex-col gap-4">
          {bulk ? (
            <div>
              <Label>Days</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {dates.map((date, index) => {
                  const active = selectedDates.includes(date)
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() =>
                        setSelectedDates((prev) =>
                          prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date],
                        )
                      }
                      className={cn(
                        'rounded-md border px-2.5 py-1.5 text-xs font-medium',
                        active
                          ? 'border-spice-400 bg-spice-100 text-spice-700'
                          : 'border-sand-300 bg-white text-ink-700 hover:bg-sand-50',
                      )}
                    >
                      {DAY_SHORT[(index + 1) % 7]} {date.slice(8)}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-spice-600 hover:underline"
                onClick={() => setSelectedDates(selectedDates.length === 7 ? [] : [...dates])}
              >
                {selectedDates.length === 7 ? 'Clear all days' : 'Select the whole week'}
              </button>
            </div>
          ) : null}

          <Field label="Status" htmlFor="status">
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value as AssignmentStatus)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{ASSIGNMENT_LABELS[s]}</option>
              ))}
            </Select>
          </Field>

          {status === 'WORK' ? (
            <>
              <Field label="Shift template" htmlFor="template" hint="Or set the times by hand below.">
                <Select id="template" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">Custom times</option>
                  {shiftTemplates
                    .filter((t) => t.kind === 'WORK')
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={isSplit ? 'Segment 1 start' : 'Start'} htmlFor="start">
                  <Input id="start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </Field>
                <Field label={isSplit ? 'Segment 1 end' : 'End'} htmlFor="end">
                  <Input id="end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={isSplit}
                  onChange={(e) => setIsSplit(e.target.checked)}
                  className="size-4 rounded border-sand-300"
                />
                Split shift (two segments in one day)
              </label>

              {isSplit ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Segment 2 start" htmlFor="seg2start">
                    <Input id="seg2start" type="time" value={seg2Start} onChange={(e) => setSeg2Start(e.target.value)} />
                  </Field>
                  <Field label="Segment 2 end" htmlFor="seg2end">
                    <Input id="seg2end" type="time" value={seg2End} onChange={(e) => setSeg2End(e.target.value)} />
                  </Field>
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={crosses}
                  onChange={(e) => setCrosses(e.target.checked)}
                  className="size-4 rounded border-sand-300"
                />
                Finishes the next day (midnight, 24:00, or later)
              </label>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Unpaid break (minutes)" htmlFor="break">
                  <Input
                    id="break"
                    type="number"
                    min={0}
                    max={720}
                    value={breakMinutes}
                    onChange={(e) => setBreakMinutes(Number(e.target.value) || 0)}
                  />
                </Field>
                <div className="flex flex-col justify-end pb-1">
                  <p className="text-xs text-ink-500">Scheduled hours</p>
                  <p className="text-lg font-semibold tabular-nums text-ink-900">{previewHours} h</p>
                </div>
              </div>
            </>
          ) : null}

          {status === 'LEAVE' ? (
            <Field label="Leave type" htmlFor="leaveType">
              <Select id="leaveType" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
                <option value="">Not specified</option>
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Outlet for this day" htmlFor="outlet" hint="Only if different from usual.">
              <Select id="outlet" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                <option value="">Usual outlet</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Position for this day" htmlFor="position" hint="Only if covering another role.">
              <Select id="position" value={positionId} onChange={(e) => setPositionId(e.target.value)}>
                <option value="">Usual position</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Note" htmlFor="note">
            <Input id="note" value={note ?? ''} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>

          {existing?.source_value ? (
            <p className="rounded-md bg-sand-100 px-3 py-2 text-xs text-ink-500">
              Imported from the spreadsheet as
              <span className="font-mono"> “{existing.source_value}”</span>
            </p>
          ) : null}
        </div>

        <DialogFooter>
          {existing ? (
            <Button
              variant="ghost"
              className="mr-auto text-red-600"
              disabled={pending}
              onClick={() => onClear(draft.employeeIds, draft.dates)}
            >
              <Eraser className="size-4" />
              Clear
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || (bulk && selectedDates.length === 0)}
            onClick={() =>
              onSave({
                periodId: period.id,
                employeeIds: draft.employeeIds,
                dates: bulk ? selectedDates : draft.dates,
                status,
                shiftTemplateId: templateId || null,
                startTime: status === 'WORK' ? startTime : null,
                endTime: status === 'WORK' ? endTime : null,
                breakMinutes,
                crossesMidnight: crosses,
                isSplit,
                segment2Start: isSplit ? seg2Start : null,
                segment2End: isSplit ? seg2End : null,
                outletId: outletId || null,
                positionId: positionId || null,
                leaveTypeId: leaveTypeId || null,
                note: note || null,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
