import { StaffShell } from '@/components/layout/staff-shell'
import { requireUser } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import { getUnreadNotificationCount } from '@/lib/data/roster'

export const dynamic = 'force-dynamic'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const [settings, unread] = await Promise.all([getSettings(), getUnreadNotificationCount()])

  return (
    <StaffShell restaurantName={settings.restaurant_name} unreadCount={unread}>
      {children}
    </StaffShell>
  )
}
