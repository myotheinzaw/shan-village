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
import type { ActionResult } from '@/lib/actions/result'

/**
 * A small declarative CRUD screen for the simple master tables (positions,
 * outlets, departments, leave types). Everything it needs is serialisable, so
 * a server page can configure it without shipping functions to the client.
 */

export interface MasterFieldConfig {
  name: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'color' | 'date' | 'datetime'
  required?: boolean
  hint?: string
  options?: { value: string; label: string }[]
  full?: boolean
  defaultValue?: string | number | boolean | null
}

export interface MasterColumnConfig {
  key: string
  label: string
  type?: 'text' | 'boolean' | 'colour' | 'mono'
  align?: 'left' | 'right'
}

export type MasterRow = Record<string, unknown> & { id: string }

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  )
}

export function SimpleMaster({
  rows,
  columns,
  fields,
  action,
  entityLabel,
  canManage,
  emptyDescription,
}: {
  rows: MasterRow[]
  columns: MasterColumnConfig[]
  fields: MasterFieldConfig[]
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>
  entityLabel: string
  canManage: boolean
  emptyDescription?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<MasterRow | 'new' | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            Add {entityLabel.toLowerCase()}
          </Button>
        </div>
      ) : null}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              {columns.map((column) => (
                <Th key={column.key} className={column.align === 'right' ? 'text-right' : undefined}>
                  {column.label}
                </Th>
              ))}
              {canManage ? <Th className="text-right">Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-sand-50">
                {columns.map((column) => (
                  <Td key={column.key} className={column.align === 'right' ? 'text-right' : undefined}>
                    <MasterCell value={row[column.key]} type={column.type} />
                  </Td>
                ))}
                {canManage ? (
                  <Td className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 ? (
          <EmptyState title={`No ${entityLabel.toLowerCase()} yet`} description={emptyDescription} />
        ) : null}
      </TableWrap>

      {editing ? (
        <MasterDialog
          row={editing === 'new' ? null : editing}
          fields={fields}
          action={action}
          entityLabel={entityLabel}
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

function MasterCell({ value, type }: { value: unknown; type?: MasterColumnConfig['type'] }) {
  if (type === 'boolean') {
    return value ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>
  }
  if (type === 'colour' && typeof value === 'string' && value) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="size-4 rounded border border-sand-300" style={{ background: value }} />
        <span className="font-mono text-xs text-ink-500">{value}</span>
      </span>
    )
  }
  if (type === 'mono') {
    return <span className="font-mono text-xs text-ink-500">{value ? String(value) : '—'}</span>
  }
  return <span>{value === null || value === undefined || value === '' ? '—' : String(value)}</span>
}

function MasterDialog({
  row,
  fields,
  action,
  entityLabel,
  onClose,
  onSaved,
}: {
  row: MasterRow | null
  fields: MasterFieldConfig[]
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>
  entityLabel: string
  onClose: () => void
  onSaved: () => void
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(action, { ok: false })

  useEffect(() => {
    if (state.ok) onSaved()
  }, [state, onSaved])

  const initial = (field: MasterFieldConfig) => {
    if (row && field.name in row) return row[field.name]
    return field.defaultValue ?? (field.type === 'checkbox' ? true : '')
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={row ? `Edit ${entityLabel.toLowerCase()}` : `Add ${entityLabel.toLowerCase()}`}
        className="max-w-xl"
      >
        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {row ? <input type="hidden" name="id" value={row.id} /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => {
              const value = initial(field)
              if (field.type === 'checkbox') {
                return (
                  <label
                    key={field.name}
                    className="col-span-full flex items-center gap-2 text-sm text-ink-700"
                  >
                    <input
                      type="checkbox"
                      name={field.name}
                      defaultChecked={Boolean(value)}
                      className="size-4 rounded border-sand-300"
                    />
                    {field.label}
                  </label>
                )
              }

              return (
                <Field
                  key={field.name}
                  label={field.label}
                  htmlFor={field.name}
                  hint={field.hint}
                  required={field.required}
                  className={field.full ? 'col-span-full' : undefined}
                >
                  {field.type === 'select' ? (
                    <Select id={field.name} name={field.name} defaultValue={value ? String(value) : ''}>
                      <option value="">Not set</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Select>
                  ) : field.type === 'textarea' ? (
                    <Textarea id={field.name} name={field.name} defaultValue={value ? String(value) : ''} />
                  ) : (
                    <Input
                      id={field.name}
                      name={field.name}
                      type={
                        field.type === 'number'
                          ? 'number'
                          : field.type === 'color'
                            ? 'color'
                            : field.type === 'date'
                              ? 'date'
                              : field.type === 'datetime'
                                ? 'datetime-local'
                                : 'text'
                      }
                      required={field.required}
                      defaultValue={value === null || value === undefined ? '' : String(value)}
                    />
                  )}
                </Field>
              )
            })}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <SaveButton label={`Save ${entityLabel.toLowerCase()}`} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
