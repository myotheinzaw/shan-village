'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, CalendarDays, House, Inbox, User } from 'lucide-react'
import { BrandMark } from '@/components/ui/brand'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/staff', label: 'Home', Icon: House, exact: true },
  { href: '/staff/roster', label: 'Roster', Icon: CalendarDays },
  { href: '/staff/requests', label: 'Requests', Icon: Inbox },
  { href: '/staff/profile', label: 'Profile', Icon: User },
]

/**
 * The staff experience: a four-tab app, not a management console. Everything a
 * staff member cannot do is simply absent — and refused by the database if the
 * URL is typed by hand.
 */
export function StaffShell({
  restaurantName,
  unreadCount,
  children,
}: {
  restaurantName: string
  unreadCount: number
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-dvh bg-sand-50 pb-20">
      <header className="sticky top-0 z-30 border-b border-sand-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <BrandMark className="size-8" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-ink-900">SHAN VILLAGE</p>
            <p className="text-[11px] text-ink-500">{restaurantName}</p>
          </div>
          <Link
            href="/notifications"
            className="relative ml-auto rounded-lg p-2 text-ink-700 hover:bg-sand-100"
            aria-label="Notifications"
          >
            <Bell className="size-5" />
            {unreadCount > 0 ? (
              <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-spice-600 text-[10px] font-semibold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-4">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-200 bg-white pb-[env(safe-area-inset-bottom)]"
        aria-label="Staff"
      >
        <div className="mx-auto flex max-w-3xl">
          {TABS.map(({ href, label, Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-spice-600' : 'text-ink-500 hover:text-ink-900',
                )}
              >
                <Icon className={cn('size-5', active && 'stroke-[2.5]')} />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
