'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input, Label } from '@/components/ui/field'

/** From/to date pickers that write straight into the URL. */
export function DateRangeFields({ from, to }: { from: string; to: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const update = (key: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-from">From</Label>
        <Input
          id="report-from"
          type="date"
          value={from}
          onChange={(event) => update('from', event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-to">To</Label>
        <Input
          id="report-to"
          type="date"
          value={to}
          onChange={(event) => update('to', event.target.value)}
        />
      </div>
    </>
  )
}
