import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * The Shan Village mark — the restaurant's own round logo.
 *
 * A bitmap rather than an inline SVG because this is the real artwork, not an
 * approximation of it: the striped hut, the gold ridges and the gradient on the
 * SV monogram do not survive being redrawn by hand. It is served from /public
 * and sized by the caller, so a phone never fetches the 512px file for a 36px
 * slot.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={512}
      height={512}
      priority
      className={cn('size-8 rounded-full object-contain', className)}
    />
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
      <BrandMark className="size-9" />
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight text-ink-900">SHAN VILLAGE</p>
        {subtitle ? <p className="text-[11px] uppercase tracking-wide text-ink-500">{subtitle}</p> : null}
      </div>
    </div>
  )
}
