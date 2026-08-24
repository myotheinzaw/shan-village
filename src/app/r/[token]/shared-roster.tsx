'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { EmptyState, Table, TableWrap, Td, Th } from '@/components/ui/table'
import { ASSIGNMENT_STYLES } from '@/components/ui/status'
import { DAY_SHORT, formatHours } from '@/lib/roster/dates'
import { shareCellLabel } from '@/lib/roster/share'
import { cn } from '@/lib/utils'
import type { RosterShareRow } from '@/types/db'

interface Person {
  employeeId: string
  name: string
  position: string
  hours: number
  /** One entry per day of the week, null where the person is not rostered. */
  days: (RosterShareRow | null)[]
}

/**
 * The roster as the restaurant already reads it: people down, days across.
 *
 * The one interactive part is the name box. On a phone this table is wider than
 * the screen, and the first thing anybody does with a roster is look for their
 * own line — so typing two letters of a name collapses it to that line, and the
 * week fits without scrolling.
 */
export function SharedRoster({
  token,
  weekStart,
  weekLabel,
  dates,
  today,
  people,
  working,
  showHours,
  showNotes,
  canGoBack,
  canGoForward,
}: {
  token: string
  weekStart: string
  weekLabel: string
  dates: string[]
  today: string
  people: Person[]
  working: number[]
  showHours: boolean
  showNotes: boolean
  canGoBack: boolean
  canGoForward: boolean
}) {
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return people
    return people.filter(
      (person) =>
        person.name.toLowerCase().includes(needle) ||
        person.position.toLowerCase().includes(needle),
    )
  }, [people, search])

  const weekHref = (offsetWeeks: number) => {
    const base = new Date(`${weekStart}T00:00:00Z`)
    base.setUTCDate(base.getUTCDate() + offsetWeeks * 7)
    return `/r/${token}?week=${base.toISOString().slice(0, 10)}`
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            asChild={canGoBack}
            variant="outline"
            size="icon"
            aria-label="Previous week"
            disabled={!canGoBack}
          >
            {canGoBack ? (
              <Link href={weekHref(-1)}>
                <ChevronLeft aria-hidden />
              </Link>
            ) : (
              <ChevronLeft aria-hidden />
            )}
          </Button>

          <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <CalendarDays className="size-4 text-spice-600" aria-hidden />
            {weekLabel}
          </div>

          <Button
            asChild={canGoForward}
            variant="outline"
            size="icon"
            aria-label="Next week"
            disabled={!canGoForward}
          >
            {canGoForward ? (
              <Link href={weekHref(1)}>
                <ChevronRight aria-hidden />
              </Link>
            ) : (
              <ChevronRight aria-hidden />
            )}
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find your name"
            aria-label="Find your name on the roster"
            className="pl-9 pr-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-500 hover:bg-sand-100"
              aria-label="Clear"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <TableWrap>
        {people.length === 0 ? (
          <EmptyState
            title="This week is not published yet"
            description="The roster appears here as soon as the manager publishes it. Try the arrows for another week."
          />
        ) : shown.length === 0 ? (
          <EmptyState
            title={`Nobody matching “${search.trim()}”`}
            description="Check the spelling, or clear the box to see the whole team."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="sticky left-0 z-10 bg-sand-50">Name</Th>
                {dates.map((date, index) => (
                  <Th
                    key={date}
                    className={cn('text-center', date === today && 'bg-spice-50 text-spice-700')}
                  >
                    {DAY_SHORT[new Date(`${date}T00:00:00Z`).getUTCDay()]}
                    <span className="block text-[11px] font-normal normal-case">
                      {date.slice(8)}/{date.slice(5, 7)}
                    </span>
                    <span className="block text-[11px] font-normal normal-case text-ink-500">
                      {working[index]} on
                    </span>
                  </Th>
                ))}
                {showHours ? <Th className="text-right">Hours</Th> : null}
              </tr>
            </thead>
            <tbody>
              {shown.map((person) => (
                <tr key={person.employeeId}>
                  <Td className="sticky left-0 z-10 whitespace-nowrap bg-white">
                    <span className="font-medium text-ink-900">{person.name}</span>
                    {person.position ? (
                      <span className="block text-xs text-ink-500">{person.position}</span>
                    ) : null}
                  </Td>
                  {person.days.map((row, index) => (
                    <Td
                      key={dates[index]}
                      className={cn('text-center', dates[index] === today && 'bg-spice-50/60')}
                    >
                      {row ? (
                        <span
                          className={cn(
                            'inline-block rounded-md border px-2 py-1 text-xs font-medium',
                            ASSIGNMENT_STYLES[row.status],
                          )}
                        >
                          {shareCellLabel(row)}
                        </span>
                      ) : (
                        <span className="text-ink-500/50">·</span>
                      )}
                      {showNotes && row?.note ? (
                        <span className="mt-0.5 block text-[11px] text-ink-500">{row.note}</span>
                      ) : null}
                    </Td>
                  ))}
                  {showHours ? (
                    <Td className="text-right tabular-nums">{formatHours(person.hours)}</Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrap>

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <Badge variant="neutral">OFF</Badge>
        <Badge variant="info">Leave</Badge>
        <Badge variant="success">PH</Badge>
        <span>Times are the shift start and finish; 24:00 means midnight.</span>
      </div>
    </div>
  )
}
