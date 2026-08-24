import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { addDaysISO, formatLongDate } from '@/lib/roster/dates'
import type { Outlet } from '@/types/db'

/**
 * Day and outlet filter. A plain GET form with two arrow links: no client
 * component, and it keeps working on a manager's phone with a flaky connection.
 */
export function DayFilter({
  date,
  today,
  outletId,
  outlets,
}: {
  date: string
  today: string
  outletId: string | null
  outlets: Outlet[]
}) {
  const previous = addDaysISO(date, -1)
  const next = addDaysISO(date, 1)
  const href = (target: string) =>
    `/wastage?${new URLSearchParams({ date: target, ...(outletId ? { outlet: outletId } : {}) })}`

  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-2 rounded-[var(--radius-card)] border border-sand-200 bg-white p-3"
    >
      <Button asChild variant="outline" size="icon" aria-label="Previous day">
        <Link href={href(previous)}>
          <ChevronLeft aria-hidden />
        </Link>
      </Button>

      <label className="flex flex-col gap-1 text-xs font-medium text-ink-500">
        <span title={formatLongDate(date)}>Date</span>
        <input
          type="date"
          name="date"
          defaultValue={date}
          max={today}
          className="h-10 rounded-lg border border-sand-300 bg-white px-3 text-sm text-ink-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-ink-500">
        Outlet
        <Select name="outlet" defaultValue={outletId ?? ''} className="w-44">
          <option value="">All outlets</option>
          {outlets.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.name}
            </option>
          ))}
        </Select>
      </label>

      <Button type="submit" variant="secondary">
        Show
      </Button>

      <Button asChild variant="outline" size="icon" aria-label="Next day" className="ml-auto">
        <Link href={href(next)}>
          <ChevronRight aria-hidden />
        </Link>
      </Button>

      {date !== today ? (
        <Button asChild variant="ghost">
          <Link href={href(today)}>Today</Link>
        </Button>
      ) : null}
    </form>
  )
}
