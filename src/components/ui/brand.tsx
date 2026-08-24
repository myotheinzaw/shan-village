import { cn } from '@/lib/utils'

/** The Shan Village mark: a simple bowl-and-steam glyph, drawn inline. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden focusable="false">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path
        d="M8 17h16a8 8 0 0 1-8 8 8 8 0 0 1-8-8Z"
        fill="#fff"
        fillOpacity="0.95"
      />
      <path
        d="M13 11c0-1.5 1.2-1.8 1.2-3.2M16 10.5c0-1.8 1.4-2.1 1.4-3.8M19 11c0-1.3 1-1.6 1-2.8"
        stroke="#fff"
        strokeOpacity="0.85"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export function BrandLockup({
  subtitle,
  className,
}: {
  subtitle?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <BrandMark className="size-9 text-spice-600" />
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight text-ink-900">SHAN VILLAGE</p>
        {subtitle ? <p className="text-[11px] uppercase tracking-wide text-ink-500">{subtitle}</p> : null}
      </div>
    </div>
  )
}
