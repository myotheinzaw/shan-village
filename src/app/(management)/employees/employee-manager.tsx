'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { Pencil, Plus, UserCheck, UserX } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Table, TableWrap, Td, Th, EmptyState } from '@/components/ui/table'
import { DAY_NAMES } from '@/lib/roster/dates'
import type { Department, Employee, EmploymentStatus, Outlet, Position, ShiftTemplate } from '@/types/db'
import { saveEmployee, setEmployeeActive } from './actions'
import type { ActionResult } from '@/lib/actions/result'

const EMPLOYMENT_LABELS: Record<EmploymentStatus, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CASUAL: 'Casual',
  TRIAL: 'Trial',
  CONTRACT: 'Contract',
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save employee'}
    </Button>
  )
}

export function EmployeeManager({
  employees,
  positions,
  departments,
  outlets,
  shiftTemplates,
  canCreate,
  canEdit,
  canDeactivate,
}: {
  employees: Employee[]
  positions: Position[]
  departments: Department[]
  outlets: Outlet[]
  shiftTemplates: ShiftTemplate[]
  canCreate: boolean
  canEdit: boolean
  canDeactivate: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<Employee | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<ActionResult | null>(null)

  const positionById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions])
  const outletById = useMemo(() => new Map(outlets.map((o) => [o.id, o])), [outlets])

  const visible = employees.filter((e) => {
    if (!showInactive && !e.is_active) return false
    if (positionFilter && e.position_id !== positionFilter) return false
    const term = search.trim().toLowerCase()
    if (term && !`${e.full_name} ${e.employee_code} ${e.preferred_name ?? ''}`.toLowerCase().includes(term))
      return false
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      {feedback?.error ? <Alert tone="danger">{feedback.error}</Alert> : null}
      {feedback?.ok && feedback.message ? <Alert tone="success">{feedback.message}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-56"
          placeholder="Search name or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search employees"
        />
        <Select
          className="max-w-48"
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          aria-label="Filter by position"
        >
          <option value="">All positions</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="size-4 rounded border-sand-300"
          />
          Show inactive
        </label>
        {canCreate ? (
          <Button className="ml-auto" onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            Add employee
          </Button>
        ) : null}
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Employee</Th>
              <Th>ID</Th>
              <Th>Position</Th>
              <Th>Outlet</Th>
              <Th>Employment</Th>
              <Th>Weekly OFF</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((employee) => (
              <tr key={employee.id} className="hover:bg-sand-50">
                <Td>
                  <p className="font-medium text-ink-900">{employee.full_name}</p>
                  {employee.preferred_name ? (
                    <p className="text-xs text-ink-500">“{employee.preferred_name}”</p>
                  ) : null}
                </Td>
                <Td className="font-mono text-xs text-ink-500">{employee.employee_code}</Td>
                <Td>{positionById.get(employee.position_id ?? '')?.name ?? '—'}</Td>
                <Td>{outletById.get(employee.outlet_id ?? '')?.name ?? '—'}</Td>
                <Td>{EMPLOYMENT_LABELS[employee.employment_status]}</Td>
                <Td>
                  {employee.preferred_off_day === null || employee.preferred_off_day === undefined
                    ? '—'
                    : DAY_NAMES[employee.preferred_off_day]}
                </Td>
                <Td>
                  {employee.is_active ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="muted">Inactive</Badge>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    {canEdit ? (
                      <Button variant="ghost" size="sm" onClick={() => setEditing(employee)}>
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                    ) : null}
                    {canDeactivate ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await setEmployeeActive(employee.id, !employee.is_active)
                            setFeedback(result)
                            if (result.ok) router.refresh()
                          })
                        }
                      >
                        {employee.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                        {employee.is_active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {visible.length === 0 ? (
          <EmptyState
            title="No employees match"
            description="Adjust the search or filters, or add a new employee."
          />
        ) : null}
      </TableWrap>

      {editing ? (
        <EmployeeDialog
          employee={editing === 'new' ? null : editing}
          positions={positions}
          departments={departments}
          outlets={outlets}
          shiftTemplates={shiftTemplates}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function EmployeeDialog({
  employee,
  positions,
  departments,
  outlets,
  shiftTemplates,
  onClose,
  onSaved,
}: {
  employee: Employee | null
  positions: Position[]
  departments: Department[]
  outlets: Outlet[]
  shiftTemplates: ShiftTemplate[]
  onClose: () => void
  onSaved: () => void
}) {
  const [state, action] = useActionState<ActionResult, FormData>(saveEmployee, { ok: false })

  useEffect(() => {
    if (state.ok) onSaved()
  }, [state, onSaved])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={employee ? `Edit ${employee.full_name}` : 'Add employee'}
        description="Employee details are shared by every module, now and in future."
        className="max-w-2xl"
      >
        <form action={action} className="flex flex-col gap-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {employee ? <input type="hidden" name="id" value={employee.id} /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Employee ID" htmlFor="employee_code" required>
              <Input
                id="employee_code"
                name="employee_code"
                defaultValue={employee?.employee_code ?? ''}
                required
                maxLength={30}
              />
            </Field>
            <Field label="Full name" htmlFor="full_name" required>
              <Input id="full_name" name="full_name" defaultValue={employee?.full_name ?? ''} required />
            </Field>
            <Field label="Preferred name" htmlFor="preferred_name" hint="Shown on the roster if set.">
              <Input id="preferred_name" name="preferred_name" defaultValue={employee?.preferred_name ?? ''} />
            </Field>
            <Field label="Position" htmlFor="position_id">
              <Select id="position_id" name="position_id" defaultValue={employee?.position_id ?? ''}>
                <option value="">Not set</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Department" htmlFor="department_id">
              <Select id="department_id" name="department_id" defaultValue={employee?.department_id ?? ''}>
                <option value="">Not set</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Outlet" htmlFor="outlet_id">
              <Select id="outlet_id" name="outlet_id" defaultValue={employee?.outlet_id ?? ''}>
                <option value="">Not set</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Employment status" htmlFor="employment_status">
              <Select
                id="employment_status"
                name="employment_status"
                defaultValue={employee?.employment_status ?? 'FULL_TIME'}
              >
                {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Join date" htmlFor="join_date">
              <Input id="join_date" name="join_date" type="date" defaultValue={employee?.join_date ?? ''} />
            </Field>
            <Field label="Mobile" htmlFor="mobile">
              <Input id="mobile" name="mobile" type="tel" defaultValue={employee?.mobile ?? ''} />
            </Field>
            <Field label="Email" htmlFor="email" hint="Used to create their login later.">
              <Input id="email" name="email" type="email" defaultValue={employee?.email ?? ''} />
            </Field>
            <Field label="Default shift" htmlFor="default_shift_id">
              <Select id="default_shift_id" name="default_shift_id" defaultValue={employee?.default_shift_id ?? ''}>
                <option value="">Not set</option>
                {shiftTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Preferred OFF day" htmlFor="preferred_off_day">
              <Select id="preferred_off_day" name="preferred_off_day" defaultValue={employee?.preferred_off_day ?? ''}>
                <option value="">No preference</option>
                {DAY_NAMES.map((day, index) => (
                  <option key={day} value={index}>{day}</option>
                ))}
              </Select>
            </Field>
            <Field label="Weekly hours target" htmlFor="weekly_hours_target">
              <Input
                id="weekly_hours_target"
                name="weekly_hours_target"
                type="number"
                min={0}
                max={168}
                step="0.5"
                defaultValue={employee?.weekly_hours_target ?? ''}
              />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" defaultValue={employee?.notes ?? ''} />
          </Field>

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={employee ? employee.is_active : true}
              className="size-4 rounded border-sand-300"
            />
            Active — appears on new rosters
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <SaveButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
