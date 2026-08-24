import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/table'
import { isStaffOnly, requireUser } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Notification } from '@/types/db'

export const metadata = { title: 'Notifications' }
export const dynamic = 'force-dynamic'

async function markAllRead() {
  'use server'
  const supabase = await createSupabaseServerClient()
  await supabase.rpc('mark_notifications_read', { p_ids: null })
  redirect('/notifications')
}

export default async function NotificationsPage() {
  const user = await requireUser()
  const supabase = await createSupabaseServerClient()

  const { data } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  const notifications = (data ?? []) as Notification[]
  const unread = notifications.filter((n) => !n.read_at).length
  const backHref = isStaffOnly(user) ? '/staff' : '/dashboard'

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Notifications</h1>
          <p className="text-sm text-ink-500">
            {unread > 0 ? `${unread} unread` : 'Everything is read'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href={backHref}>Back</Link>
          </Button>
          {unread > 0 ? (
            <form action={markAllRead}>
              <Button type="submit" variant="secondary">Mark all read</Button>
            </form>
          ) : null}
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card>
          <EmptyState
            title="No notifications yet"
            description="Roster publications, request decisions and manager comments appear here."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Card className={notification.read_at ? undefined : 'border-spice-200 bg-spice-50/40'}>
                <CardContent className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 rounded-lg bg-sand-100 p-2 text-ink-700">
                    <Bell className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink-900">{notification.title}</p>
                      {notification.priority === 'HIGH' ? <Badge variant="warning">Important</Badge> : null}
                      {!notification.read_at ? <Badge variant="primary">New</Badge> : null}
                    </div>
                    {notification.body ? (
                      <p className="mt-0.5 text-sm text-ink-700">{notification.body}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-ink-500">
                      {new Date(notification.created_at).toLocaleString('en-GB')}
                    </p>
                  </div>
                  {notification.link ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={notification.link}>Open</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
