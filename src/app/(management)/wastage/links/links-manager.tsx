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
import type { WastageLink } from '@/types/db'
import { rotateWastageLink, saveWastageLink } from './actions'

const EMPTY: ActionResult = { ok: false }

interface Option {
  id: string
  name: string
}

export function LinksManager({
  links,
  outlets,
  baseUrl,
}: {
  links: WastageLink[]
  outlets: Option[]
  baseUrl: string
}) {
  const router = useRouter()
  const [saveState, save, saving] = useActionState(saveWastageLink, EMPTY)
  const [rotateState, rotate, rotating] = useActionState(rotateWastageLink, EMPTY)
  const [editing, setEditing] = useState<WastageLink | null>(null)
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

  const addressFor = (link: WastageLink) => `${baseUrl}/w/${link.token}`

  async function copy(link: WastageLink) {
    const address = addressFor(link)
    try {
      await navigator.clipboard.writeText(address)
      setCopied(link.id)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard permission refused; the address is on screen to copy by hand.
      setNotice({ ok: false, error: `Copy this address by hand: ${address}` })
    }
  }

  function startNew() {
    setEditing(null)
    setOpen(true)
  }

  function startEdit(link: WastageLink) {
    setEditing(link)
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
        {links.length === 0 ? (
          <EmptyState
            title="No submission links yet"
            description="Create one per outlet, then print each as a QR code."
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
                <Th className="text-right">Entries</Th>
                <Th>Last used</Th>
                <Th>State</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const expired = Boolean(link.expires_at && new Date(link.expires_at) < new Date())
                return (
                  <tr key={link.id}>
                    <Td className="font-medium text-ink-900">{link.label}</Td>
                    <Td>{outlets.find((o) => o.id === link.outlet_id)?.name ?? 'Any outlet'}</Td>
                    <Td>
                      <code className="rounded bg-sand-100 px-1.5 py-0.5 text-xs">
                        /w/{link.token.slice(0, 10)}…
                      </code>
                    </Td>
                    <Td className="text-right tabular-nums">{link.submission_count}</Td>
                    <Td className="whitespace-nowrap text-ink-500">
                      {link.last_used_at ? new Date(link.last_used_at).toLocaleString() : 'Never'}
                    </Td>
                    <Td>
                      {!link.is_active ? (
                        <Badge variant="muted">Revoked</Badge>
                      ) : expired ? (
                        <Badge variant="warning">Expired</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => copy(link)}>
                          <Copy aria-hidden />
                          {copied === link.id ? 'Copied' : 'Copy'}
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <a href={addressFor(link)} target="_blank" rel="noreferrer">
                            <ExternalLink aria-hidden />
                            Open
                          </a>
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(link)}>
                          <Pencil aria-hidden />
                          Edit
                        </Button>
                        <form action={rotate}>
                          <input type="hidden" name="id" value={link.id} />
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
        <DialogContent title={editing ? 'Edit link' : 'New submission link'}>
          <form action={save} className="flex flex-col gap-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <Field label="Name" htmlFor="label" required hint="Only management sees this.">
              <Input
                id="label"
                name="label"
                required
                maxLength={80}
                defaultValue={editing?.label ?? ''}
                placeholder="e.g. Mall kitchen — bin station"
              />
            </Field>

            <Field
              label="Outlet"
              htmlFor="outletId"
              hint="Fixing the outlet removes a question from the form."
            >
              <Select id="outletId" name="outletId" defaultValue={editing?.outlet_id ?? ''}>
                <option value="">Let the reporter choose</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Entries per hour"
              htmlFor="hourlyLimit"
              hint="A ceiling on this link. 0 removes the limit."
            >
              <Input
                id="hourlyLimit"
                name="hourlyLimit"
                type="number"
                min={0}
                max={1000}
                defaultValue={editing?.hourly_limit ?? 60}
              />
            </Field>

            <Field label="Expires" htmlFor="expiresAt" hint="Leave blank for a link that does not expire.">
              <Input
                id="expiresAt"
                name="expiresAt"
                type="date"
                defaultValue={editing?.expires_at ? editing.expires_at.slice(0, 10) : ''}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                name="requireName"
                defaultChecked={editing ? editing.require_name : true}
                className="size-4 rounded border-sand-300"
              />
              The reporter must give their name
            </label>

            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={editing ? editing.is_active : true}
                className="size-4 rounded border-sand-300"
              />
              Active — the address accepts entries
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
