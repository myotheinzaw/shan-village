'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string
  description?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand-200 bg-white shadow-xl',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-sand-200 p-4">
          <div>
            <DialogPrimitive.Title className="text-base font-semibold text-ink-900">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-sm text-ink-500">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="rounded-md p-1 text-ink-500 hover:bg-sand-100"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 flex flex-wrap justify-end gap-2', className)} {...props} />
}
