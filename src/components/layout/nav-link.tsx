'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function NavLink({
  href,
  label,
  exact,
  onNavigate,
}: {
  href: string
  label: string
  exact?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'block rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-spice-100 font-semibold text-spice-700'
          : 'text-ink-700 hover:bg-sand-100 hover:text-ink-900',
      )}
    >
      {label}
    </Link>
  )
}
