import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-sand-100 text-ink-700 border border-sand-200',
        primary: 'bg-spice-100 text-spice-700 border border-spice-200',
        success: 'bg-teal-50 text-teal-700 border border-teal-200',
        warning: 'bg-amber-50 text-amber-800 border border-amber-200',
        danger: 'bg-red-50 text-red-700 border border-red-200',
        info: 'bg-sky-50 text-sky-700 border border-sky-200',
        muted: 'bg-transparent text-ink-500 border border-sand-200',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
