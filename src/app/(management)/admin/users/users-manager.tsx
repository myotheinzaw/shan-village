'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { KeyRound, Mail, UserPlus } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { EmptyState, Table, TableWrap, Td, Th } from '@/components/ui/table'
import type { ActionResult } from '@/lib/actions/result'
import {
  createUserAccount,
  linkUserToEmployee,
  resetPasswordDirectly,
  sendPasswordReset,
  setUserActive,
  setUserRole,
  type UserActionResult,
} from './actions'

export interface UserRow {
  id: string
  email: string
  fullName: string
  isActive: boolean
  roleKey: string
  roleName: string
  employeeId: string | null
  employeeName: string | null
  lastSeenAt: string | null
}

export interface RoleOption {
  key: string
  name: string
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending}>{pending ? 'Working…' : label}</Button>
}

export function UsersManager({
  users,
  roles,
  employees,
  currentUserId,
}: {
  users: UserRow[]
  roles: RoleOption[]
  employees: { id: string; name: string; hasLogin: boolean }[]
  currentUserId: string
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState<UserActionResult | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<ActionResult | UserActionResult>) =>
    startTransition(async () => {
      const result = await fn()
      setFeedback(result)
      if (result.ok) router.refresh()
    })

  return (
    <div className="flex flex-col gap-4">
      {feedback?.error ? <Alert tone="danger">{feedback.error}</Alert> : null}
      {feedback?.ok && feedback.message ? (
        <Alert tone="success" title={feedback.message}>
          {feedback.temporaryPassword ? (
            <div className="mt-1">
              <p>
                Give this one-time password to the person now — it is shown once and is not stored
                anywhere:
              </p>
              <p className="mt-1 font-mono text-base font-semibold tracking-wide">
                {feedback.temporaryPassword}
              </p>
              <p className="mt-1 text-xs">Ask them to change it from Profile after signing in.</p>
            </div>
          ) : null}
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <UserPlus className="size-4" />
          Create user account
        </Button>
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Employee record</Th>
              <Th>Last seen</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-sand-50">
                <Td className="font-medium text-ink-900">
                  {user.fullName}
                  {user.id === currentUserId ? (
                    <Badge variant="muted" className="ml-2">You</Badge>
                  ) : null}
                </Td>
                <Td className="text-xs">{user.email}</Td>
                <Td>
                  <Select
                    className="h-8 max-w-44 py-1 text-xs"
                    value={user.roleKey}
                    disabled={pending}
                    aria-label={`Role for ${user.fullName}`}
                    onChange={(event) => run(() => setUserRole(user.id, event.target.value))}
                  >
                    {roles.map((role) => (
                      <option key={role.key} value={role.key}>{role.name}</option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <Select
                    className="h-8 max-w-52 py-1 text-xs"
                    value={user.employeeId ?? ''}
                    disabled={pending}
                    aria-label={`Employee record for ${user.fullName}`}
                    onChange={(event) =>
                      run(() => linkUserToEmployee(user.id, event.target.value || null))
                    }
                  >
                    <option value="">Not linked</option>
                    {employees
                      .filter((employee) => !employee.hasLogin || employee.id === user.employeeId)
                      .map((employee) => (
                        <option key={employee.id} value={employee.id}>{employee.name}</option>
                      ))}
                  </Select>
                </Td>
                <Td className="text-xs text-ink-500">
                  {user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleDateString('en-GB') : 'Never'}
                </Td>
                <Td>
                  {user.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="muted">Deactivated</Badge>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => sendPasswordReset(user.email))}
                      title="Send a reset link by email (requires email delivery on the Supabase project)"
                    >
                      <Mail className="size-4" />
                      Email reset
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Issue a new temporary password for ${user.fullName}?`)) {
                          run(() => resetPasswordDirectly(user.id))
                        }
                      }}
                    >
                      <KeyRound className="size-4" />
                      New password
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending || user.id === currentUserId}
                      onClick={() => run(() => setUserActive(user.id, !user.isActive))}
                    >
                      {user.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {users.length === 0 ? <EmptyState title="No user accounts yet" /> : null}
      </TableWrap>

      {creating ? (
        <CreateUserDialog
          roles={roles}
          employees={employees.filter((employee) => !employee.hasLogin)}
          onClose={() => setCreating(false)}
          onDone={(result) => {
            setFeedback(result)
            setCreating(false)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function CreateUserDialog({
  roles,
  employees,
  onClose,
  onDone,
}: {
  roles: RoleOption[]
  employees: { id: string; name: string }[]
  onClose: () => void
  onDone: (result: UserActionResult) => void
}) {
  const [state, action] = useActionState<UserActionResult, FormData>(createUserAccount, { ok: false })

  // Hand the one-time password back to the page, which shows it once.
  useEffect(() => {
    if (state.ok) onDone(state)
  }, [state, onDone])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Create a user account"
        description="The account is created with a one-time password shown to you once. No password is ever stored in this application."
      >
        <form action={action} className="flex flex-col gap-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <Field label="Full name" htmlFor="full_name" required>
            <Input id="full_name" name="full_name" required />
          </Field>

          <Field label="Email address" htmlFor="email" required>
            <Input id="email" name="email" type="email" required autoComplete="off" />
          </Field>

          <Field label="Role" htmlFor="role_key" required>
            <Select id="role_key" name="role_key" defaultValue="staff">
              {roles.map((role) => (
                <option key={role.key} value={role.key}>{role.name}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Link to employee record"
            htmlFor="employee_id"
            hint="Required before this person can see their roster or raise requests."
          >
            <Select id="employee_id" name="employee_id">
              <option value="">Not linked yet</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </Select>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <SubmitButton label="Create account" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
