import * as React from 'react'
import { cn } from '@/lib/utils'

export function TableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto rounded-[var(--radius-card)] border border-sand-200 bg-white',
        className,
      )}
      {...props}
    />
  )
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full min-w-max border-collapse text-sm', className)} {...props} />
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'border-b border-sand-200 bg-sand-50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-500',
        className,
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-sand-100 px-3 py-2.5 align-middle', className)} {...props} />
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-ink-700">{title}</p>
      {description ? <p className="max-w-md text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
