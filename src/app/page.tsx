import { redirect } from 'next/navigation'
import { getCurrentUser, isStaffOnly } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  redirect(isStaffOnly(user) ? '/staff' : '/dashboard')
}
