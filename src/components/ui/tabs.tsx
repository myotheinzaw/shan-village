'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('flex flex-wrap gap-1 rounded-lg border border-sand-200 bg-white p-1', className)}
    {...props}
  />
))
TabsList.displayName = 'TabsList'

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'rounded-md px-3 py-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900 data-[state=active]:bg-spice-100 data-[state=active]:text-spice-700',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = 'TabsTrigger'

export const TabsContent = TabsPrimitive.Content
