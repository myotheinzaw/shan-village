'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { updatePassword, type AuthFormState } from '../login/actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Saving…' : 'Save new password'}
    </Button>
  )
}

export function ResetPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(updatePassword, {})

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="New password" htmlFor="password" hint="At least 10 characters." required>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" required>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton />
    </form>
  )
}
