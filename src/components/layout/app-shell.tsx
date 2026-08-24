'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, LogOut, Menu, X } from 'lucide-react'
import { BrandLockup } from '@/components/ui/brand'
import { Button } from '@/components/ui/button'
import { NavLink } from './nav-link'
import type { NavSection } from '@/lib/navigation'
import { cn, initials } from '@/lib/utils'

export function AppShell({
  sections,
  userName,
  roleLabel,
  unreadCount,
  restaurantName,
  children,
}: {
  sections: NavSection[]
  userName: string
  roleLabel: string
  unreadCount: number
  restaurantName: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  const nav = (
    <nav className="flex flex-col gap-5" aria-label="Main">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            {section.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                exact={item.exact}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="min-h-dvh bg-sand-50">
      <header className="sticky top-0 z-30 border-b border-sand-200 bg-white/90 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>

          <Link href="/dashboard" className="flex items-center">
            <BrandLockup subtitle={restaurantName} />
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" asChild aria-label="Notifications">
              <Link href="/notifications" className="relative">
                <Bell className="size-5" />
                {unreadCount > 0 ? (
                  <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-spice-600 text-[10px] font-semibold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </Link>
            </Button>

            <Link
              href="/staff/profile"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sand-100"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-spice-100 text-xs font-semibold text-spice-700">
                {initials(userName)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-medium text-ink-900">{userName}</span>
                <span className="block text-[11px] text-ink-500">{roleLabel}</span>
              </span>
            </Link>

            <form action="/api/sign-out" method="post">
              <Button variant="ghost" size="icon" type="submit" aria-label="Sign out">
                <LogOut className="size-5" />
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px]">
        <aside
          className={cn(
            'fixed inset-y-14 left-0 z-20 w-64 shrink-0 overflow-y-auto border-r border-sand-200 bg-white p-3 transition-transform lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:translate-x-0',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {nav}
        </aside>

        {open ? (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10 bg-ink-900/30 lg:hidden"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
