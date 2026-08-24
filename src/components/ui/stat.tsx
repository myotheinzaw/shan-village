import Link from 'next/link'
import { cn } from '@/lib/utils'

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  href,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
  href?: string
}) {
  const tones = {
    neutral: 'text-ink-900',
    good: 'text-teal-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
  } as const

  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tones[tone])}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </>
  )

  const className = cn(
    'rounded-[var(--radius-card)] border border-sand-200 bg-white p-4 shadow-sm',
    href && 'transition-colors hover:border-spice-200 hover:bg-spice-50/40',
  )

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
