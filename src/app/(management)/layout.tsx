import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { isStaffOnly, requireUser } from '@/lib/auth/session'
import { visibleNavigation } from '@/lib/navigation'
import { getSettings } from '@/lib/settings'
import { getUnreadNotificationCount } from '@/lib/data/roster'

export const dynamic = 'force-dynamic'

function roleLabel(roleKeys: string[], isAdmin: boolean): string {
  if (isAdmin) return 'Owner / Admin'
  if (roleKeys.includes('roster_manager')) return 'Roster Manager'
  return 'Staff'
}

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  // Someone with no management permission at all belongs in the staff app.
  // Their data is protected by RLS either way; this is about giving them the
  // simple experience the brief asks for rather than an empty dashboard.
  if (isStaffOnly(user)) redirect('/staff')

  const [settings, unread] = await Promise.all([getSettings(), getUnreadNotificationCount()])

  return (
    <AppShell
      sections={visibleNavigation(user)}
      userName={user.profile.full_name || user.email}
      roleLabel={roleLabel(user.roleKeys, user.isAdmin)}
      unreadCount={unread}
      restaurantName={settings.restaurant_name}
    >
      {children}
    </AppShell>
  )
}
