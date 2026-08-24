'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { Pencil, Plus } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { EmptyState, Table, TableWrap, Td, Th } from '@/components/ui/table'
import { ASSIGNMENT_LABELS } from '@/components/ui/status'
import { computeScheduledHours, formatShift } from '@/lib/roster/shift'
import type { AssignmentStatus, ShiftTemplate } from '@/types/db'
import { saveShiftTemplate } from './actions'
import type { ActionResult } from '@/lib/actions/result'

const KINDS: AssignmentStatus[] = ['WORK', 'OFF', 'PH', 'LEAVE', 'TRIAL', 'OTHER']

function SaveButton() {
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save shift'}</Button>
}

export function ShiftManager({
  templates,
  canManage,
}: {
  templates: ShiftTemplate[]
  canManage: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<ShiftTemplate | 'new' | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            Add shift template
          </Button>
        </div>
      ) : null}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Shift</Th>
              <Th>Type</Th>
              <Th>Times</Th>
              <Th className="text-right">Break</Th>
              <Th className="text-right">Hours</Th>
              <Th>Notes</Th>
              <Th>Status</Th>
              {canManage ? <Th className="text-right">Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id} className="hover:bg-sand-50">
                <Td>
                  <span className="flex items-center gap-2">
                    <span
                      className="size-3 shrink-0 rounded-full border border-sand-300"
                      style={{ background: template.colour ?? '#e2e8f0' }}
                    />
                    <span className="font-medium text-ink-900">{template.name}</span>
                  </span>
                  <span className="font-mono text-xs text-ink-500">{template.code}</span>
                </Td>
                <Td>{ASSIGNMENT_LABELS[template.kind]}</Td>
                <Td className="font-mono text-xs tabular-nums">
                  {formatShift({
                    status: template.kind,
                    startTime: template.start_time,
                    endTime: template.end_time,
                    crossesMidnight: template.crosses_midnight,
                    isSplit: template.is_split,
                    segment2Start: template.segment2_start,
                    segment2End: template.segment2_end,
                  })}
                  {template.is_split ? <Badge variant="info" className="ml-2">Split</Badge> : null}
                  {template.crosses_midnight ? <Badge variant="warning" className="ml-2">Overnight</Badge> : null}
                </Td>
                <Td className="text-right tabular-nums">{template.break_minutes || '—'}</Td>
                <Td className="text-right tabular-nums">
                  {computeScheduledHours({
                    status: template.kind,
                    startTime: template.start_time,
                    endTime: template.end_time,
                    breakMinutes: template.break_minutes,
                    crossesMidnight: template.crosses_midnight,
                    isSplit: template.is_split,
                    segment2Start: template.segment2_start,
                    segment2End: template.segment2_end,
                  })}
                </Td>
                <Td className="max-w-56 truncate text-xs text-ink-500">{template.notes ?? '—'}</Td>
                <Td>
                  {template.is_active ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="muted">Inactive</Badge>
                  )}
                </Td>
                {canManage ? (
                  <Td className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(template)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
        {templates.length === 0 ? <EmptyState title="No shift templates yet" /> : null}
      </TableWrap>

      {editing ? (
        <ShiftDialog
          template={editing === 'new' ? null : editing}
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

function ShiftDialog({
  template,
  onClose,
  onSaved,
}: {
  template: ShiftTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const [state, action] = useActionState<ActionResult, FormData>(saveShiftTemplate, { ok: false })
  const [kind, setKind] = useState<AssignmentStatus>(template?.kind ?? 'WORK')
  const [isSplit, setIsSplit] = useState(template?.is_split ?? false)

  useEffect(() => {
    if (state.ok) onSaved()
  }, [state, onSaved])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={template ? `Edit ${template.name}` : 'Add shift template'}
        description="Templates are a starting point — any roster cell can still be set by hand."
        className="max-w-xl"
      >
        <form action={action} className="flex flex-col gap-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {template ? <input type="hidden" name="id" value={template.id} /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shift name" htmlFor="name" required>
              <Input id="name" name="name" defaultValue={template?.name ?? ''} required />
            </Field>
            <Field label="Code" htmlFor="code" required>
              <Input id="code" name="code" defaultValue={template?.code ?? ''} required />
            </Field>
            <Field label="Type" htmlFor="kind">
              <Select
                id="kind"
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as AssignmentStatus)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>{ASSIGNMENT_LABELS[k]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Colour" htmlFor="colour">
              <Input id="colour" name="colour" type="color" defaultValue={template?.colour ?? '#0ea5e9'} />
            </Field>
          </div>

          {kind === 'WORK' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={isSplit ? 'Segment 1 start' : 'Start time'} htmlFor="start_time" required>
                  <Input
                    id="start_time"
                    name="start_time"
                    type="time"
                    defaultValue={template?.start_time?.slice(0, 5) ?? '13:00'}
                  />
                </Field>
                <Field label={isSplit ? 'Segment 1 end' : 'End time'} htmlFor="end_time" required>
                  <Input
                    id="end_time"
                    name="end_time"
                    type="time"
                    defaultValue={template?.end_time?.slice(0, 5) ?? '23:00'}
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  name="is_split"
                  checked={isSplit}
                  onChange={(e) => setIsSplit(e.target.checked)}
                  className="size-4 rounded border-sand-300"
                />
                Split shift — two separate segments in one day
              </label>

              {isSplit ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Segment 2 start" htmlFor="segment2_start" required>
                    <Input
                      id="segment2_start"
                      name="segment2_start"
                      type="time"
                      defaultValue={template?.segment2_start?.slice(0, 5) ?? '19:00'}
                    />
                  </Field>
                  <Field label="Segment 2 end" htmlFor="segment2_end" required>
                    <Input
                      id="segment2_end"
                      name="segment2_end"
                      type="time"
                      defaultValue={template?.segment2_end?.slice(0, 5) ?? '00:00'}
                    />
                  </Field>
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  name="crosses_midnight"
                  defaultChecked={template?.crosses_midnight ?? false}
                  className="size-4 rounded border-sand-300"
                />
                Finishes the next day — write 24:00 or 00:30 as the end time and tick this
              </label>

              <Field
                label="Unpaid break (minutes)"
                htmlFor="break_minutes"
                hint="The spreadsheet does not record breaks, so seeded templates use 0. Set the real value before using the hours report for pay."
              >
                <Input
                  id="break_minutes"
                  name="break_minutes"
                  type="number"
                  min={0}
                  max={720}
                  defaultValue={template?.break_minutes ?? 0}
                />
              </Field>
            </>
          ) : (
            <Alert tone="info">
              {ASSIGNMENT_LABELS[kind]} templates carry no times and count as zero scheduled hours.
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sort order" htmlFor="sort_order">
              <Input id="sort_order" name="sort_order" type="number" defaultValue={template?.sort_order ?? 50} />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" defaultValue={template?.notes ?? ''} />
          </Field>

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={template ? template.is_active : true}
              className="size-4 rounded border-sand-300"
            />
            Active — offered when assigning shifts
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
