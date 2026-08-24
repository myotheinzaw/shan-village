'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { Table, TableWrap, Td, Th } from '@/components/ui/table'
import type { ActionResult } from '@/lib/actions/result'
import { setAccessCode } from './code-actions'

const EMPTY: ActionResult = { ok: false }

export interface AccessCodeRow {
  role: 'OWNER' | 'ADMIN' | 'CHEF'
  label: string
  hint: string
  canViewChangeLog: boolean
  useCount: number
  lastUsedAt: string | null
}

/**
 * The three codes.
 *
 * Only the hint is shown, because only the hash is stored: a code cannot be
 * looked up here, or anywhere. A forgotten code is replaced, which is the same
 * thing you would want to do with a code somebody has forgotten in public.
 */
export function AccessCodes({ codes }: { codes: AccessCodeRow[] }) {
  const router = useRouter()
  const [state, save, saving] = useActionState(setAccessCode, EMPTY)
  const [editing, setEditing] = useState<AccessCodeRow | null>(null)
  const [notice, setNotice] = useState<ActionResult | null>(null)

  useEffect(() => {
    if (!state.message && !state.error) return
    setNotice(state)
    if (state.ok) {
      setEditing(null)
      router.refresh()
    }
  }, [state, router])

  return (
    <section className="mt-8">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
        <KeyRound className="size-4" aria-hidden />
        Access codes
      </h2>
      <p className="mb-3 text-sm text-ink-500">
        One code per role, shared by everyone who holds it. The only thing the role decides is
        whether the Change Log is readable — Owner and Admin see it, Chef does not. A code opens a
        roster for twelve hours on the phone that entered it.
      </p>

      {notice ? (
        <Alert tone={notice.ok ? 'success' : 'danger'} className="mb-3">
          {notice.message ?? notice.error}
        </Alert>
      ) : null}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Role</Th>
              <Th>Code</Th>
              <Th>Change Log</Th>
              <Th className="text-right">Times used</Th>
              <Th>Last used</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code.role}>
                <Td className="font-medium text-ink-900">{code.label}</Td>
                <Td>
                  <code className="rounded bg-sand-100 px-1.5 py-0.5 text-xs">{code.hint}</code>
                </Td>
                <Td>
                  {code.canViewChangeLog ? (
                    <Badge variant="success">Can read it</Badge>
                  ) : (
                    <Badge variant="muted">Roster only</Badge>
                  )}
                </Td>
                <Td className="text-right tabular-nums">{code.useCount}</Td>
                <Td className="whitespace-nowrap text-ink-500">
                  {code.lastUsedAt ? new Date(code.lastUsedAt).toLocaleString() : 'Never'}
                </Td>
                <Td>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(code)}>
                    <KeyRound aria-hidden />
                    Change code
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent title={editing ? `Change the ${editing.label} code` : 'Change the code'}>
          <form action={save} className="flex flex-col gap-4">
            <input type="hidden" name="role" value={editing?.role ?? ''} />

            <Alert tone="warning">
              Write the new code down before you save. It is stored as a one-way hash, so nobody —
              including this screen — can read it back. Everyone currently using the old{' '}
              {editing?.label.toLowerCase()} code will be locked out at once.
            </Alert>

            <Field
              label="New code"
              htmlFor="code"
              required
              hint="At least 8 characters, no spaces. Something staff can type on a phone."
            >
              <Input
                id="code"
                name="code"
                required
                minLength={8}
                maxLength={64}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="ShanChef-8264"
              />
            </Field>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save new code'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
