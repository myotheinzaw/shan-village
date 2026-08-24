'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import type { ActionResult } from '@/lib/actions/result'
import { changeMyPassword, updateMyProfile } from './actions'

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : label}</Button>
}

export function ProfileNameForm({ fullName }: { fullName: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(updateMyProfile, { ok: false })
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <Field label="Display name" htmlFor="full_name" required>
        <Input id="full_name" name="full_name" defaultValue={fullName} required />
      </Field>
      <div>
        <Save label="Save details" />
      </div>
    </form>
  )
}

export function PasswordForm() {
  const [state, action] = useActionState<ActionResult, FormData>(changeMyPassword, { ok: false })
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <Field label="New password" htmlFor="password" hint="At least 10 characters." required>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" required>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <div>
        <Save label="Change password" />
      </div>
    </form>
  )
}
