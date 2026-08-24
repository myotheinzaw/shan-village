'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import type { ActionResult } from '@/lib/actions/result'
import { unlockRoster } from './actions'

const EMPTY: ActionResult = { ok: false }

/** The lock screen. One field, one button, and no hint about what went wrong. */
export function UnlockForm({ token, label }: { token: string; label: string }) {
  const router = useRouter()
  const [state, unlock, pending] = useActionState(unlockRoster, EMPTY)

  useEffect(() => {
    if (state.ok) router.refresh()
  }, [state, router])

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <form
        action={unlock}
        className="flex w-full max-w-sm flex-col gap-4 rounded-[var(--radius-card)] border border-sand-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="token" value={token} />

        <div className="flex flex-col items-center gap-2 text-center">
          <span className="rounded-full bg-spice-50 p-3 text-spice-600">
            <KeyRound className="size-6" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold text-ink-900">Duty roster</h1>
          <p className="text-sm text-ink-500">
            {label}. Enter the access code your manager gave you.
          </p>
        </div>

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field label="Access code" htmlFor="code" required>
          <Input
            id="code"
            name="code"
            required
            maxLength={64}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ShanChef-0000"
            className="text-center tracking-wide"
          />
        </Field>

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? 'Checking…' : 'Open the roster'}
        </Button>

        <p className="text-center text-xs text-ink-500">
          The code stays valid on this phone for 12 hours.
        </p>
      </form>
    </div>
  )
}
