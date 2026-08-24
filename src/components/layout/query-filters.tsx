'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select, Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/** A select that writes its value into the URL, so pages stay server-rendered. */
export function QuerySelect({
  name,
  label,
  value,
  options,
  allLabel = 'All',
  className,
}: {
  name: string
  label: string
  value: string
  options: { value: string; label: string }[]
  allLabel?: string
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  return (
    <Select
      aria-label={label}
      value={value}
      className={cn(className)}
      onChange={(event) => {
        const next = new URLSearchParams(params.toString())
        if (event.target.value) next.set(name, event.target.value)
        else next.delete(name)
        router.push(`${pathname}?${next.toString()}`)
      }}
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  )
}

/** A text box that writes into the URL on submit. */
export function QuerySearch({
  name,
  placeholder,
  defaultValue,
}: {
  name: string
  placeholder: string
  defaultValue: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const next = new URLSearchParams(params.toString())
        const value = String(form.get(name) ?? '').trim()
        if (value) next.set(name, value)
        else next.delete(name)
        router.push(`${pathname}?${next.toString()}`)
      }}
    >
      <Input name={name} placeholder={placeholder} defaultValue={defaultValue} aria-label={placeholder} />
    </form>
  )
}
