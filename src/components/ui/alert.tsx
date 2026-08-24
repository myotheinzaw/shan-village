import * as React from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

const styles = {
  info: { box: 'bg-sky-50 border-sky-200 text-sky-900', Icon: Info },
  success: { box: 'bg-teal-50 border-teal-200 text-teal-900', Icon: CheckCircle2 },
  warning: { box: 'bg-amber-50 border-amber-200 text-amber-900', Icon: TriangleAlert },
  danger: { box: 'bg-red-50 border-red-200 text-red-900', Icon: AlertCircle },
} as const

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof styles
  title?: string
  children?: React.ReactNode
  className?: string
}) {
  const { box, Icon } = styles[tone]
  return (
    <div className={cn('flex gap-3 rounded-lg border p-3 text-sm', box, className)} role="status">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
      </div>
    </div>
  )
}
