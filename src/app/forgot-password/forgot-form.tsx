'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { requestPasswordReset, type AuthFormState } from '../login/actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Sending…' : 'Send reset link'}
    </Button>
  )
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(requestPasswordReset, {})

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <Field label="Email address" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <SubmitButton />
    </form>
  )
}
