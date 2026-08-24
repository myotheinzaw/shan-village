import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { BrandLockup } from '@/components/ui/brand'
import { Badge } from '@/components/ui/badge'
import { createSupabaseAnonClient } from '@/lib/supabase/public'
import { formatWeekLabel, weekDates } from '@/lib/roster/dates'
import { groupByPerson, resolveWeek, shareWindow, workingByDate } from '@/lib/roster/share'
import type { RosterShareRow } from '@/types/db'
import { ChangeLog, type ChangeLogEntry } from './change-log'
import { LockButton } from './lock-button'
import { SharedRoster } from './shared-roster'
import { UnlockForm } from './unlock-form'
import { shareCookieName } from './share-session'

/**
 * The public duty roster.
 *
 * No login and no app shell: a QR code by the time clock, opened on a phone
 * mid-shift. Behind an access code, and even then it shows only what the staff
 * app shows — published weeks, names, positions and shifts.
 *
 * Nothing on this page decides what may be seen. The link token and the session
 * are handed to the database, and the functions there return what that pairing
 * is entitled to; if the cookie is edited, the answer is simply nothing.
 */

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Duty Roster',
  robots: { index: false, follow: false },
}

interface ResolvedLink {
  link_id: string
  label: string
  outlet_id: string | null
  outlet_name: string | null
  restaurant_name: string
  timezone: string
  week_start_day: number
  weeks_back: number
  weeks_ahead: number
  show_hours: boolean
  show_notes: boolean
  require_code: boolean
  today: string
}

interface ResolvedSession {
  role: string
  label: string
  can_view_change_log: boolean
}

export default async function PublicRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ week?: string }>
}) {
  const { token } = await params
  const { week } = await searchParams
  const supabase = createSupabaseAnonClient()

  const { data } = await supabase.rpc('roster_link_resolve', { p_token: token }).maybeSingle()
  const link = data as ResolvedLink | null
  if (!link) notFound()

  const store = await cookies()
  const sessionToken = store.get(shareCookieName(token))?.value ?? null

  const { data: sessionData } = sessionToken
    ? await supabase
        .rpc('roster_session_resolve', { p_token: token, p_session: sessionToken })
        .maybeSingle()
    : { data: null }
  const session = sessionData as ResolvedSession | null

  const header = (
    <header className="flex items-center justify-between gap-3 border-b border-sand-200 bg-white px-4 py-3">
      <BrandLockup subtitle="Duty roster" />
      <div className="flex items-center gap-2">
        {link.outlet_name ? (
          <span className="rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-medium text-ink-700">
            {link.outlet_name}
          </span>
        ) : null}
        {session ? <Badge variant="primary">{session.label}</Badge> : null}
      </div>
    </header>
  )

  // The lock. The database refuses the data regardless of what this page does;
  // returning early is about showing a code box rather than an empty roster.
  if (link.require_code && !session) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col bg-sand-50">
        {header}
        <UnlockForm token={token} label={link.label} />
        <footer className="px-4 py-6 text-center text-xs text-ink-500">
          {link.restaurant_name}
        </footer>
      </main>
    )
  }

  const window = shareWindow(link.today, link.week_start_day, link.weeks_back, link.weeks_ahead)
  const weekStart = resolveWeek(week, link.today, link.week_start_day, window)
  const dates = weekDates(weekStart)

  const { data: rowData } = await supabase.rpc('roster_share_week', {
    p_token: token,
    p_week_start: weekStart,
    p_session: sessionToken,
  })
  const rows = (rowData ?? []) as RosterShareRow[]

  const { data: logData } = session?.can_view_change_log
    ? await supabase.rpc('roster_share_change_log', {
        p_token: token,
        p_session: sessionToken,
        p_limit: 50,
      })
    : { data: null }
  const changes = (logData ?? []) as ChangeLogEntry[]

  const working = workingByDate(rows, dates)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col bg-sand-50">
      {header}

      <SharedRoster
        token={token}
        weekStart={weekStart}
        weekLabel={formatWeekLabel(weekStart)}
        dates={dates}
        today={link.today}
        people={groupByPerson(rows).map((person) => ({
          employeeId: person.employeeId,
          name: person.name,
          position: person.position,
          hours: person.hours,
          days: dates.map((date) => person.byDate.get(date) ?? null),
        }))}
        working={dates.map((date) => working.get(date) ?? 0)}
        showHours={link.show_hours}
        showNotes={link.show_notes}
        canGoBack={weekStart > window.first}
        canGoForward={weekStart < window.last}
      />

      {session?.can_view_change_log ? (
        <div className="px-3 pb-2 sm:px-4">
          <ChangeLog entries={changes} />
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center justify-center gap-3 px-4 py-6 text-center text-xs text-ink-500">
        <span>
          {link.restaurant_name} · {link.label} · published roster only
        </span>
        {session ? <LockButton token={token} /> : null}
      </footer>
    </main>
  )
}
