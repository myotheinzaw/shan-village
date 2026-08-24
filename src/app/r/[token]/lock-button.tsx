'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Lock } from 'lucide-react'
import type { ActionResult } from '@/lib/actions/result'
import { lockRoster } from './actions'

const EMPTY: ActionResult = { ok: false }

/** Clears the unlock session on this phone — for a shared or borrowed device. */
export function LockButton({ token }: { token: string }) {
  const router = useRouter()
  const [state, lock, pending] = useActionState(lockRoster, EMPTY)

  useEffect(() => {
    if (state.ok) router.refresh()
  }, [state, router])

  return (
    <form action={lock}>
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-700 hover:bg-sand-100 disabled:opacity-50"
      >
        <Lock className="size-3" aria-hidden />
        {pending ? 'Locking…' : 'Lock this phone'}
      </button>
    </form>
  )
}
