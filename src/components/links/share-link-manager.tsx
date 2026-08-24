'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, ExternalLink, KeyRound, Pencil, Plus } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { EmptyState, Table, TableWrap, Td, Th } from '@/components/ui/table'
import type { ActionResult } from '@/lib/actions/result'

/**
 * The manager for a family of public, tokenised links — the wastage form and
 * the shared roster today, and anything else the restaurant wants to hand out
 * without a login later.
 *
 * Everything the two uses do not share is passed in declaratively, the same way
 * SimpleMaster works, so a server page can configure this without shipping
 * functions to the client.
 */

const EMPTY: ActionResult = { ok: false }

export interface ShareLinkRow {
  id: string
  label: string
  token: string
  outletId: string | null
  isActive: boolean
  expiresAt: string | null
  usageCount: number
  lastUsedAt: string | null
  /** A short second line under the name: whatever matters about this link. */
  detail?: string
  /** Values for the extra fields, keyed by field name. */
  values: Record<string, string | number | boolean>
}

export interface ShareLinkField {
  name: string
  label: string
  type: 'number' | 'checkbox'
  hint?: string
  defaultValue: string | number | boolean
  min?: number
  max?: number
}

export function ShareLinkManager({
  rows,
  outlets,
  baseUrl,
  pathPrefix,
  entityLabel,
  usageLabel,
  outletHint,
  anyOutletLabel,
  fields,
  saveAction,
  rotateAction,
  emptyDescription,
}: {
  rows: ShareLinkRow[]
  outlets: { id: string; name: string }[]
  baseUrl: string
  /** The public path segment, e.g. `w` for /w/<token>. */
  pathPrefix: string
  entityLabel: string
  usageLabel: string
  outletHint: string
  anyOutletLabel: string
  fields: ShareLinkField[]
  saveAction: (previous: ActionResult, form: FormData) => Promise<ActionResult>
  rotateAction: (previous: ActionResult, form: FormData) => Promise<ActionResult>
  emptyDescription: string
}) {
  const router = useRouter()
  const [saveState, save, saving] = useActionState(saveAction, EMPTY)
  const [rotateState, rotate, rotating] = useActionState(rotateAction, EMPTY)
  const [editing, setEditing] = useState<ShareLinkRow | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [notice, setNotice] = useState<ActionResult | null>(null)

  useEffect(() => {
    if (!saveState.message && !saveState.error) return
    setNotice(saveState)
    if (saveState.ok) {
      setOpen(false)
      setEditing(null)
      router.refresh()
    }
  }, [saveState, router])

  useEffect(() => {
    if (!rotateState.message && !rotateState.error) return
    setNotice(rotateState)
    if (rotateState.ok) router.refresh()
  }, [rotateState, router])

  const addressFor = (row: ShareLinkRow) => `${baseUrl}/${pathPrefix}/${row.token}`

  async function copy(row: ShareLinkRow) {
    const address = addressFor(row)
    try {
      await navigator.clipboard.writeText(address)
      setCopied(row.id)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard permission refused; put the address where it can be read.
      setNotice({ ok: false, error: `Copy this address by hand: ${address}` })
    }
  }

  function startNew() {
    setEditing(null)
    setOpen(true)
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button type="button" onClick={startNew}>
          <Plus aria-hidden />
          New link
        </Button>
      </div>

      {notice ? (
        <Alert tone={notice.ok ? 'success' : 'danger'} className="mb-3">
          {notice.message ?? notice.error}
        </Alert>
      ) : null}

      <TableWrap>
        {rows.length === 0 ? (
          <EmptyState
            title={`No ${entityLabel.toLowerCase()} links yet`}
            description={emptyDescription}
            action={
              <Button type="button" onClick={startNew}>
                <Plus aria-hidden />
                New link
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Outlet</Th>
                <Th>Address</Th>
                <Th className="text-right">{usageLabel}</Th>
                <Th>Last used</Th>
                <Th>State</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expired = Boolean(row.expiresAt && new Date(row.expiresAt) < new Date())
                return (
                  <tr key={row.id}>
                    <Td>
                      <span className="font-medium text-ink-900">{row.label}</span>
                      {row.detail ? (
                        <span className="block text-xs text-ink-500">{row.detail}</span>
                      ) : null}
                    </Td>
                    <Td>{outlets.find((o) => o.id === row.outletId)?.name ?? anyOutletLabel}</Td>
                    <Td>
                      <code className="rounded bg-sand-100 px-1.5 py-0.5 text-xs">
                        /{pathPrefix}/{row.token.slice(0, 10)}…
                      </code>
                    </Td>
                    <Td className="text-right tabular-nums">{row.usageCount}</Td>
                    <Td className="whitespace-nowrap text-ink-500">
                      {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : 'Never'}
                    </Td>
                    <Td>
                      {!row.isActive ? (
                        <Badge variant="muted">Revoked</Badge>
                      ) : expired ? (
                        <Badge variant="warning">Expired</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => copy(row)}>
                          <Copy aria-hidden />
                          {copied === row.id ? 'Copied' : 'Copy'}
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <a href={addressFor(row)} target="_blank" rel="noreferrer">
                            <ExternalLink aria-hidden />
                            Open
                          </a>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(row)
                            setOpen(true)
                          }}
                        >
                          <Pencil aria-hidden />
                          Edit
                        </Button>
                        <form action={rotate}>
                          <input type="hidden" name="id" value={row.id} />
                          <Button type="submit" size="sm" variant="ghost" disabled={rotating}>
                            <KeyRound aria-hidden />
                            New address
                          </Button>
                        </form>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </TableWrap>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={editing ? 'Edit link' : `New ${entityLabel.toLowerCase()} link`}>
          <form action={save} className="flex flex-col gap-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <Field label="Name" htmlFor="label" required hint="Only management sees this.">
              <Input
                id="label"
                name="label"
                required
                maxLength={80}
                defaultValue={editing?.label ?? ''}
                placeholder="e.g. Mall kitchen — by the time clock"
              />
            </Field>

            <Field label="Outlet" htmlFor="outletId" hint={outletHint}>
              <Select id="outletId" name="outletId" defaultValue={editing?.outletId ?? ''}>
                <option value="">{anyOutletLabel}</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </Select>
            </Field>

            {fields.map((field) => {
              const value = editing ? editing.values[field.name] : field.defaultValue
              return field.type === 'checkbox' ? (
                <label key={field.name} className="flex items-start gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    name={field.name}
                    defaultChecked={Boolean(value)}
                    className="mt-0.5 size-4 rounded border-sand-300"
                  />
                  <span>
                    {field.label}
                    {field.hint ? (
                      <span className="block text-xs text-ink-500">{field.hint}</span>
                    ) : null}
                  </span>
                </label>
              ) : (
                <Field key={field.name} label={field.label} htmlFor={field.name} hint={field.hint}>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="number"
                    min={field.min}
                    max={field.max}
                    defaultValue={String(value ?? '')}
                  />
                </Field>
              )
            })}

            <Field label="Expires" htmlFor="expiresAt" hint="Leave blank for a link that does not expire.">
              <Input
                id="expiresAt"
                name="expiresAt"
                type="date"
                defaultValue={editing?.expiresAt ? editing.expiresAt.slice(0, 10) : ''}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={editing ? editing.isActive : true}
                className="size-4 rounded border-sand-300"
              />
              Active — the address works
            </label>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save link' : 'Create link'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
