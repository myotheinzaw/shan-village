import { LogOut } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/session'
import { getOutlets, getPositions } from '@/lib/data/roster'
import { DAY_NAMES } from '@/lib/roster/dates'
import { PasswordForm, ProfileNameForm } from './profile-forms'

export const metadata = { title: 'My Profile' }
export const dynamic = 'force-dynamic'

export default async function StaffProfilePage() {
  const user = await requireUser()
  const [positions, outlets] = await Promise.all([getPositions(true), getOutlets()])

  const position = positions.find((p) => p.id === user.employee?.position_id)
  const outlet = outlets.find((o) => o.id === user.employee?.outlet_id)

  const rows: [string, string][] = [
    ['Employee ID', user.employee?.employee_code ?? '—'],
    ['Full name', user.employee?.full_name ?? '—'],
    ['Position', position?.name ?? '—'],
    ['Outlet', outlet?.name ?? '—'],
    ['Employment', user.employee?.employment_status.replace('_', ' ').toLowerCase() ?? '—'],
    ['Joined', user.employee?.join_date ?? '—'],
    ['Mobile', user.employee?.mobile ?? '—'],
    ['Email', user.email],
    [
      'Preferred OFF day',
      user.employee?.preferred_off_day === null || user.employee?.preferred_off_day === undefined
        ? '—'
        : (DAY_NAMES[user.employee.preferred_off_day] ?? '—'),
    ],
  ]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">My Profile</h1>
        <p className="text-sm text-ink-500">
          Your details as the restaurant office holds them. Ask the office to correct anything that
          is wrong.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Employee details</CardTitle>
          <Badge variant={user.isAdmin ? 'primary' : 'neutral'}>
            {user.isAdmin ? 'Owner / Admin' : user.roleKeys.includes('roster_manager') ? 'Roster Manager' : 'Staff'}
          </Badge>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-sand-100 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 py-2">
                <dt className="text-ink-500">{label}</dt>
                <dd className="text-right font-medium text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display name</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileNameForm fullName={user.profile.full_name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <form action="/api/sign-out" method="post">
        <Button type="submit" variant="outline" size="lg" className="w-full">
          <LogOut className="size-4" />
          Sign out
        </Button>
      </form>
    </div>
  )
}
